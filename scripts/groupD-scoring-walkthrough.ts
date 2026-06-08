// Group D scoring walkthrough — exercises scoreGroupStage with edgecdec's
// real Group D pick across a handful of scenarios so we can confirm the
// math matches the documented rules. Run with `npx tsx scripts/groupD-scoring-walkthrough.ts`.

import { scoreGroupStage } from '../src/lib/scoring';
import { DEFAULT_SCORING, type BracketData, type GroupPrediction, type GroupStageResults } from '../src/types';

// Synthetic Group D bracket data — only the fields scoreGroupStage actually uses.
// The function reads `groupSeed` (= pot) for upset bonus and `fifaRanking` for nothing
// in scoreGroupStage (knockout uses ranking).
const GROUP_D_TEAMS = [
  { name: 'USA',        fifaRanking: 14, pot: 1 as const, groupSeed: 1 as const },
  { name: 'Paraguay',   fifaRanking: 39, pot: 3 as const, groupSeed: 3 as const },
  { name: 'Australia',  fifaRanking: 26, pot: 2 as const, groupSeed: 2 as const },
  { name: 'Turkiye',    fifaRanking: 25, pot: 4 as const, groupSeed: 4 as const },
];

const bracketData: BracketData = {
  groups: [
    {
      name: 'D',
      teams: [
        { ...GROUP_D_TEAMS[0], espnId: 0 },
        { ...GROUP_D_TEAMS[1], espnId: 0 },
        { ...GROUP_D_TEAMS[2], espnId: 0 },
        { ...GROUP_D_TEAMS[3], espnId: 0 },
      ],
    },
  ],
};

// edgecdec's Group D prediction: USA > Turkiye > Paraguay > Australia
// with Paraguay also picked as one of 8 advancing 3rd-place teams.
const edgecdecPrediction: GroupPrediction = {
  groupName: 'D',
  order: ['USA', 'Turkiye', 'Paraguay', 'Australia'],
};
const edgecdec3rd: string[] = ['Paraguay']; // (real picks include 7 other groups but Group D scoring only cares about Paraguay)

// =============================================================================
// SCENARIOS
// =============================================================================

interface Scenario {
  name: string;
  /** Final order [1st, 2nd, 3rd, 4th] for Group D. */
  order: [string, string, string, string];
  /** Whether the 3rd place team advances as one of the best 8. */
  thirdAdvances: boolean;
  notes: string;
}

const scenarios: Scenario[] = [
  {
    name: '1) Perfect order',
    order: ['USA', 'Turkiye', 'Paraguay', 'Australia'],
    thirdAdvances: true,
    notes: 'edgecdec picked exactly this order, and his 3rd-place pick (Paraguay) advances.',
  },
  {
    name: '2) Top 2 right but order swapped',
    order: ['Turkiye', 'USA', 'Paraguay', 'Australia'],
    thirdAdvances: true,
    notes: 'USA & Turkiye both advance (matches), Paraguay still 3rd & advances, Australia last.',
  },
  {
    name: '3) USA dominates, Australia takes 2nd, Paraguay flames out (3rd, no advance)',
    order: ['USA', 'Australia', 'Paraguay', 'Turkiye'],
    thirdAdvances: false,
    notes: 'edgecdec only nailed 1st place. Paraguay is 3rd as predicted but does NOT advance, so the 3rd-place pick whiffs.',
  },
  {
    name: '4) Big upset: Turkiye wins group, Paraguay second',
    order: ['Turkiye', 'Paraguay', 'USA', 'Australia'],
    thirdAdvances: false,
    notes: 'Turkiye (pot 4) winning group = significant upset bonus IF predicted high. edgecdec had Turkiye 2nd, Paraguay 3rd.',
  },
  {
    name: '5) Australia surprise winner, Paraguay 4th',
    order: ['Australia', 'USA', 'Turkiye', 'Paraguay'],
    thirdAdvances: false,
    notes: 'edgecdec had Australia last; that whiffs. Paraguay 4th instead of 3rd.',
  },
];

function score(scenario: Scenario): void {
  const results: GroupStageResults = {
    groupResults: [{ groupName: 'D', order: scenario.order }],
    advancingThirdPlace: scenario.thirdAdvances ? [scenario.order[2]] : [],
  };
  const out = scoreGroupStage(
    [edgecdecPrediction],
    edgecdec3rd,
    results,
    bracketData,
    DEFAULT_SCORING.groupStage,
  );

  console.log('=='.repeat(40));
  console.log(scenario.name);
  console.log('  Actual order:', scenario.order.join(' > '), scenario.thirdAdvances ? '(3rd advances)' : '(3rd eliminated)');
  console.log('  Notes:', scenario.notes);

  // Walk through each team and explain the points.
  console.log('  Team-by-team breakdown:');
  for (let i = 0; i < 4; i++) {
    const team = scenario.order[i];
    const actualPos = i + 1;
    const predPos = edgecdecPrediction.order.indexOf(team) + 1;
    const seed = GROUP_D_TEAMS.find((t) => t.name === team)?.groupSeed ?? 0;
    const predAdv = predPos <= 2 || (predPos === 3 && edgecdec3rd.includes(team));
    const actAdv = actualPos <= 2 || (actualPos === 3 && scenario.thirdAdvances);
    const advMatch = predAdv === actAdv;
    const exact = predPos === actualPos;
    const upsetBonus = (actualPos <= predPos) ? Math.max(0, seed - predPos) : 0;
    console.log(`    ${team.padEnd(11)} actual=#${actualPos}, predicted=#${predPos}, seed=${seed}`
      + ` | adv-match=${advMatch ? 'YES (+1)' : 'no '}`
      + ` | exact=${exact ? 'YES (+1)' : 'no '}`
      + ` | upset bonus = ${upsetBonus}`);
  }

  const detail = out.perGroup[0];
  console.log('  Score breakdown:');
  console.log(`    Advance correct  : ${detail.advanceCorrectPoints} pts`);
  console.log(`    Exact position   : ${detail.exactPositionPoints} pts`);
  console.log(`    Upset bonus      : ${detail.upsetBonusPoints} pts`);
  console.log(`    Adv. group bonus : ${detail.advancementCorrectBonus} pts (all 4 advance picks correct: ${detail.advancementCorrectBonus === DEFAULT_SCORING.groupStage.advancementCorrectBonus})`);
  console.log(`    Perfect-order    : ${detail.perfectOrderBonus} pts (all 4 positions correct: ${detail.perfectOrderBonus === DEFAULT_SCORING.groupStage.perfectOrderBonus})`);
  console.log(`    GROUP TOTAL      : ${detail.total} pts`);
  console.log('');
}

console.log('Group D scoring walkthrough — edgecdec prediction: USA > Turkiye > Paraguay > Australia (Paraguay among top-8 3rd place)');
console.log('');
console.log('SCORING RULES (from DEFAULT_SCORING.groupStage):');
console.log(`  +${DEFAULT_SCORING.groupStage.advanceCorrect}  per team where prediction's "advances" matches reality`);
console.log(`  +${DEFAULT_SCORING.groupStage.exactPosition}  per team finishing at exactly their predicted position`);
console.log(`  +${DEFAULT_SCORING.groupStage.upsetBonusPerPlace}  per (seed - predictedPos) when actualPos <= predictedPos & seed > predictedPos`);
console.log(`  +${DEFAULT_SCORING.groupStage.advancementCorrectBonus}  bonus if all 4 "advance/eliminate" predictions are right`);
console.log(`  +${DEFAULT_SCORING.groupStage.perfectOrderBonus}  bonus if all 4 positions are exactly right`);
console.log('');

for (const scenario of scenarios) {
  score(scenario);
}

// =============================================================================
// LIVE-SCORE INTEGRATION SANITY CHECK
// =============================================================================
//
// Show how an in-progress USA vs Paraguay match flows through the live model
// into Group D standings. Useful to confirm that the sampleLiveScores → group
// stage simulator → scoring pipeline produces sensible distributions.
import { sampleLiveScores } from '../src/lib/matchOdds';

console.log('=='.repeat(40));
console.log('LIVE-SCORE PIPELINE SANITY CHECK');
console.log('Scenario: USA 1-0 Paraguay at 60\' (other Group D matches not yet played)');
console.log('');

const samples = sampleLiveScores('USA', 'Paraguay', 1, 0, 60, 5000, { stage: 'group' });
if (!samples) {
  console.log('ERROR: PELE ratings missing for USA or Paraguay');
} else {
  // Tally final scoreline distribution
  const tally = new Map<string, number>();
  let usaWin = 0, draw = 0, parWin = 0;
  let totalA = 0, totalB = 0;
  for (const [a, b] of samples) {
    const k = `${a}-${b}`;
    tally.set(k, (tally.get(k) ?? 0) + 1);
    if (a > b) usaWin++;
    else if (b > a) parWin++;
    else draw++;
    totalA += a;
    totalB += b;
  }
  const top = [...tally.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5);
  console.log('  Final-score distribution:');
  console.log(`    USA win: ${(usaWin / samples.length * 100).toFixed(1)}%`);
  console.log(`    Draw:    ${(draw / samples.length * 100).toFixed(1)}%`);
  console.log(`    PAR win: ${(parWin / samples.length * 100).toFixed(1)}%`);
  console.log(`  Most likely scorelines:`);
  for (const [k, c] of top) console.log(`    ${k}: ${(c / samples.length * 100).toFixed(1)}%`);
  console.log(`  Expected final score: USA ${(totalA / samples.length).toFixed(2)} - ${(totalB / samples.length).toFixed(2)} PAR`);
  console.log('');
  console.log('  How this flows into the forecast:');
  console.log('  - Each tournament-sim iteration randomly picks one of these 5000 sampled');
  console.log('    scorelines for USA-Paraguay, then simulates the other 5 Group D matches.');
  console.log('  - Standings, points, GD, GF tiebreakers, and 3rd-place advancement all derive');
  console.log('    from the resulting full-group table.');
  console.log('  - edgecdec\'s scoring then runs against that simulated final order, exactly as');
  console.log('    in the 5 deterministic scenarios above.');
}

