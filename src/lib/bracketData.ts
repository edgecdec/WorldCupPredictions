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
): Team => ({ name, fifaRanking, pot, groupSeed });

export const WORLD_CUP_2026_DATA: BracketData = {
  groups: [
    group('A', [
      team('Mexico', 15, 1, 1),
      team('South Korea', 22, 2, 2),
      team('Czechia', 44, 3, 3),
      team('South Africa', 61, 4, 4),
    ]),
    group('B', [
      team('Canada', 27, 1, 1),
      team('Switzerland', 17, 2, 2),
      team('Qatar', 51, 3, 3),
      team('Bosnia and Herzegovina', 71, 4, 4),
    ]),
    group('C', [
      team('Brazil', 5, 1, 1),
      team('Morocco', 11, 2, 2),
      team('Scotland', 36, 3, 3),
      team('Haiti', 84, 4, 4),
    ]),
    group('D', [
      team('USA', 14, 1, 1),
      team('Australia', 26, 2, 2),
      team('Paraguay', 39, 3, 3),
      team('Turkiye', 25, 4, 4),
    ]),
    group('E', [
      team('Germany', 9, 1, 1),
      team('Ecuador', 23, 2, 2),
      team('Ivory Coast', 42, 3, 3),
      team('Curacao', 82, 4, 4),
    ]),
    group('F', [
      team('Netherlands', 7, 1, 1),
      team('Japan', 18, 2, 2),
      team('Sweden', 43, 3, 3),
      team('Tunisia', 40, 4, 4),
    ]),
    group('G', [
      team('Belgium', 8, 1, 1),
      team('Egypt', 34, 2, 2),
      team('Iran', 20, 3, 3),
      team('New Zealand', 86, 4, 4),
    ]),
    group('H', [
      team('Spain', 1, 1, 1),
      team('Uruguay', 16, 2, 2),
      team('Saudi Arabia', 60, 3, 3),
      team('Cape Verde', 68, 4, 4),
    ]),
    group('I', [
      team('France', 3, 1, 1),
      team('Senegal', 19, 2, 2),
      team('Norway', 29, 3, 3),
      team('Iraq', 58, 4, 4),
    ]),
    group('J', [
      team('Argentina', 2, 1, 1),
      team('Algeria', 35, 2, 2),
      team('Austria', 24, 3, 3),
      team('Jordan', 66, 4, 4),
    ]),
    group('K', [
      team('Portugal', 6, 1, 1),
      team('Colombia', 13, 2, 2),
      team('Uzbekistan', 50, 3, 3),
      team('DR Congo', 56, 4, 4),
    ]),
    group('L', [
      team('England', 4, 1, 1),
      team('Croatia', 10, 2, 2),
      team('Ghana', 72, 3, 3),
      team('Panama', 30, 4, 4),
    ]),
  ],
};
