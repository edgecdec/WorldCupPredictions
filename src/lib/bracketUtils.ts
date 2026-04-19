import { KnockoutMatchup } from '@/types';
import { getDownstreamMatchupIds } from '@/lib/knockoutBracket';

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
