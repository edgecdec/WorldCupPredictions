import { KnockoutMatchup } from '@/types';

/** Total rounds for a bracket of the given team count. */
function totalRounds(teamCount: number): number {
  return Math.log2(teamCount);
}

/** Number of matches in a given round (0-indexed). */
function matchesInRound(teamCount: number, round: number): number {
  return teamCount / Math.pow(2, round + 1);
}

/** Build a matchup ID from round and 1-indexed position. */
function matchId(round: number, position: number): string {
  return `R${round}-${position}`;
}

/** The round index of the semifinals for a given team count. */
function sfRound(teamCount: number): number {
  return totalRounds(teamCount) - 2;
}

/** The round index of the final for a given team count. */
function finalRound(teamCount: number): number {
  return totalRounds(teamCount) - 1;
}

/**
 * Generate a generic single-elimination bracket.
 * Returns matchups with IDs like R0-1, R0-2, ..., R4-1 (Final), plus optional 3RD.
 */
export function generateGenericBracket(
  teamCount: number,
  includeThirdPlace = false,
): KnockoutMatchup[] {
  const rounds = totalRounds(teamCount);
  const matchups: KnockoutMatchup[] = [];

  for (let r = 0; r < rounds; r++) {
    const count = matchesInRound(teamCount, r);
    for (let p = 1; p <= count; p++) {
      matchups.push({ id: matchId(r, p), round: r, teamA: null, teamB: null, winner: null });
    }
  }

  if (includeThirdPlace && rounds >= 2) {
    matchups.push({ id: '3RD', round: rounds, teamA: null, teamB: null, winner: null });
  }

  return matchups;
}

/**
 * Get the two feeder matchup IDs for a given matchup using pure math.
 * R{r}-{p} is fed by R{r-1}-{2p-1} and R{r-1}-{2p}.
 * For 3RD, returns the two SF match IDs (losers feed in).
 * For round 0, returns null (no feeders).
 */
export function getFeederIds(
  id: string,
  teamCount: number,
): [string, string] | null {
  if (id === '3RD') {
    const sf = sfRound(teamCount);
    return [matchId(sf, 1), matchId(sf, 2)];
  }

  const parsed = parseMatchId(id);
  if (!parsed || parsed.round === 0) return null;

  const { round, position } = parsed;
  return [matchId(round - 1, 2 * position - 1), matchId(round - 1, 2 * position)];
}

/**
 * Get all downstream matchup IDs that depend on a given matchup's result.
 * Walks forward through the bracket using feeder math in reverse.
 */
export function getDownstreamIds(
  id: string,
  teamCount: number,
  includeThirdPlace = false,
): string[] {
  const downstream: string[] = [];
  const queue = [id];
  const rounds = totalRounds(teamCount);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const nextIds = getNextIds(current, teamCount, includeThirdPlace);
    for (const next of nextIds) {
      if (!downstream.includes(next)) {
        downstream.push(next);
        if (next !== '3RD') queue.push(next);
      }
    }
  }

  // If the changed match is an SF, 3RD is also downstream
  if (includeThirdPlace) {
    const sf = sfRound(teamCount);
    const parsed = parseMatchId(id);
    if (parsed && parsed.round === sf && !downstream.includes('3RD')) {
      downstream.push('3RD');
    }
  }

  return downstream;
}

/**
 * Get the matchup IDs that a match's winner feeds into.
 * SF matches feed into both the Final (winner) and 3RD (loser).
 */
function getNextIds(
  id: string,
  teamCount: number,
  includeThirdPlace: boolean,
): string[] {
  if (id === '3RD') return [];

  const parsed = parseMatchId(id);
  if (!parsed) return [];

  const { round, position } = parsed;
  const rounds = totalRounds(teamCount);
  const sf = sfRound(teamCount);

  // Final has no next
  if (round === rounds - 1) return [];

  const nextRound = round + 1;
  const nextPosition = Math.ceil(position / 2);
  const result = [matchId(nextRound, nextPosition)];

  // SF matches also feed into 3RD
  if (includeThirdPlace && round === sf) {
    result.push('3RD');
  }

  return result;
}

/**
 * Human-readable label for a round.
 */
export function getRoundLabel(round: number, rounds: number): string {
  const fromEnd = rounds - 1 - round;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semifinals';
  if (fromEnd === 2) return 'Quarterfinals';
  const teamsInRound = Math.pow(2, fromEnd + 1);
  return `Round of ${teamsInRound}`;
}

/**
 * Compute effective matchups by propagating picks into downstream teamA/teamB slots.
 * For the 3RD match, propagates the LOSERS of the two SFs.
 */
export function computeEffectiveMatchups(
  matchups: KnockoutMatchup[],
  picks: Record<string, string>,
  teamCount: number,
): KnockoutMatchup[] {
  const map = new Map(matchups.map((m) => [m.id, { ...m }]));
  const sorted = [...map.values()].sort((a, b) => a.round - b.round);

  for (const m of sorted) {
    if (m.round === 0) continue;

    const feeders = getFeederIds(m.id, teamCount);
    if (!feeders) continue;

    const [feederAId, feederBId] = feeders;
    const feederA = map.get(feederAId);
    const feederB = map.get(feederBId);
    const effective = map.get(m.id)!;

    if (m.id === '3RD') {
      effective.teamA = resolveLoser(feederA, feederAId, picks) ?? m.teamA;
      effective.teamB = resolveLoser(feederB, feederBId, picks) ?? m.teamB;
    } else {
      effective.teamA = resolveWinner(feederA, feederAId, picks) ?? m.teamA;
      effective.teamB = resolveWinner(feederB, feederBId, picks) ?? m.teamB;
    }
  }

  return [...map.values()];
}

/**
 * Clear all downstream picks when a pick changes.
 * Removes any downstream pick that depended on the old winner (or old loser for 3RD).
 */
export function cascadeClear(
  picks: Record<string, string>,
  changedMatchupId: string,
  matchups: KnockoutMatchup[],
  teamCount: number,
): Record<string, string> {
  const oldWinner = picks[changedMatchupId];
  if (!oldWinner) return { ...picks };

  const updated = { ...picks };
  const has3rd = matchups.some((m) => m.id === '3RD');
  const downstream = getDownstreamIds(changedMatchupId, teamCount, has3rd);

  // Determine old loser for SF→3RD clearing
  let oldLoser: string | null = null;
  const sf = sfRound(teamCount);
  const parsed = parseMatchId(changedMatchupId);
  if (parsed && parsed.round === sf) {
    const sfMatchup = matchups.find((m) => m.id === changedMatchupId);
    if (sfMatchup?.teamA && sfMatchup?.teamB) {
      oldLoser = oldWinner === sfMatchup.teamA ? sfMatchup.teamB : sfMatchup.teamA;
    }
  }

  for (const mid of downstream) {
    if (updated[mid] === oldWinner) {
      delete updated[mid];
    }
    if (mid === '3RD' && oldLoser && updated[mid] === oldLoser) {
      delete updated[mid];
    }
  }

  return updated;
}

/** Parse a matchup ID like "R2-3" into { round: 2, position: 3 }. */
function parseMatchId(id: string): { round: number; position: number } | null {
  if (id === '3RD') return null;
  const match = id.match(/^R(\d+)-(\d+)$/);
  if (!match) return null;
  return { round: parseInt(match[1], 10), position: parseInt(match[2], 10) };
}

/** Resolve the winner of a feeder matchup: actual result first, then user pick. */
function resolveWinner(
  feeder: KnockoutMatchup | undefined,
  feederId: string,
  picks: Record<string, string>,
): string | null {
  return feeder?.winner ?? picks[feederId] ?? null;
}

/** Resolve the loser of a feeder matchup (for 3rd place match). */
function resolveLoser(
  feeder: KnockoutMatchup | undefined,
  feederId: string,
  picks: Record<string, string>,
): string | null {
  if (!feeder?.teamA || !feeder?.teamB) return null;
  const winner = resolveWinner(feeder, feederId, picks);
  if (!winner) return null;
  return winner === feeder.teamA ? feeder.teamB : feeder.teamA;
}

export { parseMatchId, totalRounds, sfRound, finalRound, matchesInRound, matchId };
