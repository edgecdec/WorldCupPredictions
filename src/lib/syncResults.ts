import { getDb } from '@/lib/db';
import { parseBracketData } from '@/lib/bracketData';
import { fetchCompletedMatches, type CompletedMatch } from '@/lib/espnSync';
import { generateKnockoutBracket, getFeederMatchupIds } from '@/lib/knockoutBracket';
import { computeLiveStandings } from '@/lib/liveStandings';
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

    // Compute group standings whenever any group's 6 matches are complete.
    // We write `groupStage` two-pass:
    //   1. partial: groupResults for completed groups only, advancingThirdPlace=[].
    //      Lets the leaderboard score those groups for everything except the
    //      3rd-place advancement bits.
    //   2. final: when all 12 groups are complete, populate advancingThirdPlace
    //      and generate the knockout bracket.
    // The existing "final" check still runs every sync — it's idempotent on
    // already-finalized data.
    const TOTAL_GROUPS = 12;
    const MATCHES_PER_GROUP = 6;
    const hasFinalStage = existing.groupStage
      && existing.groupStage.advancingThirdPlace
      && existing.groupStage.advancingThirdPlace.length === 8;
    let groupStageChanged = false;
    if (!hasFinalStage) {
      const liveTables = computeLiveStandings(bracketData, existing.groupMatches ?? {}, {});
      const isComplete = (g: string) =>
        (existing.groupMatches?.[g]?.length ?? 0) >= MATCHES_PER_GROUP;
      const completedTables = liveTables.filter((t) => isComplete(t.groupName));
      const partialResults = completedTables
        .filter((t) => t.standings.length === 4)
        .map((gt) => ({
          groupName: gt.groupName,
          order: gt.standings.map((s) => s.team) as [string, string, string, string],
        }));

      if (completedTables.length === TOTAL_GROUPS && liveTables.every((t) => t.standings.length === 4)) {
        // All 12 groups complete: write the full GroupStageResults with the
        // 8 advancing 3rd-place teams determined.
        const teamRank = (team: string) => {
          for (const g of bracketData.groups) {
            const t = g.teams.find((x) => x.name === team);
            if (t) return t.fifaRanking ?? 9999;
          }
          return 9999;
        };
        const thirds = liveTables
          .map((t) => t.standings[2])
          .sort((a, b) =>
            (b.points - a.points)
            || (b.goalDifference - a.goalDifference)
            || (b.goalsFor - a.goalsFor)
            || (b.fairPlay - a.fairPlay)
            || (teamRank(a.team) - teamRank(b.team))
            || a.team.localeCompare(b.team))
          .slice(0, 8)
          .map((s) => s.team);
        const gsResults: GroupStageResults = { groupResults: partialResults, advancingThirdPlace: thirds };
        const knockoutBracket = generateKnockoutBracket(gsResults, bracketData);
        if (!deepEqual(existing.groupStage, gsResults)) {
          existing.groupStage = gsResults;
          existing.knockoutBracket = knockoutBracket;
          groupStageChanged = true;
        }
      } else if (partialResults.length > 0) {
        // Some (but not all) groups complete: write a partial GroupStageResults
        // with advancingThirdPlace=[] so scoreGroupStage treats 3rd-place
        // advancement as pending. Recompute on every sync so newly-completed
        // groups get added.
        const partial: GroupStageResults = { groupResults: partialResults, advancingThirdPlace: [] };
        if (!deepEqual(existing.groupStage, partial)) {
          existing.groupStage = partial;
          // Don't write a knockoutBracket yet — slot assignments depend on
          // the advancing 3rd-place set, which isn't known.
          delete (existing as Partial<typeof existing>).knockoutBracket;
          groupStageChanged = true;
        }
      }
    }

    const updated = groupMatchesAdded + knockoutWinnersAdded + (groupStageChanged ? 1 : 0) + cardEventsBackfilled;
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

    return { ok: true, updated, groupMatchesAdded, knockoutWinnersAdded, groupStageCompleted: groupStageChanged };
  } finally {
    syncInProgress = false;
  }
}

/** Find which knockout match ID a completed match corresponds to. */
/** Cheap deep-equality via JSON for the small plain-data structures we
 *  use here. Order matters in arrays — that's fine because we always
 *  build them in a deterministic order. */
function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function findKnockoutMatchId(m: CompletedMatch, existing: ResultsWithMeta): string | null {
  const matchups = existing.knockoutBracket;
  if (!matchups) return null;
  const roundIdxMap: Record<string, number> = { R32: 0, R16: 1, QF: 2, SF: 3, '3RD': 4, FINAL: 5 };
  const targetRound = roundIdxMap[m.knockoutRound ?? ''];
  // 'KO' (or any unrecognized non-empty token) → scan every knockout round
  // until we find a matchup whose two resolved teams match this pair. Used
  // when ESPN doesn't surface a headline that tells us the round.
  const candidateRounds = targetRound !== undefined ? [targetRound] : [0, 1, 2, 3, 4, 5];

  for (const round of candidateRounds) {
    for (const matchup of matchups) {
      if (matchup.round !== round) continue;
      const [resA, resB] = resolveMatchupTeams(matchup.id, matchups, existing.knockout ?? {});
      if (!resA || !resB) continue;
      const sA = new Set([resA, resB]);
      if (sA.has(m.teamA) && sA.has(m.teamB)) {
        return matchup.id;
      }
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
    // 3rd-place playoff = the two SF LOSERS. Derive from SF winners and
    // their QF-feeder winners. If either isn't known yet, we can't match.
    const loserOf = (sf: string): string | null => {
      const sfWinner = knockoutResults[sf];
      if (!sfWinner) return null;
      const feeders = getFeederMatchupIds(sf);
      if (!feeders) return null;
      const [qA, qB] = feeders;
      const candA = knockoutResults[qA];
      const candB = knockoutResults[qB];
      if (candA && candA !== sfWinner) return candA;
      if (candB && candB !== sfWinner) return candB;
      return null;
    };
    return [loserOf('SF-1'), loserOf('SF-2')];
  }

  const feeders = getFeederMatchupIds(m.id);
  if (!feeders) return [null, null];
  return [knockoutResults[feeders[0]] ?? null, knockoutResults[feeders[1]] ?? null];
}
