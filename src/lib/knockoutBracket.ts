import { BracketData, GroupStageResults, KnockoutMatchup } from '@/types';
import { generateGenericBracket } from '@/lib/bracketEngine';
import { toFifaId, toFifaRound } from '@/lib/bracketUtils';

// Round constants (FIFA scheme)
const ROUND_R32 = 0;

const TEAM_COUNT = 32;

/**
 * FIFA 2026 Official R32 bracket mapping (Matches 73-88).
 * Each entry: [position (1-indexed), teamASource, teamBSource]
 * Sources: 1X = winner of group X, 2X = runner-up of group X
 * 3rd-place slot keys: '3_1E' means "the 3rd-place team assigned to face 1E".
 */
const R32_SEEDS: Array<[number, string, string]> = [
  [1,  '2A',    '2B'],     // M73
  [2,  '1E',    '3_1E'],   // M74
  [3,  '1F',    '2C'],     // M75
  [4,  '1C',    '2F'],     // M76
  [5,  '1I',    '3_1I'],   // M77
  [6,  '2E',    '2I'],     // M78
  [7,  '1A',    '3_1A'],   // M79
  [8,  '1L',    '3_1L'],   // M80
  [9,  '1D',    '3_1D'],   // M81
  [10, '1G',    '3_1G'],   // M82
  [11, '2K',    '2L'],     // M83
  [12, '1H',    '2J'],     // M84
  [13, '1B',    '3_1B'],   // M85
  [14, '1J',    '2H'],     // M86
  [15, '1K',    '3_1K'],   // M87
  [16, '2D',    '2G'],     // M88
];

/**
 * R16 feeds: winners of specific R32 matches (FIFA official bracket).
 * Each entry: [R16 position, R32 feeder A position, R32 feeder B position]
 */
const R16_FEEDS: Array<[number, number, number]> = [
  [1, 2,  5],  // M89: W74 vs W77
  [2, 1,  3],  // M90: W73 vs W75
  [3, 4,  6],  // M91: W76 vs W78
  [4, 7,  8],  // M92: W79 vs W80
  [5, 11, 12], // M93: W83 vs W84
  [6, 9,  10], // M94: W81 vs W82
  [7, 14, 16], // M95: W86 vs W88
  [8, 13, 15], // M96: W85 vs W87
];

const QF_FEEDS: Array<[number, number, number]> = [
  [1, 1, 2], // M97
  [2, 5, 6], // M98
  [3, 3, 4], // M99
  [4, 7, 8], // M100
];

const SF_FEEDS: Array<[number, number, number]> = [
  [1, 1, 2], // M101
  [2, 3, 4], // M102
];

// Valid groups for each 3rd-place slot
const SLOT_VALID_GROUPS: string[][] = [
  ['A', 'B', 'C', 'D', 'F'],       // Slot 0: vs 1E
  ['C', 'D', 'F', 'G', 'H'],       // Slot 1: vs 1I
  ['C', 'E', 'F', 'H', 'I'],       // Slot 2: vs 1A
  ['E', 'H', 'I', 'J', 'K'],       // Slot 3: vs 1L
  ['B', 'E', 'F', 'I', 'J'],       // Slot 4: vs 1D
  ['A', 'E', 'H', 'I', 'J'],       // Slot 5: vs 1G
  ['E', 'F', 'G', 'I', 'J'],       // Slot 6: vs 1B
  ['D', 'E', 'I', 'J', 'L'],       // Slot 7: vs 1K
];

const THIRD_PLACE_SLOT_KEYS = [
  '3_1E', '3_1I', '3_1A', '3_1L', '3_1D', '3_1G', '3_1B', '3_1K',
] as const;

/**
 * Solve the 3rd-place assignment for a given set of 8 advancing groups.
 * Uses backtracking to find a valid assignment.
 */
function solveThirdPlaceAssignment(advancingGroups: string[]): string[] | null {
  const sorted = [...advancingGroups].sort();
  const assignment: (string | null)[] = new Array(8).fill(null);
  const used = new Set<string>();

  function backtrack(slotIdx: number): boolean {
    if (slotIdx === 8) return used.size === 8;
    const validForSlot = SLOT_VALID_GROUPS[slotIdx].filter(
      (g) => sorted.includes(g) && !used.has(g),
    );
    for (const g of validForSlot) {
      assignment[slotIdx] = g;
      used.add(g);
      if (backtrack(slotIdx + 1)) return true;
      used.delete(g);
      assignment[slotIdx] = null;
    }
    return false;
  }

  if (backtrack(0)) return assignment as string[];
  return null;
}

/**
 * Given the set of advancing 3rd-place teams, return a map from
 * slot key (e.g. '3_1E') to the actual team name.
 */
function assignThirdPlaceTeams(
  groupResults: GroupStageResults,
  _bracketData: BracketData,
): Map<string, string> {
  const assignments = new Map<string, string>();
  const advancing = groupResults.advancingThirdPlace;

  const teamToGroup = new Map<string, string>();
  for (const gr of groupResults.groupResults) {
    const thirdPlace = gr.order[2];
    if (advancing.includes(thirdPlace)) {
      teamToGroup.set(thirdPlace, gr.groupName);
    }
  }

  const advancingGroupLetters = [...teamToGroup.values()];
  if (advancingGroupLetters.length !== 8) return assignments;

  const slotAssignment = solveThirdPlaceAssignment(advancingGroupLetters);
  if (!slotAssignment) return assignments;

  const groupToTeam = new Map<string, string>();
  for (const [team, group] of teamToGroup) {
    groupToTeam.set(group, team);
  }

  for (let i = 0; i < THIRD_PLACE_SLOT_KEYS.length; i++) {
    const groupLetter = slotAssignment[i];
    const teamName = groupToTeam.get(groupLetter);
    if (teamName) {
      assignments.set(THIRD_PLACE_SLOT_KEYS[i], teamName);
    }
  }

  return assignments;
}

/**
 * Resolve a team descriptor to an actual team name.
 */
function resolveTeam(
  descriptor: string,
  groupResults: GroupStageResults,
  thirdPlaceMap: Map<string, string>,
): string | null {
  if (descriptor.startsWith('3_')) {
    return thirdPlaceMap.get(descriptor) ?? null;
  }
  const position = descriptor[0];
  const groupName = descriptor[1];
  const posIndex = position === '1' ? 0 : 1;
  const groupResult = groupResults.groupResults.find((g) => g.groupName === groupName);
  return groupResult?.order[posIndex] ?? null;
}

/**
 * Build the FIFA-specific feeder map for R16→R32, QF→R16, SF→QF, FINAL→SF, 3RD→SF.
 * Returns a map from matchup ID to [feederA ID, feederB ID].
 */
function buildFeederMap(): Map<string, [string, string]> {
  const map = new Map<string, [string, string]>();
  for (const [pos, a, b] of R16_FEEDS) {
    map.set(`R16-${pos}`, [`R32-${a}`, `R32-${b}`]);
  }
  for (const [pos, a, b] of QF_FEEDS) {
    map.set(`QF-${pos}`, [`R16-${a}`, `R16-${b}`]);
  }
  for (const [pos, a, b] of SF_FEEDS) {
    map.set(`SF-${pos}`, [`QF-${a}`, `QF-${b}`]);
  }
  map.set('3RD', ['SF-1', 'SF-2']);
  map.set('FINAL', ['SF-1', 'SF-2']);
  return map;
}

const FEEDER_MAP = buildFeederMap();

/**
 * Generate the full knockout bracket from group stage results.
 * Uses the generic bracket engine for the skeleton, then populates
 * R32 teams from FIFA seeding and maps IDs to FIFA format.
 */
export function generateKnockoutBracket(
  groupResults: GroupStageResults,
  bracketData: BracketData,
): KnockoutMatchup[] {
  // Generate generic skeleton and convert to FIFA IDs
  const skeleton = generateGenericBracket(TEAM_COUNT, true);
  const matchups: KnockoutMatchup[] = skeleton.map((m) => ({
    ...m,
    id: toFifaId(m.id),
    round: toFifaRound(m.round),
  }));

  // Populate R32 teams from group results + FIFA seeding
  const thirdPlaceMap = assignThirdPlaceTeams(groupResults, bracketData);
  const matchupMap = new Map(matchups.map((m) => [m.id, m]));

  for (const [pos, descA, descB] of R32_SEEDS) {
    const m = matchupMap.get(`R32-${pos}`);
    if (m) {
      m.teamA = resolveTeam(descA, groupResults, thirdPlaceMap);
      m.teamB = resolveTeam(descB, groupResults, thirdPlaceMap);
    }
  }

  return matchups;
}

/**
 * Get the next matchup IDs that a winner/loser feeds into.
 * SF matches feed into both FINAL (winner) and 3RD (loser).
 */
export function getNextMatchupIds(matchupId: string): string[] {
  const result: string[] = [];
  for (const [id, [a, b]] of FEEDER_MAP) {
    if (matchupId === a || matchupId === b) {
      if (!result.includes(id)) result.push(id);
    }
  }
  return result;
}

/** @deprecated Use getNextMatchupIds instead */
export function getNextMatchupId(matchupId: string): string | null {
  const ids = getNextMatchupIds(matchupId);
  return ids[0] ?? null;
}

/**
 * Get all downstream matchup IDs that depend on a given matchup's winner.
 */
export function getDownstreamMatchupIds(matchupId: string): string[] {
  const downstream: string[] = [];
  const queue = [matchupId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of getNextMatchupIds(current)) {
      if (!downstream.includes(next)) {
        downstream.push(next);
        queue.push(next);
      }
    }
  }
  return downstream;
}

/**
 * Get the two feeder matchup IDs for a given matchup.
 */
export function getFeederMatchupIds(matchupId: string): [string, string] | null {
  return FEEDER_MAP.get(matchupId) ?? null;
}

export { SLOT_VALID_GROUPS, THIRD_PLACE_SLOT_KEYS, solveThirdPlaceAssignment };
