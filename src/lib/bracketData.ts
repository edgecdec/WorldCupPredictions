import { BracketData, Team, Group } from '@/types';

// --- Utility functions ---

export function parseBracketData(raw: string | BracketData): BracketData {
  if (typeof raw === 'string') return JSON.parse(raw) as BracketData;
  return raw;
}

export function getTeamByName(data: BracketData, name: string): Team | undefined {
  for (const group of data.groups) {
    const team = group.teams.find((t) => t.name === name);
    if (team) return team;
  }
  return undefined;
}

export function getGroupByName(data: BracketData, name: string): Group | undefined {
  return data.groups.find((g) => g.name === name);
}

export function getTeamSeed(data: BracketData, name: string): number | undefined {
  return getTeamByName(data, name)?.groupSeed;
}

export function getTeamRanking(data: BracketData, name: string): number | undefined {
  return getTeamByName(data, name)?.fifaRanking;
}

export function getCountryCode(data: BracketData, name: string): string | undefined {
  return getTeamByName(data, name)?.countryCode;
}

export function getTeamByEspnId(data: BracketData, espnId: number): Team | undefined {
  for (const group of data.groups) {
    const team = group.teams.find((t) => t.espnId === espnId);
    if (team) return team;
  }
  return undefined;
}

// --- 2026 FIFA World Cup seed data ---
// 48 teams, 12 groups (A–L), 4 teams per group
// Pots and FIFA rankings based on the official draw (Dec 2025)

const group = (name: string, teams: [Team, Team, Team, Team]): Group => ({
  name,
  teams,
});

const team = (
  name: string,
  fifaRanking: number,
  pot: 1 | 2 | 3 | 4,
  groupSeed: 1 | 2 | 3 | 4,
  espnId: number,
  countryCode: string,
): Team => ({ name, fifaRanking, pot, groupSeed, espnId, countryCode });

export const WORLD_CUP_2026_DATA: BracketData = {
  groups: [
    group('A', [
      team('Mexico', 15, 1, 1, 203, 'mx'),
      team('South Korea', 22, 2, 2, 451, 'kr'),
      team('Czechia', 44, 3, 3, 450, 'cz'),
      team('South Africa', 61, 4, 4, 467, 'za'),
    ]),
    group('B', [
      team('Canada', 27, 1, 1, 206, 'ca'),
      team('Switzerland', 17, 2, 2, 475, 'ch'),
      team('Qatar', 51, 3, 3, 4398, 'qa'),
      team('Bosnia and Herzegovina', 71, 4, 4, 452, 'ba'),
    ]),
    group('C', [
      team('Brazil', 5, 1, 1, 205, 'br'),
      team('Morocco', 11, 2, 2, 2869, 'ma'),
      team('Scotland', 36, 3, 3, 580, 'gb-sct'),
      team('Haiti', 84, 4, 4, 2654, 'ht'),
    ]),
    group('D', [
      team('USA', 14, 1, 1, 660, 'us'),
      team('Australia', 26, 2, 2, 628, 'au'),
      team('Paraguay', 39, 3, 3, 210, 'py'),
      team('Turkiye', 25, 4, 4, 465, 'tr'),
    ]),
    group('E', [
      team('Germany', 9, 1, 1, 481, 'de'),
      team('Ecuador', 23, 2, 2, 209, 'ec'),
      team('Ivory Coast', 42, 3, 3, 4789, 'ci'),
      team('Curacao', 82, 4, 4, 11678, 'cw'),
    ]),
    group('F', [
      team('Netherlands', 7, 1, 1, 449, 'nl'),
      team('Japan', 18, 2, 2, 627, 'jp'),
      team('Sweden', 43, 3, 3, 466, 'se'),
      team('Tunisia', 40, 4, 4, 659, 'tn'),
    ]),
    group('G', [
      team('Belgium', 8, 1, 1, 459, 'be'),
      team('Egypt', 34, 2, 2, 2620, 'eg'),
      team('Iran', 20, 3, 3, 469, 'ir'),
      team('New Zealand', 86, 4, 4, 2666, 'nz'),
    ]),
    group('H', [
      team('Spain', 1, 1, 1, 164, 'es'),
      team('Uruguay', 16, 2, 2, 212, 'uy'),
      team('Saudi Arabia', 60, 3, 3, 655, 'sa'),
      team('Cape Verde', 68, 4, 4, 2597, 'cv'),
    ]),
    group('I', [
      team('France', 3, 1, 1, 478, 'fr'),
      team('Senegal', 19, 2, 2, 654, 'sn'),
      team('Norway', 29, 3, 3, 464, 'no'),
      team('Iraq', 58, 4, 4, 4375, 'iq'),
    ]),
    group('J', [
      team('Argentina', 2, 1, 1, 202, 'ar'),
      team('Algeria', 35, 2, 2, 624, 'dz'),
      team('Austria', 24, 3, 3, 474, 'at'),
      team('Jordan', 66, 4, 4, 2917, 'jo'),
    ]),
    group('K', [
      team('Portugal', 6, 1, 1, 482, 'pt'),
      team('Colombia', 13, 2, 2, 208, 'co'),
      team('Uzbekistan', 50, 3, 3, 2570, 'uz'),
      team('DR Congo', 56, 4, 4, 2850, 'cd'),
    ]),
    group('L', [
      team('England', 4, 1, 1, 448, 'gb-eng'),
      team('Croatia', 10, 2, 2, 477, 'hr'),
      team('Ghana', 72, 3, 3, 4469, 'gh'),
      team('Panama', 30, 4, 4, 2659, 'pa'),
    ]),
  ],
};
