import { KnockoutMatchup } from '@/types';
import { getDownstreamMatchupIds, getFeederMatchupIds } from '@/lib/knockoutBracket';

// Round index constants
const ROUND_R32 = 0;
const ROUND_R16 = 1;
const ROUND_QF = 2;
const ROUND_SF = 3;
const ROUND_3RD = 4;
const ROUND_FINAL = 5;

const ROUND_LABELS: Record<number, string> = {
  [ROUND_R32]: 'R32',
  [ROUND_R16]: 'R16',
  [ROUND_QF]: 'QF',
  [ROUND_SF]: 'SF',
  [ROUND_3RD]: '3rd Place',
  [ROUND_FINAL]: 'Final',
};

export { ROUND_R32, ROUND_R16, ROUND_QF, ROUND_SF, ROUND_3RD, ROUND_FINAL, ROUND_LABELS };

/**
 * Clear all downstream picks that depend on the old winner of a changed matchup.
 * When a user changes their pick for a matchup, any later-round picks that had
 * the old winner must be removed since that team can no longer advance.
 */
export function cascadeClear(
  picks: Record<string, string>,
  changedMatchupId: string,
  matchups: KnockoutMatchup[],
): Record<string, string> {
  const oldWinner = picks[changedMatchupId];
  if (!oldWinner) return { ...picks };

  const updated = { ...picks };
  const downstream = getDownstreamMatchupIds(changedMatchupId);

  for (const matchupId of downstream) {
    if (updated[matchupId] === oldWinner) {
      delete updated[matchupId];
    }
  }

  return updated;
}

/**
 * Group matchups by round index.
 * Returns a Map from round number to matchups in that round.
 */
export function getMatchupsByRound(
  matchups: KnockoutMatchup[],
): Map<number, KnockoutMatchup[]> {
  const byRound = new Map<number, KnockoutMatchup[]>();
  for (const m of matchups) {
    const list = byRound.get(m.round) ?? [];
    list.push(m);
    byRound.set(m.round, list);
  }
  return byRound;
}

/**
 * Compute effective matchups by propagating user picks into downstream teamA/teamB slots.
 * When a user picks a winner for R32-1, that team appears as teamA in R16-1, etc.
 */
export function computeEffectiveMatchups(
  matchups: KnockoutMatchup[],
  picks: Record<string, string>,
): KnockoutMatchup[] {
  const matchupMap = new Map(matchups.map((m) => [m.id, { ...m }]));

  // Process rounds in order so earlier picks propagate forward
  const sorted = [...matchupMap.values()].sort((a, b) => a.round - b.round);

  for (const m of sorted) {
    if (m.round === ROUND_R32) continue; // R32 teams come from group results, already set
    const feeders = getFeederMatchupIds(m.id);
    if (!feeders) continue;
    const [feederA, feederB] = feeders;
    const effective = matchupMap.get(m.id)!;
    // teamA = winner of feeder A (from actual results or user pick)
    const feederAMatchup = matchupMap.get(feederA);
    const feederBMatchup = matchupMap.get(feederB);
    effective.teamA = feederAMatchup?.winner ?? picks[feederA] ?? m.teamA;
    effective.teamB = feederBMatchup?.winner ?? picks[feederB] ?? m.teamB;
  }

  return [...matchupMap.values()];
}
