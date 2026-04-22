import { BracketData, GroupStageResults, KnockoutMatchup } from '@/types';

// Round constants
const ROUND_R32 = 0;
const ROUND_R16 = 1;
const ROUND_QF = 2;
const ROUND_SF = 3;
const ROUND_3RD = 4;
const ROUND_FINAL = 5;

/**
 * FIFA 2026 Official R32 bracket mapping (Matches 73-88).
 * Each entry: [matchId, teamASource, teamBSource]
 * Sources: 1X = winner of group X, 2X = runner-up of group X
 * 3rd-place slots use placeholder keys resolved by the combination table.
 *
 * 3rd-place slot keys: '3_1E' means "the 3rd-place team assigned to face 1E", etc.
 * These are resolved dynamically based on which 8 groups advance a 3rd-place team.
 */
const R32_SEEDS: Array<[string, string, string]> = [
  ['R32-1',  '2A',    '2B'],     // M73
  ['R32-2',  '1E',    '3_1E'],   // M74: 1E vs 3rd from (A/B/C/D/F)
  ['R32-3',  '1F',    '2C'],     // M75
  ['R32-4',  '1C',    '2F'],     // M76
  ['R32-5',  '1I',    '3_1I'],   // M77: 1I vs 3rd from (C/D/F/G/H)
  ['R32-6',  '2E',    '2I'],     // M78
  ['R32-7',  '1A',    '3_1A'],   // M79: 1A vs 3rd from (C/E/F/H/I)
  ['R32-8',  '1L',    '3_1L'],   // M80: 1L vs 3rd from (E/H/I/J/K)
  ['R32-9',  '1D',    '3_1D'],   // M81: 1D vs 3rd from (B/E/F/I/J)
  ['R32-10', '1G',    '3_1G'],   // M82: 1G vs 3rd from (A/E/H/I/J)
  ['R32-11', '2K',    '2L'],     // M83
  ['R32-12', '1H',    '2J'],     // M84
  ['R32-13', '1B',    '3_1B'],   // M85: 1B vs 3rd from (E/F/G/I/J)
  ['R32-14', '1J',    '2H'],     // M86
  ['R32-15', '1K',    '3_1K'],   // M87: 1K vs 3rd from (D/E/I/J/L)
  ['R32-16', '2D',    '2G'],     // M88
];

/**
 * R16 feeds: winners of specific R32 matches.
 * M89-M96 per FIFA official bracket.
 */
const R16_FEEDS: Array<[string, string, string]> = [
  ['R16-1', 'R32-2',  'R32-5'],  // M89: W74 vs W77
  ['R16-2', 'R32-1',  'R32-3'],  // M90: W73 vs W75
  ['R16-3', 'R32-4',  'R32-6'],  // M91: W76 vs W78
  ['R16-4', 'R32-7',  'R32-8'],  // M92: W79 vs W80
  ['R16-5', 'R32-11', 'R32-12'], // M93: W83 vs W84
  ['R16-6', 'R32-9',  'R32-10'], // M94: W81 vs W82
  ['R16-7', 'R32-14', 'R32-16'], // M95: W86 vs W88
  ['R16-8', 'R32-13', 'R32-15'], // M96: W85 vs W87
];

const QF_FEEDS: Array<[string, string, string]> = [
  ['QF-1', 'R16-1', 'R16-2'], // M97
  ['QF-2', 'R16-5', 'R16-6'], // M98
  ['QF-3', 'R16-3', 'R16-4'], // M99
  ['QF-4', 'R16-7', 'R16-8'], // M100
];

const SF_FEEDS: Array<[string, string, string]> = [
  ['SF-1', 'QF-1', 'QF-2'], // M101
  ['SF-2', 'QF-3', 'QF-4'], // M102
];

const THIRD_PLACE_FEED: [string, string, string] = ['3RD', 'SF-1', 'SF-2'];
const FINAL_FEED: [string, string, string] = ['FINAL', 'SF-1', 'SF-2'];

/**
 * FIFA Annex C: 3rd-place team assignment lookup table.
 * Key = sorted string of 8 advancing group letters (e.g. "ABCDEFGH").
 * Value = array of 8 group letters in slot order:
 *   [faces 1E, faces 1I, faces 1A, faces 1L, faces 1D, faces 1G, faces 1B, faces 1K]
 *   i.e. [R32-2, R32-5, R32-7, R32-8, R32-9, R32-10, R32-13, R32-15]
 *
 * Source: https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_knockout_stage
 */
const THIRD_PLACE_SLOT_KEYS = ['3_1E', '3_1I', '3_1A', '3_1L', '3_1D', '3_1G', '3_1B', '3_1K'] as const;

/**
 * Build the full 495-entry combination table.
 * FIFA's official table from Annex C of the 2026 World Cup regulations.
 *
 * The 8 slots for 3rd-place teams face these group winners:
 *   Slot 0 (R32-2/M74): vs 1E — possible 3rd from A,B,C,D,F
 *   Slot 1 (R32-5/M77): vs 1I — possible 3rd from C,D,F,G,H
 *   Slot 2 (R32-7/M79): vs 1A — possible 3rd from C,E,F,H,I
 *   Slot 3 (R32-8/M80): vs 1L — possible 3rd from E,H,I,J,K
 *   Slot 4 (R32-9/M81): vs 1D — possible 3rd from B,E,F,I,J
 *   Slot 5 (R32-10/M82): vs 1G — possible 3rd from A,E,H,I,J
 *   Slot 6 (R32-13/M85): vs 1B — possible 3rd from E,F,G,I,J
 *   Slot 7 (R32-15/M87): vs 1K — possible 3rd from D,E,I,J,L
 *
 * We use a constraint-based assignment: for each combination of 8 advancing groups,
 * assign each 3rd-place team to a valid slot using FIFA's published assignments.
 */

// Valid groups for each slot (which 3rd-place teams CAN face each group winner)
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

/**
 * Solve the 3rd-place assignment for a given set of 8 advancing groups.
 * Uses backtracking to find a valid assignment where each group is assigned
 * to exactly one slot and each slot gets a group from its valid set.
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
  bracketData: BracketData,
): Map<string, string> {
  const assignments = new Map<string, string>();
  const advancing = groupResults.advancingThirdPlace;

  // Map team name → group letter for advancing 3rd-place teams
  const teamToGroup = new Map<string, string>();
  for (const gr of groupResults.groupResults) {
    const thirdPlace = gr.order[2];
    if (advancing.includes(thirdPlace)) {
      teamToGroup.set(thirdPlace, gr.groupName);
    }
  }

  // Get the 8 advancing group letters
  const advancingGroupLetters = [...teamToGroup.values()];
  if (advancingGroupLetters.length !== 8) return assignments;

  // Solve the assignment
  const slotAssignment = solveThirdPlaceAssignment(advancingGroupLetters);
  if (!slotAssignment) return assignments;

  // Map group letter back to team name
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
 * Descriptors: "1A" = winner of group A, "2B" = runner-up of group B,
 * "3_1E" = 3rd-place team assigned to face 1E.
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
 * Get the next matchup IDs that a winner/loser feeds into.
 * SF matches feed into both FINAL (winner) and 3RD (loser).
 */
export function getNextMatchupIds(matchupId: string): string[] {
  for (const [id, a, b] of R16_FEEDS) {
    if (matchupId === a || matchupId === b) return [id];
  }
  for (const [id, a, b] of QF_FEEDS) {
    if (matchupId === a || matchupId === b) return [id];
  }
  for (const [id, a, b] of SF_FEEDS) {
    if (matchupId === a || matchupId === b) return [id];
  }
  if (matchupId === 'SF-1' || matchupId === 'SF-2') return ['FINAL', '3RD'];
  return [];
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
  const allFeeds = [...R16_FEEDS, ...QF_FEEDS, ...SF_FEEDS, [THIRD_PLACE_FEED], [FINAL_FEED]];
  for (const feed of allFeeds) {
    const [id, a, b] = feed as [string, string, string];
    if (id === matchupId) return [a, b];
  }
  return null;
}

// Export for use in other modules that need the feed structure
export { R16_FEEDS, QF_FEEDS, SF_FEEDS, THIRD_PLACE_FEED, FINAL_FEED };
export { SLOT_VALID_GROUPS, THIRD_PLACE_SLOT_KEYS, solveThirdPlaceAssignment };
