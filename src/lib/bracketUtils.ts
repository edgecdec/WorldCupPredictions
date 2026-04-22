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

/** Generate an empty bracket skeleton with all 32 matchup slots but no teams. */
export function generateEmptyBracket(): KnockoutMatchup[] {
  const empty = (id: string, round: number): KnockoutMatchup => ({ id, round, teamA: null, teamB: null, winner: null });
  return [
    ...Array.from({ length: 16 }, (_, i) => empty(`R32-${i + 1}`, ROUND_R32)),
    ...Array.from({ length: 8 }, (_, i) => empty(`R16-${i + 1}`, ROUND_R16)),
    ...Array.from({ length: 4 }, (_, i) => empty(`QF-${i + 1}`, ROUND_QF)),
    empty('SF-1', ROUND_SF), empty('SF-2', ROUND_SF),
    empty('3RD', ROUND_3RD),
    empty('FINAL', ROUND_FINAL),
  ];
}

/**
 * Clear all downstream picks that depend on the old winner of a changed matchup.
 * When a user changes their pick for a matchup, any later-round picks that had
 * the old winner must be removed since that team can no longer advance.
 * For SF matches, also clears the 3RD pick since the loser changes too.
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

  // Determine the old loser for SF matches (needed for 3RD place clearing)
  let oldLoser: string | null = null;
  const isSF = changedMatchupId === 'SF-1' || changedMatchupId === 'SF-2';
  if (isSF) {
    const sfMatchup = matchups.find((m) => m.id === changedMatchupId);
    if (sfMatchup?.teamA && sfMatchup?.teamB) {
      oldLoser = oldWinner === sfMatchup.teamA ? sfMatchup.teamB : sfMatchup.teamA;
    }
  }

  for (const matchupId of downstream) {
    if (updated[matchupId] === oldWinner) {
      delete updated[matchupId];
    }
    // 3RD place match has the loser, not the winner
    if (matchupId === '3RD' && oldLoser && updated[matchupId] === oldLoser) {
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
 * Resolve the winner of a feeder matchup: actual result first, then user pick.
 */
function resolveWinner(feederMatchup: KnockoutMatchup | undefined, feederId: string, picks: Record<string, string>): string | null {
  return feederMatchup?.winner ?? picks[feederId] ?? null;
}

/**
 * Resolve the loser of a feeder matchup (for 3rd place match).
 * Only possible when we know both teams and the winner.
 */
function resolveLoser(feederMatchup: KnockoutMatchup | undefined, feederId: string, picks: Record<string, string>): string | null {
  if (!feederMatchup?.teamA || !feederMatchup?.teamB) return null;
  const winner = resolveWinner(feederMatchup, feederId, picks);
  if (!winner) return null;
  return winner === feederMatchup.teamA ? feederMatchup.teamB : feederMatchup.teamA;
}

/**
 * Compute effective matchups by propagating user picks into downstream teamA/teamB slots.
 * When a user picks a winner for R32-1, that team appears as teamA in R16-1, etc.
 * The 3RD place match receives the losers of the two SFs.
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
    const feederAMatchup = matchupMap.get(feederA);
    const feederBMatchup = matchupMap.get(feederB);

    if (m.id === '3RD') {
      // 3rd place match: losers of the two semifinals
      effective.teamA = resolveLoser(feederAMatchup, feederA, picks) ?? m.teamA;
      effective.teamB = resolveLoser(feederBMatchup, feederB, picks) ?? m.teamB;
    } else {
      // Normal: winners advance
      effective.teamA = resolveWinner(feederAMatchup, feederA, picks) ?? m.teamA;
      effective.teamB = resolveWinner(feederBMatchup, feederB, picks) ?? m.teamB;
    }
  }

  return [...matchupMap.values()];
}
