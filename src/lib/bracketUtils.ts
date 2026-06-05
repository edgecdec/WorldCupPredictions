import { KnockoutMatchup } from '@/types';
import {
  getFeederMatchupIds,
  getDownstreamMatchupIds,
} from '@/lib/knockoutBracket';

// Round index constants (FIFA scheme: 3RD=4, FINAL=5)
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

const TEAM_COUNT = 32;

// Generic engine round: 0=R32,1=R16,2=QF,3=SF,4=Final; 3RD=totalRounds(5)
// FIFA round:           0=R32,1=R16,2=QF,3=SF,4=3RD,5=Final
const ROUND_PREFIX = ['R32', 'R16', 'QF', 'SF'] as const;

/** Convert a FIFA matchup ID to a generic engine ID. */
function toGenericId(fifaId: string): string {
  if (fifaId === '3RD') return '3RD';
  if (fifaId === 'FINAL') return 'R4-1';
  for (let r = 0; r < ROUND_PREFIX.length; r++) {
    const prefix = ROUND_PREFIX[r];
    if (fifaId.startsWith(prefix + '-')) {
      const pos = fifaId.slice(prefix.length + 1);
      return `R${r}-${pos}`;
    }
  }
  return fifaId;
}

/** Convert a generic engine ID to a FIFA matchup ID. */
function toFifaId(genericId: string): string {
  if (genericId === '3RD') return '3RD';
  const match = genericId.match(/^R(\d+)-(\d+)$/);
  if (!match) return genericId;
  const round = parseInt(match[1], 10);
  const pos = match[2];
  if (round < ROUND_PREFIX.length) return `${ROUND_PREFIX[round]}-${pos}`;
  if (round === 4) return 'FINAL';
  return genericId;
}

/** Convert FIFA round number to generic engine round number. */
function toGenericRound(fifaRound: number): number {
  if (fifaRound === ROUND_3RD) return 5; // 3RD sits at totalRounds in generic
  if (fifaRound === ROUND_FINAL) return 4;
  return fifaRound;
}

/** Convert generic engine round number to FIFA round number. */
function toFifaRound(genericRound: number): number {
  if (genericRound === 5) return ROUND_3RD;
  if (genericRound === 4) return ROUND_FINAL;
  return genericRound;
}

/** Convert FIFA matchups to generic engine matchups. */
function toGenericMatchups(matchups: KnockoutMatchup[]): KnockoutMatchup[] {
  return matchups.map((m) => ({
    ...m,
    id: toGenericId(m.id),
    round: toGenericRound(m.round),
  }));
}

/** Convert generic engine matchups back to FIFA matchups. */
function toFifaMatchups(matchups: KnockoutMatchup[]): KnockoutMatchup[] {
  return matchups.map((m) => ({
    ...m,
    id: toFifaId(m.id),
    round: toFifaRound(m.round),
  }));
}

/** Convert a picks map from FIFA IDs to generic IDs. */
function toGenericPicks(picks: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(picks)) {
    result[toGenericId(k)] = v;
  }
  return result;
}

/** Convert a picks map from generic IDs to FIFA IDs. */
function toFifaPicks(picks: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(picks)) {
    result[toFifaId(k)] = v;
  }
  return result;
}

/** Generate an empty bracket skeleton with all 32 matchup slots but no teams. */
export function generateEmptyBracket(): KnockoutMatchup[] {
  const empty = (id: string, round: number): KnockoutMatchup => ({
    id, round, teamA: null, teamB: null, winner: null,
  });
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
 * Uses FIFA-specific feeder map (R16/QF feeders are non-sequential).
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

  // Determine old loser for SF→3RD clearing
  let oldLoser: string | null = null;
  const isSF = changedMatchupId === 'SF-1' || changedMatchupId === 'SF-2';
  if (isSF) {
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

/**
 * Group matchups by round index.
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
 * Compute effective matchups by propagating user picks into downstream slots.
 * Uses FIFA-specific feeder map (R16/QF feeders are non-sequential).
 * For the 3RD match, propagates the LOSERS of the two SFs.
 */
export function computeEffectiveMatchups(
  matchups: KnockoutMatchup[],
  picks: Record<string, string>,
): KnockoutMatchup[] {
  const map = new Map(matchups.map((m) => [m.id, { ...m }]));
  // Sort by FIFA round so feeders are processed before consumers.
  // FIFA round numbers: 0=R32, 1=R16, 2=QF, 3=SF, 4=3RD, 5=Final
  const sorted = [...map.values()].sort((a, b) => a.round - b.round);

  const resolveWinner = (
    feeder: KnockoutMatchup | undefined,
    feederId: string,
  ): string | null => feeder?.winner ?? picks[feederId] ?? null;

  const resolveLoser = (
    feeder: KnockoutMatchup | undefined,
    feederId: string,
  ): string | null => {
    if (!feeder?.teamA || !feeder?.teamB) return null;
    const winner = resolveWinner(feeder, feederId);
    if (!winner) return null;
    return winner === feeder.teamA ? feeder.teamB : feeder.teamA;
  };

  for (const m of sorted) {
    if (m.round === ROUND_R32) continue;

    const feeders = getFeederMatchupIds(m.id);
    if (!feeders) continue;

    const [feederAId, feederBId] = feeders;
    const feederA = map.get(feederAId);
    const feederB = map.get(feederBId);
    const effective = map.get(m.id)!;

    if (m.id === '3RD') {
      effective.teamA = resolveLoser(feederA, feederAId) ?? m.teamA;
      effective.teamB = resolveLoser(feederB, feederBId) ?? m.teamB;
    } else {
      effective.teamA = resolveWinner(feederA, feederAId) ?? m.teamA;
      effective.teamB = resolveWinner(feederB, feederBId) ?? m.teamB;
    }
  }

  return [...map.values()];
}

// Export mapping utilities for use by other modules
export { toGenericId, toFifaId, toGenericRound, toFifaRound };
