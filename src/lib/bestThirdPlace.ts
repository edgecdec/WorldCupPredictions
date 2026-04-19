import type { GroupTable } from '@/lib/espnSync';

const ADVANCING_THIRD_PLACE_COUNT = 8;
const GAMES_PER_GROUP_STAGE = 3;

/**
 * Determine which 8 third-place teams advance using FIFA's best-third-place rules.
 * Criteria in order: points, goal difference, goals scored, then fewer games played.
 */
export function determineBestThirdPlace(
  groupTables: GroupTable[],
): string[] {
  const thirdPlaceTeams = groupTables
    .filter((t) => t.standings.length >= GAMES_PER_GROUP_STAGE)
    .map((t) => ({ ...t.standings[2], groupName: t.groupName }));

  thirdPlaceTeams.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.gamesPlayed - b.gamesPlayed;
  });

  return thirdPlaceTeams
    .slice(0, ADVANCING_THIRD_PLACE_COUNT)
    .map((t) => t.team);
}

/**
 * Check if all group stage matches are complete (every team played 3 games).
 */
export function isGroupStageComplete(groupTables: GroupTable[]): boolean {
  if (groupTables.length === 0) return false;
  return groupTables.every((gt) =>
    gt.standings.length > 0 &&
    gt.standings.every((s) => s.gamesPlayed >= GAMES_PER_GROUP_STAGE),
  );
}
