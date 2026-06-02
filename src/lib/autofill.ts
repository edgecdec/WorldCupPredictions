import { BracketData, KnockoutMatchup } from '@/types';
import { getTeamByName } from '@/lib/bracketData';
import { PELE_RATINGS, AVG_GA } from '@/lib/peleRatings';

type GroupOrders = Record<string, string[]>;

// --- Helpers ---

function rankOf(data: BracketData, name: string): number {
  return getTeamByName(data, name)?.fifaRanking ?? 999;
}

function peleOf(name: string): number {
  return PELE_RATINGS[name]?.pele ?? 1500;
}

function sortByPele(teams: string[]): string[] {
  return [...teams].sort((a, b) => peleOf(b) - peleOf(a));
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

// --- PELE-based match simulation (Poisson goal model) ---

function poissonSample(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

/** Simulate a group-stage match (allows draws). Returns goal count for each team. */
function simulateGroupMatch(teamA: string, teamB: string): [number, number] {
  const a = PELE_RATINGS[teamA];
  const b = PELE_RATINGS[teamB];
  if (!a || !b) return [0, 0];
  const lambdaA = a.gf * (b.ga / AVG_GA);
  const lambdaB = b.gf * (a.ga / AVG_GA);
  return [poissonSample(lambdaA), poissonSample(lambdaB)];
}

/** Simulate a knockout match (no draws — uses PELE-weighted coin flip on tie to model ET/penalties). */
function simulateKnockoutMatch(teamA: string, teamB: string): string {
  const [ga, gb] = simulateGroupMatch(teamA, teamB);
  if (ga !== gb) return ga > gb ? teamA : teamB;
  const a = PELE_RATINGS[teamA];
  const b = PELE_RATINGS[teamB];
  if (!a || !b) return Math.random() < 0.5 ? teamA : teamB;
  const probA = a.pele / (a.pele + b.pele);
  return Math.random() < probA ? teamA : teamB;
}

interface TeamStats { pts: number; gf: number; ga: number; gd: number }

/** Run a full round-robin for a 4-team group, return finishing order + stats. */
function simulateGroupStandings(teams: string[]): { order: string[]; stats: Record<string, TeamStats> } {
  const stats: Record<string, TeamStats> = {};
  for (const t of teams) stats[t] = { pts: 0, gf: 0, ga: 0, gd: 0 };
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const [ga, gb] = simulateGroupMatch(teams[i], teams[j]);
      stats[teams[i]].gf += ga; stats[teams[i]].ga += gb;
      stats[teams[j]].gf += gb; stats[teams[j]].ga += ga;
      if (ga > gb) stats[teams[i]].pts += 3;
      else if (ga === gb) { stats[teams[i]].pts += 1; stats[teams[j]].pts += 1; }
      else stats[teams[j]].pts += 3;
    }
  }
  for (const t of teams) stats[t].gd = stats[t].gf - stats[t].ga;
  const order = [...teams].sort((a, b) =>
    stats[b].pts - stats[a].pts || stats[b].gd - stats[a].gd || stats[b].gf - stats[a].gf
  );
  return { order, stats };
}

/** Cache of last simulation: stats per group keyed by group name. */
let lastSmartGroupStats: Record<string, Record<string, TeamStats>> = {};

// --- Group Stage Autofill ---

export function chalkGroups(data: BracketData): GroupOrders {
  const orders: GroupOrders = {};
  for (const g of data.groups) {
    // Naive: sort by FIFA ranking (lower = better)
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
  const allStats: Record<string, Record<string, TeamStats>> = {};
  for (const g of data.groups) {
    // Run a single PELE-based group simulation (round-robin with Poisson goals)
    const teams = g.teams.map((t) => t.name);
    const { order, stats } = simulateGroupStandings(teams);
    orders[g.name] = order;
    allStats[g.name] = stats;
  }
  // Cache stats so smartThirdPlace can use the same simulation outcome
  lastSmartGroupStats = allStats;
  return orders;
}

// --- Third Place Autofill ---

const REQUIRED_THIRD_PLACE = 8;

export function chalkThirdPlace(data: BracketData, groupOrders: GroupOrders): string[] {
  const thirds = data.groups.map((g) => groupOrders[g.name]?.[2] ?? g.teams[2].name);
  // Naive: top 8 by FIFA ranking
  return sortByRanking(thirds, data).slice(0, REQUIRED_THIRD_PLACE);
}

export function randomThirdPlace(data: BracketData, groupOrders: GroupOrders): string[] {
  const thirds = data.groups.map((g) => groupOrders[g.name]?.[2] ?? g.teams[2].name);
  return shuffle(thirds).slice(0, REQUIRED_THIRD_PLACE);
}

export function smartThirdPlace(data: BracketData, groupOrders: GroupOrders): string[] {
  // Smart: rank the 12 third-place teams using FIFA tiebreakers (points > GD > GF)
  // from the simulated group stage stats — exactly how the real tournament works.
  const scored: Array<{ name: string; pts: number; gd: number; gf: number }> = [];
  for (const g of data.groups) {
    const thirdPlaceTeam = groupOrders[g.name]?.[2] ?? g.teams[2].name;
    const stats = lastSmartGroupStats[g.name]?.[thirdPlaceTeam];
    if (stats) {
      scored.push({ name: thirdPlaceTeam, pts: stats.pts, gd: stats.gd, gf: stats.gf });
    } else {
      // Fallback (smartGroups wasn't called first): use PELE as a proxy
      scored.push({ name: thirdPlaceTeam, pts: 0, gd: 0, gf: peleOf(thirdPlaceTeam) / 1000 });
    }
  }
  scored.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  return scored.slice(0, REQUIRED_THIRD_PLACE).map((s) => s.name);
}

// --- Knockout Autofill ---

export function chalkKnockout(
  matchups: KnockoutMatchup[],
  data: BracketData,
  existingPicks: Record<string, string>,
): Record<string, string> {
  // Naive: better FIFA-ranked team always wins
  return fillKnockout(matchups, existingPicks, (teamA, teamB) =>
    rankOf(data, teamA) <= rankOf(data, teamB) ? teamA : teamB,
  );
}

export function randomKnockout(
  matchups: KnockoutMatchup[],
  _data: BracketData,
  existingPicks: Record<string, string>,
): Record<string, string> {
  return fillKnockout(matchups, existingPicks, (teamA, teamB) =>
    Math.random() < 0.5 ? teamA : teamB,
  );
}

export function smartKnockout(
  matchups: KnockoutMatchup[],
  _data: BracketData,
  existingPicks: Record<string, string>,
): Record<string, string> {
  // Smart: simulate each match using the PELE Poisson goal model
  return fillKnockout(matchups, existingPicks, (teamA, teamB) =>
    simulateKnockoutMatch(teamA, teamB),
  );
}

/**
 * Fill knockout picks round by round. Only fills empty slots.
 * pickWinner: given two team names, return the chosen winner.
 */
function fillKnockout(
  matchups: KnockoutMatchup[],
  existingPicks: Record<string, string>,
  pickWinner: (teamA: string, teamB: string) => string,
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

    picks[m.id] = pickWinner(teamA, teamB);
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
