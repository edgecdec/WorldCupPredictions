import { BracketData, KnockoutMatchup } from '@/types';
import { getTeamByName } from '@/lib/bracketData';

type GroupOrders = Record<string, string[]>;

// --- Helpers ---

function rankOf(data: BracketData, name: string): number {
  return getTeamByName(data, name)?.fifaRanking ?? 999;
}

function sortByRanking(teams: string[], data: BracketData): string[] {
  return [...teams].sort((a, b) => rankOf(data, a) - rankOf(data, b));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Weighted coin flip: returns true with probability favoring the better-ranked team */
function weightedPick(rankA: number, rankB: number): boolean {
  const diff = Math.abs(rankA - rankB);
  const BASE_PROB = 0.55;
  const MAX_PROB = 0.85;
  const SCALE = 50;
  const prob = BASE_PROB + (MAX_PROB - BASE_PROB) * Math.min(diff / SCALE, 1);
  // prob = chance the better-ranked team wins
  return rankA < rankB ? Math.random() < prob : Math.random() >= prob;
}

// --- Group Stage Autofill ---

export function chalkGroups(data: BracketData): GroupOrders {
  const orders: GroupOrders = {};
  for (const g of data.groups) {
    orders[g.name] = sortByRanking(g.teams.map((t) => t.name), data);
  }
  return orders;
}

export function randomGroups(data: BracketData): GroupOrders {
  const orders: GroupOrders = {};
  for (const g of data.groups) {
    orders[g.name] = shuffle(g.teams.map((t) => t.name));
  }
  return orders;
}

export function smartGroups(data: BracketData): GroupOrders {
  const orders: GroupOrders = {};
  for (const g of data.groups) {
    // Weighted shuffle: assign random scores biased by ranking
    const teams = g.teams.map((t) => t.name);
    const scored = teams.map((name) => {
      const rank = rankOf(data, name);
      // Lower rank = better. Score = rank + noise so better teams usually end up higher.
      const noise = Math.random() * 40;
      return { name, score: rank + noise };
    });
    scored.sort((a, b) => a.score - b.score);
    orders[g.name] = scored.map((s) => s.name);
  }
  return orders;
}

// --- Third Place Autofill ---

const REQUIRED_THIRD_PLACE = 8;

export function chalkThirdPlace(data: BracketData, groupOrders: GroupOrders): string[] {
  const thirds = data.groups.map((g) => groupOrders[g.name]?.[2] ?? g.teams[2].name);
  return sortByRanking(thirds, data).slice(0, REQUIRED_THIRD_PLACE);
}

export function randomThirdPlace(data: BracketData, groupOrders: GroupOrders): string[] {
  const thirds = data.groups.map((g) => groupOrders[g.name]?.[2] ?? g.teams[2].name);
  return shuffle(thirds).slice(0, REQUIRED_THIRD_PLACE);
}

export function smartThirdPlace(data: BracketData, groupOrders: GroupOrders): string[] {
  const thirds = data.groups.map((g) => groupOrders[g.name]?.[2] ?? g.teams[2].name);
  // Weighted: better-ranked thirds more likely to be picked
  const scored = thirds.map((name) => ({
    name,
    score: rankOf(data, name) + Math.random() * 30,
  }));
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, REQUIRED_THIRD_PLACE).map((s) => s.name);
}

// --- Knockout Autofill ---

export function chalkKnockout(
  matchups: KnockoutMatchup[],
  data: BracketData,
  existingPicks: Record<string, string>,
): Record<string, string> {
  return fillKnockout(matchups, data, existingPicks, (rA, rB) => rA < rB);
}

export function randomKnockout(
  matchups: KnockoutMatchup[],
  data: BracketData,
  existingPicks: Record<string, string>,
): Record<string, string> {
  return fillKnockout(matchups, data, existingPicks, () => Math.random() < 0.5);
}

export function smartKnockout(
  matchups: KnockoutMatchup[],
  data: BracketData,
  existingPicks: Record<string, string>,
): Record<string, string> {
  return fillKnockout(matchups, data, existingPicks, (rA, rB) => weightedPick(rA, rB));
}

/**
 * Fill knockout picks round by round. Only fills empty slots.
 * pickA: given rankA and rankB, return true to pick teamA.
 */
function fillKnockout(
  matchups: KnockoutMatchup[],
  data: BracketData,
  existingPicks: Record<string, string>,
  pickA: (rankA: number, rankB: number) => boolean,
): Record<string, string> {
  const picks = { ...existingPicks };
  const byId = new Map(matchups.map((m) => [m.id, m]));

  // Process rounds in order so later rounds can use earlier picks
  const sorted = [...matchups].sort((a, b) => a.round - b.round);

  for (const m of sorted) {
    if (picks[m.id]) continue; // already picked

    const teamA = resolveTeam(m, picks, byId);
    const teamB = resolveTeamB(m, picks, byId);
    if (!teamA || !teamB) continue; // can't determine teams yet

    const rA = rankOf(data, teamA);
    const rB = rankOf(data, teamB);
    picks[m.id] = pickA(rA, rB) ? teamA : teamB;
  }

  return picks;
}

function resolveTeam(m: KnockoutMatchup, picks: Record<string, string>, byId: Map<string, KnockoutMatchup>): string | null {
  if (m.teamA) return m.teamA;
  // For later rounds, teamA comes from a feeder matchup's winner
  // Find which matchup feeds into this one as teamA
  return findFeederWinner(m.id, 'A', picks, byId);
}

function resolveTeamB(m: KnockoutMatchup, picks: Record<string, string>, byId: Map<string, KnockoutMatchup>): string | null {
  if (m.teamB) return m.teamB;
  return findFeederWinner(m.id, 'B', picks, byId);
}

/** Map of matchup ID -> [feederA, feederB] — FIFA 2026 official bracket */
const FEEDS: Record<string, [string, string]> = {
  'R16-1': ['R32-2', 'R32-5'],   // M89: W74 vs W77
  'R16-2': ['R32-1', 'R32-3'],   // M90: W73 vs W75
  'R16-3': ['R32-4', 'R32-6'],   // M91: W76 vs W78
  'R16-4': ['R32-7', 'R32-8'],   // M92: W79 vs W80
  'R16-5': ['R32-11', 'R32-12'], // M93: W83 vs W84
  'R16-6': ['R32-9', 'R32-10'],  // M94: W81 vs W82
  'R16-7': ['R32-14', 'R32-16'], // M95: W86 vs W88
  'R16-8': ['R32-13', 'R32-15'], // M96: W85 vs W87
  'QF-1': ['R16-1', 'R16-2'],    // M97
  'QF-2': ['R16-5', 'R16-6'],    // M98
  'QF-3': ['R16-3', 'R16-4'],    // M99
  'QF-4': ['R16-7', 'R16-8'],    // M100
  'SF-1': ['QF-1', 'QF-2'],      // M101
  'SF-2': ['QF-3', 'QF-4'],      // M102
  '3RD': ['SF-1', 'SF-2'],
  'FINAL': ['SF-1', 'SF-2'],
};

function findFeederWinner(
  matchupId: string,
  slot: 'A' | 'B',
  picks: Record<string, string>,
  _byId: Map<string, KnockoutMatchup>,
): string | null {
  const feeders = FEEDS[matchupId];
  if (!feeders) return null;
  const feederId = slot === 'A' ? feeders[0] : feeders[1];

  // For 3RD place match, the teams are the SF losers
  if (matchupId === '3RD') {
    const sfId = slot === 'A' ? 'SF-1' : 'SF-2';
    const sfWinner = picks[sfId];
    if (!sfWinner) return null;
    const sfMatchup = _byId.get(sfId);
    if (!sfMatchup) return null;
    const tA = sfMatchup.teamA ?? picks[getFeederForSlot(sfId, 'A')] ?? null;
    const tB = sfMatchup.teamB ?? picks[getFeederForSlot(sfId, 'B')] ?? null;
    // Loser is the one that's not the winner
    if (tA && tB) return sfWinner === tA ? tB : tA;
    return null;
  }

  return picks[feederId] ?? null;
}

function getFeederForSlot(matchupId: string, slot: 'A' | 'B'): string {
  const feeders = FEEDS[matchupId];
  if (!feeders) return '';
  return slot === 'A' ? feeders[0] : feeders[1];
}
