import { getDb } from '@/lib/db';
import { parseBracketData } from '@/lib/bracketData';
import { fetchCompletedMatches, fetchGroupStandings, type CompletedMatch } from '@/lib/espnSync';
import { generateKnockoutBracket, getFeederMatchupIds } from '@/lib/knockoutBracket';
import { determineBestThirdPlace, isGroupStageComplete } from '@/lib/bestThirdPlace';
import type { TournamentResults, GroupStageResults } from '@/types';

interface SyncResult {
  ok: boolean;
  updated: number;
  groupMatchesAdded: number;
  knockoutWinnersAdded: number;
  groupStageCompleted: boolean;
  skipped?: boolean;
  age?: number;
}

const DEBOUNCE_SECONDS = 60;

interface ResultsWithMeta extends TournamentResults {
  /** Per-group completed match scores. cardEvents (yellow/red bookings) are
   *  attached so the live-standings tiebreaker can compute Fair Play points. */
  groupMatches?: Record<string, Array<{
    teamA: string;
    teamB: string;
    scoreA: number;
    scoreB: number;
    espnId: string;
    date: string;
    cardEvents?: Array<{ teamId: number; athleteId: number; kind: 'yellow' | 'red' }>;
  }>>;
}

let syncInProgress = false;

/**
 * Pull recent ESPN data and write completed matches into tournament.results_data.
 * Debounced — won't run if results were updated within the last DEBOUNCE_SECONDS.
 */
export async function syncEspnResults(): Promise<SyncResult> {
  if (syncInProgress) {
    return { ok: true, updated: 0, groupMatchesAdded: 0, knockoutWinnersAdded: 0, groupStageCompleted: false, skipped: true };
  }
  syncInProgress = true;

  try {
    const db = getDb();
    const row = db.prepare(
      'SELECT id, bracket_data, results_data, results_updated_at FROM tournaments ORDER BY year DESC LIMIT 1',
    ).get() as { id: string; bracket_data: string; results_data: string | null; results_updated_at: string | null } | undefined;

    if (!row) {
      return { ok: false, updated: 0, groupMatchesAdded: 0, knockoutWinnersAdded: 0, groupStageCompleted: false };
    }

    // Debounce
    if (row.results_updated_at) {
      const age = (Date.now() - new Date(row.results_updated_at + 'Z').getTime()) / 1000;
      if (age < DEBOUNCE_SECONDS) {
        return { ok: true, updated: 0, groupMatchesAdded: 0, knockoutWinnersAdded: 0, groupStageCompleted: false, skipped: true, age: Math.round(age) };
      }
    }

    const bracketData = parseBracketData(row.bracket_data);
    if (!bracketData.groups?.length) {
      return { ok: false, updated: 0, groupMatchesAdded: 0, knockoutWinnersAdded: 0, groupStageCompleted: false };
    }

    const existing: ResultsWithMeta = row.results_data ? JSON.parse(row.results_data) : {};
    existing.groupMatches ??= {};
    existing.knockout ??= {};

    const completed = await fetchCompletedMatches(bracketData, 30);

    let groupMatchesAdded = 0;
    let knockoutWinnersAdded = 0;

    // Track per-group already-recorded matches to avoid duplicates
    const groupMatchKey = (gn: string, tA: string, tB: string) =>
      `${gn}|${[tA, tB].sort().join('|')}`;
    const seenGroupMatches = new Set<string>();
    for (const [gn, matches] of Object.entries(existing.groupMatches)) {
      for (const m of matches) seenGroupMatches.add(groupMatchKey(gn, m.teamA, m.teamB));
    }

    // Build a quick lookup so we can backfill cardEvents on already-recorded
    // matches (matches synced before the FP feature shipped won't have them).
    const recordedMatchByKey = new Map<string, { cardEvents?: Array<{ teamId: number; athleteId: number; kind: 'yellow' | 'red' }> }>();
    for (const [gn, matches] of Object.entries(existing.groupMatches)) {
      for (const mm of matches) recordedMatchByKey.set(groupMatchKey(gn, mm.teamA, mm.teamB), mm);
    }
    let cardEventsBackfilled = 0;

    for (const m of completed) {
      if (m.isGroup && m.groupName) {
        const k = groupMatchKey(m.groupName, m.teamA, m.teamB);
        if (seenGroupMatches.has(k)) {
          // Already recorded — backfill cardEvents if we didn't have them yet.
          const recorded = recordedMatchByKey.get(k);
          if (recorded && !recorded.cardEvents && m.cardEvents) {
            recorded.cardEvents = m.cardEvents;
            cardEventsBackfilled++;
          }
          continue;
        }
        seenGroupMatches.add(k);
        existing.groupMatches[m.groupName] ??= [];
        existing.groupMatches[m.groupName].push({
          teamA: m.teamA,
          teamB: m.teamB,
          scoreA: m.scoreA,
          scoreB: m.scoreB,
          espnId: m.espnId,
          date: m.date,
          cardEvents: m.cardEvents,
        });
        groupMatchesAdded++;
      } else if (m.knockoutRound && m.winner) {
        // For knockout, we need a matchId. We can find which match this is by
        // looking at the existing knockoutBracket and matching the teams.
        const matchId = findKnockoutMatchId(m, existing);
        if (matchId && !existing.knockout[matchId]) {
          existing.knockout[matchId] = m.winner;
          knockoutWinnersAdded++;
        }
      }
    }

    // Check if group stage is now complete and finalize standings
    let groupStageCompleted = false;
    if (!existing.groupStage) {
      // Try ESPN standings to check completion (more reliable than match counts)
      try {
        const standings = await fetchGroupStandings(bracketData);
        if (standings.length === 12 && isGroupStageComplete(standings)) {
          const groupResults = standings.map((gt) => ({
            groupName: gt.groupName,
            order: gt.standings.map((s) => s.team) as [string, string, string, string],
          }));
          const advancingThirdPlace = determineBestThirdPlace(standings);
          const gsResults: GroupStageResults = { groupResults, advancingThirdPlace };
          const knockoutBracket = generateKnockoutBracket(gsResults, bracketData);
          existing.groupStage = gsResults;
          existing.knockoutBracket = knockoutBracket;
          groupStageCompleted = true;
        }
      } catch {
        // Standings unavailable — keep going with whatever we have
      }
    }

    const updated = groupMatchesAdded + knockoutWinnersAdded + (groupStageCompleted ? 1 : 0) + cardEventsBackfilled;
    if (updated > 0) {
      db.prepare(
        "UPDATE tournaments SET results_data = ?, results_updated_at = datetime('now') WHERE id = ?",
      ).run(JSON.stringify(existing), row.id);
    } else {
      // Bump the timestamp to debounce future calls even when nothing changed
      db.prepare(
        "UPDATE tournaments SET results_updated_at = datetime('now') WHERE id = ?",
      ).run(row.id);
    }

    return { ok: true, updated, groupMatchesAdded, knockoutWinnersAdded, groupStageCompleted };
  } finally {
    syncInProgress = false;
  }
}

/** Find which knockout match ID a completed match corresponds to. */
function findKnockoutMatchId(m: CompletedMatch, existing: ResultsWithMeta): string | null {
  const matchups = existing.knockoutBracket;
  if (!matchups) return null;
  // Round prefix and propagation: find a matchup in the right round whose teamA/teamB
  // (resolved through prior winners) match these two teams.
  const roundIdxMap: Record<string, number> = { R32: 0, R16: 1, QF: 2, SF: 3, '3RD': 4, FINAL: 5 };
  const targetRound = roundIdxMap[m.knockoutRound ?? ''] ?? -1;
  if (targetRound < 0) return null;

  // Resolve current teamA/teamB for each matchup in the target round, given existing knockout winners
  for (const matchup of matchups) {
    if (matchup.round !== targetRound) continue;
    const [resA, resB] = resolveMatchupTeams(matchup.id, matchups, existing.knockout ?? {});
    if (!resA || !resB) continue;
    const sA = new Set([resA, resB]);
    if (sA.has(m.teamA) && sA.has(m.teamB)) {
      return matchup.id;
    }
  }
  return null;
}

/** Walk the bracket to figure out the actual teams currently in a matchup. */
function resolveMatchupTeams(
  matchId: string,
  matchups: NonNullable<TournamentResults['knockoutBracket']>,
  knockoutResults: Record<string, string>,
): [string | null, string | null] {
  const m = matchups.find((x) => x.id === matchId);
  if (!m) return [null, null];
  if (m.round === 0) return [m.teamA ?? null, m.teamB ?? null];

  if (m.id === '3RD') {
    // 3rd place gets the LOSERS of SF — handled separately by callers
    return [null, null];
  }

  const feeders = getFeederMatchupIds(m.id);
  if (!feeders) return [null, null];
  return [knockoutResults[feeders[0]] ?? null, knockoutResults[feeders[1]] ?? null];
}
