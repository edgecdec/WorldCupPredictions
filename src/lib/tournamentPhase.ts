import type { Tournament } from '@/types';

export type TournamentPhase = 'pre-tournament' | 'group-stage' | 'knockout' | 'complete';

const TOURNAMENT_END_OFFSET_DAYS = 30;

export function getPhase(tournament: Tournament | null): TournamentPhase {
  if (!tournament) return 'pre-tournament';

  const now = new Date();
  const lockGroups = tournament.lock_time_groups ? new Date(tournament.lock_time_groups) : null;
  const lockKnockout = tournament.lock_time_knockout ? new Date(tournament.lock_time_knockout) : null;

  if (!lockGroups || now < lockGroups) return 'pre-tournament';
  if (!lockKnockout || now < lockKnockout) return 'group-stage';

  // Check if tournament is complete (results have a Final winner)
  const results = typeof tournament.results_data === 'string'
    ? JSON.parse(tournament.results_data || '{}')
    : tournament.results_data;
  if (results?.knockout?.FINAL) return 'complete';

  return 'knockout';
}

/** Pages restricted before group stage starts */
export const PRE_TOURNAMENT_RESTRICTED = ['/stats', '/whopicked', '/compare', '/simulate'] as const;

/** Pages restricted before knockout starts */
export const GROUP_STAGE_RESTRICTED = ['/bracket/knockout'] as const;

export function isPageRestricted(pathname: string, phase: TournamentPhase): boolean {
  if (phase === 'complete' || phase === 'knockout') return false;
  if (phase === 'pre-tournament') {
    return PRE_TOURNAMENT_RESTRICTED.some(p => pathname.startsWith(p));
  }
  // group-stage: knockout bracket data hidden
  return GROUP_STAGE_RESTRICTED.some(p => pathname.startsWith(p));
}

export function getUnlockMessage(pathname: string, phase: TournamentPhase): string | null {
  if (!isPageRestricted(pathname, phase)) return null;
  if (phase === 'pre-tournament') {
    return 'Available once the tournament begins';
  }
  if (phase === 'group-stage') {
    return 'Available once the knockout stage begins';
  }
  return null;
}
