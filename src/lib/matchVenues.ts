// 2026 FIFA World Cup match venues — host country per knockout match ID.
//
// The three host nations (USA, Mexico, Canada) get a PELE-point bonus
// when playing at home. We need precise per-match host info because:
//   - R32 has matches in all three host countries
//   - R16 has matches in all three host countries
//   - QF onward is all USA
//
// Group stage: each host plays all 3 of their group matches in their own
// country, so we use a per-team rule (any host playing in groups = home).
// Knockouts: we use a per-match-ID lookup.

export type HostCountry = 'USA' | 'Mexico' | 'Canada';

/**
 * Knockout match host country per FIFA's published 2026 schedule.
 * IDs use our internal scheme: R32-1..16, R16-1..8, QF-1..4, SF-1..2, 3RD, FINAL.
 *
 * Source: FIFA 2026 schedule (Wikipedia 2026 FIFA World Cup knockout-stage).
 */
export const KNOCKOUT_HOST: Record<string, HostCountry> = {
  // R32 — 16 matches, mix of all three hosts
  'R32-1': 'USA',
  'R32-2': 'USA',
  'R32-3': 'Mexico',
  'R32-4': 'USA',
  'R32-5': 'USA',
  'R32-6': 'USA',
  'R32-7': 'Mexico',
  'R32-8': 'USA',
  'R32-9': 'USA',
  'R32-10': 'USA',
  'R32-11': 'Canada',
  'R32-12': 'USA',
  'R32-13': 'Canada',
  'R32-14': 'USA',
  'R32-15': 'USA',
  'R32-16': 'USA',

  // R16 — 8 matches
  'R16-1': 'USA',
  'R16-2': 'USA',
  'R16-3': 'USA',
  'R16-4': 'Mexico',
  'R16-5': 'USA',
  'R16-6': 'USA',
  'R16-7': 'USA',
  'R16-8': 'Canada',

  // QF, SF, 3rd, Final — all USA
  'QF-1': 'USA',
  'QF-2': 'USA',
  'QF-3': 'USA',
  'QF-4': 'USA',
  'SF-1': 'USA',
  'SF-2': 'USA',
  '3RD': 'USA',
  'FINAL': 'USA',
};

/**
 * Whether the given team gets home field advantage for a specific match.
 * For group stage matches, pass matchId = null (any host plays at home).
 * For knockout matches, pass the match ID — HFA applies only if the team
 * is the host country for that match's venue.
 */
export function teamHasHomeField(team: string, matchId: string | null): boolean {
  if (team !== 'USA' && team !== 'Mexico' && team !== 'Canada') return false;
  // Group stage — all 3 hosts play their group games at home
  if (matchId === null) return true;
  // Knockout — check the per-match host
  const host = KNOCKOUT_HOST[matchId];
  return host === team;
}
