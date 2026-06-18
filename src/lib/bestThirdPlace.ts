import type { GroupTable } from '@/lib/espnSync';

const GAMES_PER_GROUP_STAGE = 3;

/**
 * Check if all group stage matches are complete (every team played 3 games).
 *
 * The actual best-third-place ordering now lives in lib/groupOrder
 * (rankThirdPlaceCandidates) so every surface in the app uses the same
 * tiebreaker chain. This file just exposes the completeness check.
 */
export function isGroupStageComplete(groupTables: GroupTable[]): boolean {
  if (groupTables.length === 0) return false;
  return groupTables.every((gt) =>
    gt.standings.length > 0 &&
    gt.standings.every((s) => s.gamesPlayed >= GAMES_PER_GROUP_STAGE),
  );
}
