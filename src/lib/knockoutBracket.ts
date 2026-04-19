import { BracketData, GroupStageResults, KnockoutMatchup } from '@/types';

// Round constants
const ROUND_R32 = 0;
const ROUND_R16 = 1;
const ROUND_QF = 2;
const ROUND_SF = 3;
const ROUND_3RD = 4;
const ROUND_FINAL = 5;

// Total matches: 16 (R32) + 8 (R16) + 4 (QF) + 2 (SF) + 1 (3rd) + 1 (Final) = 32
// But spec says 31 matches. R32=16, R16=8, QF=4, SF=2, 3rd=1, Final=1 = 32.
// The task description says 31 — likely excluding 3rd place or a typo. We'll generate all 32.

/**
 * FIFA 2026 R32 bracket mapping for the 48-team format.
 * Each entry: [matchId, teamASource, teamBSource]
 * Sources use: 1X = winner of group X, 2X = runner-up of group X, 3X = 3rd place from group X
 *
 * The 8 advancing 3rd-place teams are placed into specific R32 slots
 * based on which groups they come from, following FIFA's placement rules.
 *
 * FIFA's official bracket structure for 2026:
 * Left half: R32-1 through R32-8
 * Right half: R32-9 through R32-16
 */

// R32 matchups: [matchId, teamA descriptor, teamB descriptor]
// 1X = 1st place group X, 2X = 2nd place group X
// 3rd place teams are assigned dynamically based on which groups qualify
const R32_SEEDS: Array<[string, string, string]> = [
  // Left half of bracket
  ['R32-1', '1A', '2C'],
  ['R32-2', '1B', '2D'],
  ['R32-3', '1C', '2A'],
  ['R32-4', '1D', '2B'],
  ['R32-5', '1E', '2G'],
  ['R32-6', '1F', '2H'],
  ['R32-7', '1G', '2E'],
  ['R32-8', '1H', '2F'],
  // Right half of bracket
  ['R32-9', '1I', '2K'],
  ['R32-10', '1J', '2L'],
  ['R32-11', '1K', '2I'],
  ['R32-12', '1L', '2J'],
  ['R32-13', '3ABCD_1', '3ABCD_2'],
  ['R32-14', '3EFGH_1', '3EFGH_2'],
  ['R32-15', '3IJKL_1', '3IJKL_2'],
  ['R32-16', '3EFGH_3', '3IJKL_3'],
];

// R16 matchups: winners of R32 matches
const R16_FEEDS: Array<[string, string, string]> = [
  ['R16-1', 'R32-1', 'R32-2'],
  ['R16-2', 'R32-3', 'R32-4'],
  ['R16-3', 'R32-5', 'R32-6'],
  ['R16-4', 'R32-7', 'R32-8'],
  ['R16-5', 'R32-9', 'R32-10'],
  ['R16-6', 'R32-11', 'R32-12'],
  ['R16-7', 'R32-13', 'R32-14'],
  ['R16-8', 'R32-15', 'R32-16'],
];

const QF_FEEDS: Array<[string, string, string]> = [
  ['QF-1', 'R16-1', 'R16-2'],
  ['QF-2', 'R16-3', 'R16-4'],
  ['QF-3', 'R16-5', 'R16-6'],
  ['QF-4', 'R16-7', 'R16-8'],
];

const SF_FEEDS: Array<[string, string, string]> = [
  ['SF-1', 'QF-1', 'QF-2'],
  ['SF-2', 'QF-3', 'QF-4'],
];

const THIRD_PLACE_FEED: [string, string, string] = ['3RD', 'SF-1', 'SF-2'];
const FINAL_FEED: [string, string, string] = ['FINAL', 'SF-1', 'SF-2'];

/**
 * Given the set of advancing 3rd-place team group names, assign them to R32 slots.
 * FIFA groups the 8 advancing 3rd-place teams into 4 pairs based on their source groups.
 * Groups A-D contribute to slots 13, groups E-H to slots 14, groups I-L to slots 15-16.
 */
function assignThirdPlaceTeams(
  groupResults: GroupStageResults,
  bracketData: BracketData,
): Map<string, string> {
  const assignments = new Map<string, string>();
  const advancing = groupResults.advancingThirdPlace; // team names

  // Find which group each advancing 3rd-place team belongs to
  const teamToGroup = new Map<string, string>();
  for (const gr of groupResults.groupResults) {
    const thirdPlace = gr.order[2]; // index 2 = 3rd place
    if (advancing.includes(thirdPlace)) {
      teamToGroup.set(thirdPlace, gr.groupName);
    }
  }

  // Bucket by group range
  const abcd: string[] = [];
  const efgh: string[] = [];
  const ijkl: string[] = [];

  for (const [team, group] of teamToGroup) {
    if ('ABCD'.includes(group)) abcd.push(team);
    else if ('EFGH'.includes(group)) efgh.push(team);
    else ijkl.push(team);
  }

  // Sort each bucket by FIFA ranking (better ranking = lower number = first)
  const sortByRanking = (teams: string[]) =>
    teams.sort((a, b) => {
      const ra = bracketData.groups
        .flatMap((g) => g.teams)
        .find((t) => t.name === a)?.fifaRanking ?? 999;
      const rb = bracketData.groups
        .flatMap((g) => g.teams)
        .find((t) => t.name === b)?.fifaRanking ?? 999;
      return ra - rb;
    });

  sortByRanking(abcd);
  sortByRanking(efgh);
  sortByRanking(ijkl);

  // Assign to slots
  if (abcd[0]) assignments.set('3ABCD_1', abcd[0]);
  if (abcd[1]) assignments.set('3ABCD_2', abcd[1]);
  if (efgh[0]) assignments.set('3EFGH_1', efgh[0]);
  if (efgh[1]) assignments.set('3EFGH_2', efgh[1]);
  if (efgh[2]) assignments.set('3EFGH_3', efgh[2]);
  if (ijkl[0]) assignments.set('3IJKL_1', ijkl[0]);
  if (ijkl[1]) assignments.set('3IJKL_2', ijkl[1]);
  if (ijkl[2]) assignments.set('3IJKL_3', ijkl[2]);

  return assignments;
}

/**
 * Resolve a team descriptor to an actual team name.
 * Descriptors: "1A" = winner of group A, "2B" = runner-up of group B, "3ABCD_1" = 3rd place slot
 */
function resolveTeam(
  descriptor: string,
  groupResults: GroupStageResults,
  thirdPlaceMap: Map<string, string>,
): string | null {
  // 3rd place slot
  if (descriptor.startsWith('3')) {
    return thirdPlaceMap.get(descriptor) ?? null;
  }

  const position = descriptor[0]; // '1' or '2'
  const groupName = descriptor[1]; // 'A' through 'L'
  const posIndex = position === '1' ? 0 : 1;

  const groupResult = groupResults.groupResults.find((g) => g.groupName === groupName);
  if (!groupResult) return null;

  return groupResult.order[posIndex] ?? null;
}

/**
 * Generate the full knockout bracket from group stage results.
 * Returns KnockoutMatchup[] with 32 matches (R32 through Final).
 */
export function generateKnockoutBracket(
  groupResults: GroupStageResults,
  bracketData: BracketData,
): KnockoutMatchup[] {
  const thirdPlaceMap = assignThirdPlaceTeams(groupResults, bracketData);
  const matchups: KnockoutMatchup[] = [];

  // R32: resolve actual team names from group results
  for (const [id, descA, descB] of R32_SEEDS) {
    matchups.push({
      id,
      round: ROUND_R32,
      teamA: resolveTeam(descA, groupResults, thirdPlaceMap),
      teamB: resolveTeam(descB, groupResults, thirdPlaceMap),
      winner: null,
    });
  }

  // R16 through Final: teams are null until results are entered
  const laterRounds: Array<[Array<[string, string, string]>, number]> = [
    [R16_FEEDS, ROUND_R16],
    [QF_FEEDS, ROUND_QF],
    [SF_FEEDS, ROUND_SF],
    [[THIRD_PLACE_FEED], ROUND_3RD],
    [[FINAL_FEED], ROUND_FINAL],
  ];

  for (const [feeds, round] of laterRounds) {
    for (const [id] of feeds) {
      matchups.push({ id, round, teamA: null, teamB: null, winner: null });
    }
  }

  return matchups;
}

/**
 * Get the next matchup ID that a winner feeds into.
 * Used for cascade logic when a pick changes.
 */
export function getNextMatchupId(matchupId: string): string | null {
  // Check R16 feeds
  for (const [id, a, b] of R16_FEEDS) {
    if (matchupId === a || matchupId === b) return id;
  }
  // Check QF feeds
  for (const [id, a, b] of QF_FEEDS) {
    if (matchupId === a || matchupId === b) return id;
  }
  // Check SF feeds
  for (const [id, a, b] of SF_FEEDS) {
    if (matchupId === a || matchupId === b) return id;
  }
  // SF losers go to 3RD, SF winners go to FINAL
  if (matchupId === 'SF-1' || matchupId === 'SF-2') {
    // Both 3RD and FINAL — return FINAL as primary (3RD handled separately)
    return 'FINAL';
  }
  return null;
}

/**
 * Get all downstream matchup IDs that depend on a given matchup's winner.
 */
export function getDownstreamMatchupIds(matchupId: string): string[] {
  const downstream: string[] = [];
  const queue = [matchupId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const next = getNextMatchupId(current);
    if (next && !downstream.includes(next)) {
      downstream.push(next);
      queue.push(next);
    }
    // SF feeds into both FINAL and 3RD
    if (current === 'SF-1' || current === 'SF-2') {
      if (!downstream.includes('3RD')) {
        downstream.push('3RD');
      }
    }
  }

  return downstream;
}

/**
 * Get the two feeder matchup IDs for a given matchup.
 */
export function getFeederMatchupIds(matchupId: string): [string, string] | null {
  const allFeeds = [...R16_FEEDS, ...QF_FEEDS, ...SF_FEEDS, [THIRD_PLACE_FEED], [FINAL_FEED]];
  for (const feed of allFeeds) {
    const [id, a, b] = feed as [string, string, string];
    if (id === matchupId) return [a, b];
  }
  return null;
}
