import { getDb } from '@/lib/db';
import { parseBracketData } from '@/lib/bracketData';
import { fetchCompletedMatches, fetchGroupStandings, type CompletedMatch } from '@/lib/espnSync';
import { generateKnockoutBracket } from '@/lib/knockoutBracket';
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
  /** Per-group completed match scores: { groupName: [{teamA, teamB, scoreA, scoreB}, ...] } */
  groupMatches?: Record<string, Array<{
    teamA: string;
    teamB: string;
    scoreA: number;
    scoreB: number;
    espnId: string;
    date: string;
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

    for (const m of completed) {
      if (m.isGroup && m.groupName) {
        const k = groupMatchKey(m.groupName, m.teamA, m.teamB);
        if (seenGroupMatches.has(k)) continue;
        seenGroupMatches.add(k);
        existing.groupMatches[m.groupName] ??= [];
        existing.groupMatches[m.groupName].push({
          teamA: m.teamA,
          teamB: m.teamB,
          scoreA: m.scoreA,
          scoreB: m.scoreB,
          espnId: m.espnId,
          date: m.date,
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

    const updated = groupMatchesAdded + knockoutWinnersAdded + (groupStageCompleted ? 1 : 0);
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
  // teamA/teamB on the matchup are populated for R32; later rounds rely on winners propagation.
  // We approximate: if R16/QF/etc. matchup teamA/teamB are null, look at the earlier round's winner.
  // The bracket engine uses standard pairing: R16 match i has feeders R32 (2i-1) and R32 (2i).
  if (m.round === 0) return [m.teamA ?? null, m.teamB ?? null];

  const prefix = ['R32', 'R16', 'QF', 'SF'][m.round - 1];
  const idx = parseInt(m.id.split('-')[1] ?? '0', 10);
  const feederA = `${prefix}-${idx * 2 - 1}`;
  const feederB = `${prefix}-${idx * 2}`;
  if (m.id === 'FINAL') {
    return [knockoutResults['SF-1'] ?? null, knockoutResults['SF-2'] ?? null];
  }
  if (m.id === '3RD') {
    // 3rd place gets the LOSERS of SF — we'd need to know who lost
    // For now, return null and we'll match on bracket data later
    return [null, null];
  }
  return [knockoutResults[feederA] ?? null, knockoutResults[feederB] ?? null];
}
