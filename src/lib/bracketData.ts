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
      team('Morocco', 14, 1, 1),
      team('Peru', 33, 2, 2),
      team('Panama', 44, 3, 3),
      team('Canada', 41, 4, 4),
    ]),
    group('B', [
      team('Spain', 2, 1, 1),
      team('Turkey', 26, 2, 2),
      team('Ecuador', 30, 3, 3),
      team('China', 91, 4, 4),
    ]),
    group('C', [
      team('Mexico', 15, 1, 1),
      team('Egypt', 36, 2, 2),
      team('Bolivia', 82, 3, 3),
      team('USA', 11, 4, 4),
    ]),
    group('D', [
      team('France', 3, 1, 1),
      team('Colombia', 12, 2, 2),
      team('Saudi Arabia', 60, 3, 3),
      team('Bahrain', 81, 4, 4),
    ]),
    group('E', [
      team('Brazil', 5, 1, 1),
      team('Denmark', 21, 2, 2),
      team('Serbia', 32, 3, 3),
      team('Paraguay', 56, 4, 4),
    ]),
    group('F', [
      team('England', 4, 1, 1),
      team('Senegal', 20, 2, 2),
      team('Hungary', 29, 3, 3),
      team('Albania', 62, 4, 4),
    ]),
    group('G', [
      team('Netherlands', 7, 1, 1),
      team('Iran', 22, 2, 2),
      team('Wales', 27, 3, 3),
      team('Indonesia', 89, 4, 4),
    ]),
    group('H', [
      team('Portugal', 6, 1, 1),
      team('Uruguay', 16, 2, 2),
      team('Cameroon', 48, 3, 3),
      team('Honduras', 72, 4, 4),
    ]),
    group('I', [
      team('Germany', 8, 1, 1),
      team('Côte d\'Ivoire', 39, 2, 2),
      team('Ukraine', 23, 3, 3),
      team('Australia', 24, 4, 4),
    ]),
    group('J', [
      team('Argentina', 1, 1, 1),
      team('Japan', 17, 2, 2),
      team('Tunisia', 37, 3, 3),
      team('Slovenia', 55, 4, 4),
    ]),
    group('K', [
      team('Italy', 9, 1, 1),
      team('South Korea', 25, 2, 2),
      team('Costa Rica', 53, 3, 3),
      team('New Zealand', 93, 4, 4),
    ]),
    group('L', [
      team('Belgium', 10, 1, 1),
      team('Austria', 19, 2, 2),
      team('Nigeria', 34, 3, 3),
      team('Ghana', 73, 4, 4),
    ]),
  ],
};
