// Group D scoring walkthrough — exercises scoreGroupStage with edgecdec's
// real Group D pick across 9 scenarios. For each one, the script walks through
// every team's contribution to the score with explicit math, then totals.
//
// Run: npx tsx scripts/groupD-scoring-walkthrough.ts

import { scoreGroupStage } from '../src/lib/scoring';
import { DEFAULT_SCORING, type BracketData, type GroupPrediction, type GroupStageResults } from '../src/types';

// Group D facts (seeds = pots in our schema).
const GROUP_D = [
  { name: 'USA',        rank: 14, pot: 1 as const },
  { name: 'Paraguay',   rank: 39, pot: 3 as const },
  { name: 'Australia',  rank: 26, pot: 2 as const },
  { name: 'Turkiye',    rank: 25, pot: 4 as const },
];

const bracketData: BracketData = {
  groups: [{
    name: 'D',
    teams: [
      { ...GROUP_D[0], groupSeed: 1, espnId: 0 },
      { ...GROUP_D[1], groupSeed: 3, espnId: 0 },
      { ...GROUP_D[2], groupSeed: 2, espnId: 0 },
      { ...GROUP_D[3], groupSeed: 4, espnId: 0 },
    ] as BracketData['groups'][0]['teams'],
  }],
};

// edgecdec's actual prediction
const PREDICTION: GroupPrediction = {
  groupName: 'D',
  order: ['USA', 'Turkiye', 'Paraguay', 'Australia'],
};
const PARAGUAY_PICKED_AS_3RD = ['Paraguay']; // edgecdec's 3rd-place advancing list (Group D portion)

const RULES = DEFAULT_SCORING.groupStage;
const SEED: Record<string, number> = { USA: 1, Paraguay: 3, Australia: 2, Turkiye: 4 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function predictedAdvances(team: string): boolean {
  const idx = PREDICTION.order.indexOf(team);
  if (idx === -1) return false;
  const pos = idx + 1;
  if (pos <= 2) return true;
  if (pos === 3) return PARAGUAY_PICKED_AS_3RD.includes(team);
  return false;
}

function actuallyAdvances(team: string, order: string[], thirdAdvances: boolean): boolean {
  const pos = order.indexOf(team) + 1;
  if (pos <= 2) return true;
  if (pos === 3) return thirdAdvances;
  return false;
}

function predictedPos(team: string): number {
  return PREDICTION.order.indexOf(team) + 1;
}

interface Scenario {
  id: string;
  title: string;
  order: [string, string, string, string];
  thirdAdvances: boolean;
  story: string;
}

// ---------------------------------------------------------------------------
// Per-team scoring breakdown
// ---------------------------------------------------------------------------

interface TeamLine {
  team: string;
  actualPos: number;
  predPos: number;
  seed: number;
  advanceMatch: boolean;
  advancePts: number;
  exactMatch: boolean;
  exactPts: number;
  upsetExplanation: string;
  upsetPts: number;
  rowTotal: number;
}

function explainTeam(team: string, actualPos: number, order: string[], thirdAdvances: boolean): TeamLine {
  const predPos = predictedPos(team);
  const seed = SEED[team];
  const predAdv = predictedAdvances(team);
  const actAdv = actuallyAdvances(team, order, thirdAdvances);
  const advanceMatch = predAdv === actAdv;
  const advancePts = advanceMatch ? RULES.advanceCorrect : 0;

  const exactMatch = predPos === actualPos;
  const exactPts = exactMatch ? RULES.exactPosition : 0;

  // Upset bonus: only when team finished AT or BETTER than predicted, and seed > predictedPos
  let upsetPts = 0;
  let upsetExplanation = '';
  if (actualPos <= predPos) {
    const bonus = Math.max(0, seed - predPos);
    upsetPts = bonus * RULES.upsetBonusPerPlace;
    if (bonus > 0) {
      upsetExplanation = `seed ${seed} - predicted ${predPos} = +${bonus}`;
    } else {
      upsetExplanation = `seed ${seed} ≤ predicted ${predPos}, no upset`;
    }
  } else {
    upsetExplanation = `actual ${actualPos} > predicted ${predPos}, no upset bonus possible`;
  }

  return {
    team, actualPos, predPos, seed,
    advanceMatch, advancePts,
    exactMatch, exactPts,
    upsetExplanation, upsetPts,
    rowTotal: advancePts + exactPts + upsetPts,
  };
}

function reasonAdvanceMismatch(team: string, predAdv: boolean, actAdv: boolean): string {
  if (predAdv === actAdv) return '';
  return predAdv
    ? `predicted to advance, did not`
    : `predicted out, but advanced`;
}

function score(scenario: Scenario): { total: number; lines: TeamLine[]; flagAdvance: boolean; flagPerfect: boolean } {
  const results: GroupStageResults = {
    groupResults: [{ groupName: 'D', order: scenario.order }],
    advancingThirdPlace: scenario.thirdAdvances ? [scenario.order[2]] : [],
  };
  const out = scoreGroupStage([PREDICTION], PARAGUAY_PICKED_AS_3RD, results, bracketData, RULES);

  const lines = scenario.order.map((team, i) =>
    explainTeam(team, i + 1, scenario.order, scenario.thirdAdvances),
  );

  const flagAdvance = lines.every(l => l.advanceMatch);
  const flagPerfect = lines.every(l => l.exactMatch);

  // Sanity: our hand-computed total should equal scoreGroupStage's output.
  const handTotal = lines.reduce((s, l) => s + l.rowTotal, 0)
    + (flagAdvance ? RULES.advancementCorrectBonus : 0)
    + (flagPerfect ? RULES.perfectOrderBonus : 0);
  if (handTotal !== out.total) {
    console.error(`!!! Mismatch in ${scenario.id}: hand=${handTotal}, fn=${out.total}`);
  }

  return { total: out.total, lines, flagAdvance, flagPerfect };
}

// ---------------------------------------------------------------------------
// Pretty printing
// ---------------------------------------------------------------------------

function bar(char = '─', n = 78): string {
  return char.repeat(n);
}

function fmtCol(s: string | number, w: number, align: 'left' | 'right' = 'left'): string {
  const str = String(s);
  if (str.length >= w) return str.slice(0, w);
  return align === 'left' ? str.padEnd(w) : str.padStart(w);
}

function printScenario(s: Scenario): void {
  const r = score(s);

  console.log('');
  console.log(bar('═'));
  console.log(`SCENARIO ${s.id}: ${s.title}`);
  console.log(bar('═'));
  console.log(`Final order : ${s.order[0]} > ${s.order[1]} > ${s.order[2]} > ${s.order[3]}`);
  console.log(`3rd place   : ${s.thirdAdvances ? `${s.order[2]} ADVANCES (one of best 8)` : `${s.order[2]} ELIMINATED`}`);
  console.log(`Story       : ${s.story}`);
  console.log('');
  console.log(`edgecdec's prediction: ${PREDICTION.order.join(' > ')} (with Paraguay among the 8 advancing 3rd-place teams)`);
  console.log('');

  // Header
  console.log(
    fmtCol('Team', 10) + ' │ ' +
    fmtCol('Actual', 7) + ' │ ' +
    fmtCol('Pred', 5) + ' │ ' +
    fmtCol('Seed', 5) + ' │ ' +
    fmtCol('Advance match?', 24) + ' │ ' +
    fmtCol('Exact?', 8) + ' │ ' +
    fmtCol('Upset bonus calc', 30) + ' │ ' +
    fmtCol('Row', 4, 'right'),
  );
  console.log(bar());

  for (const line of r.lines) {
    const team = line.team;
    const predAdv = predictedAdvances(team);
    const actAdv = actuallyAdvances(team, s.order, s.thirdAdvances);
    const advCell = line.advanceMatch
      ? `match (+${line.advancePts})`
      : `MISS — ${reasonAdvanceMismatch(team, predAdv, actAdv)}`;
    const exactCell = line.exactMatch ? `yes (+${line.exactPts})` : 'no';
    const upsetCell = line.upsetPts > 0
      ? `${line.upsetExplanation} → +${line.upsetPts}`
      : line.upsetExplanation;

    console.log(
      fmtCol(team, 10) + ' │ ' +
      fmtCol(`#${line.actualPos}`, 7) + ' │ ' +
      fmtCol(`#${line.predPos}`, 5) + ' │ ' +
      fmtCol(line.seed, 5) + ' │ ' +
      fmtCol(advCell, 24) + ' │ ' +
      fmtCol(exactCell, 8) + ' │ ' +
      fmtCol(upsetCell, 30) + ' │ ' +
      fmtCol(line.rowTotal, 4, 'right'),
    );
  }
  console.log(bar());

  // Subtotals
  const advTotal = r.lines.reduce((sum, l) => sum + l.advancePts, 0);
  const exactTotal = r.lines.reduce((sum, l) => sum + l.exactPts, 0);
  const upsetTotal = r.lines.reduce((sum, l) => sum + l.upsetPts, 0);
  const rowTotal = advTotal + exactTotal + upsetTotal;

  console.log('');
  console.log(`Subtotals:`);
  console.log(`  Advance correct  : ${advTotal} pts (4 teams × +1 if advance prediction matches reality)`);
  console.log(`  Exact position   : ${exactTotal} pts (4 teams × +1 if finishing in predicted slot)`);
  console.log(`  Upset bonus      : ${upsetTotal} pts (sum of (seed - predPos) when team performs at/above pred)`);
  console.log(`  ────────────`);
  console.log(`  Per-team subtotal: ${rowTotal} pts`);
  console.log('');

  // Bonuses
  const advBonus = r.flagAdvance ? RULES.advancementCorrectBonus : 0;
  const perfectBonus = r.flagPerfect ? RULES.perfectOrderBonus : 0;
  console.log(`Group-wide bonuses (all-or-nothing):`);
  console.log(`  Advance bonus    : +${advBonus}  (all 4 advance/eliminate predictions correct? ${r.flagAdvance ? 'YES' : 'no'})`);
  console.log(`  Perfect order    : +${perfectBonus}  (all 4 positions exactly correct? ${r.flagPerfect ? 'YES' : 'no'})`);
  console.log('');
  console.log(`>>> SCENARIO ${s.id} GROUP D TOTAL: ${r.total} pts <<<`);
}

// ---------------------------------------------------------------------------
// Scenarios — covering core cases + edge cases
// ---------------------------------------------------------------------------

const scenarios: Scenario[] = [
  {
    id: 'A',
    title: 'Perfect call (best case)',
    order: ['USA', 'Turkiye', 'Paraguay', 'Australia'],
    thirdAdvances: true,
    story: 'edgecdec nails every position AND Paraguay sneaks through as one of 8 advancing 3rd-place teams. Maximum possible Group D score.',
  },
  {
    id: 'B',
    title: 'Top 2 right but order swapped',
    order: ['Turkiye', 'USA', 'Paraguay', 'Australia'],
    thirdAdvances: true,
    story: 'Turkiye edges USA for the group. Paraguay still 3rd & advances, Australia still last. Loses perfect-order bonus, keeps the advance bonus.',
  },
  {
    id: 'C',
    title: 'USA dominates, 3rd-place pick whiffs',
    order: ['USA', 'Australia', 'Paraguay', 'Turkiye'],
    thirdAdvances: false,
    story: 'USA wins group, Australia overperforms, Paraguay finishes 3rd as predicted but DOES NOT advance. The 3rd-place pick is the killer.',
  },
  {
    id: 'D',
    title: 'Big upset: Turkiye wins, Paraguay 2nd',
    order: ['Turkiye', 'Paraguay', 'USA', 'Australia'],
    thirdAdvances: false,
    story: 'Turkiye (pot 4!) tops the group; Paraguay (pot 3) sneaks 2nd. USA out in 3rd. Australia stays last. Upset bonus shows up.',
  },
  {
    id: 'E',
    title: 'Australia shocks, Paraguay 4th',
    order: ['Australia', 'USA', 'Turkiye', 'Paraguay'],
    thirdAdvances: false,
    story: 'Australia (predicted last) wins the group. Paraguay finishes dead last. Single point earned (USA still advances).',
  },
  {
    id: 'F',
    title: 'EDGE: Paraguay wins group (max upset for predicted-3rd)',
    order: ['Paraguay', 'USA', 'Turkiye', 'Australia'],
    thirdAdvances: true,
    story: 'Paraguay (pot 3, predicted 3rd) wins the group. Maxes the upset bonus for Paraguay (3 - 3 = 0... wait, see breakdown). USA & Turkiye both advance.',
  },
  {
    id: 'G',
    title: 'EDGE: All 4 advance predictions match but order off',
    order: ['Turkiye', 'USA', 'Australia', 'Paraguay'],
    thirdAdvances: false,
    story: 'edgecdec\'s "USA & Turkiye advance, Paraguay/Australia don\'t" is correct (Paraguay 4th, Australia 3rd & out). Top 2 swapped, bottom 2 swapped. Tests the advance bonus fires while perfect-order does not.',
  },
  {
    id: 'H',
    title: 'EDGE: Three teams tied on points (real-world tiebreaker)',
    order: ['USA', 'Turkiye', 'Australia', 'Paraguay'],
    thirdAdvances: true,
    story: 'Australia overtakes Paraguay on tiebreakers; Australia advances as 3rd-place team instead. edgecdec had Paraguay 3rd, so the 3rd-place pick is wrong even though Paraguay is 4th.',
  },
  {
    id: 'I',
    title: 'EDGE: Worst possible — order completely reversed',
    order: ['Australia', 'Paraguay', 'Turkiye', 'USA'],
    thirdAdvances: false,
    story: 'Australia wins, USA finishes last. Catastrophe. Tests the floor.',
  },
];

// ---------------------------------------------------------------------------
// Print everything
// ---------------------------------------------------------------------------

console.log('');
console.log(bar('═'));
console.log('GROUP D SCORING WALKTHROUGH — edgecdec prediction');
console.log(bar('═'));
console.log('');
console.log(`Predicted order : ${PREDICTION.order.join(' > ')}`);
console.log(`3rd-place picks : ${PARAGUAY_PICKED_AS_3RD.join(', ')} (one of edgecdec's 8 advancing 3rd-place picks)`);
console.log('');
console.log('Group D teams & seeds:');
console.log('  USA       — pot 1, FIFA rank 14');
console.log('  Australia — pot 2, FIFA rank 26');
console.log('  Paraguay  — pot 3, FIFA rank 39');
console.log('  Turkiye   — pot 4, FIFA rank 25');
console.log('');
console.log('SCORING RULES (DEFAULT_SCORING.groupStage):');
console.log(`  +${RULES.advanceCorrect}  per team where prediction\'s "advances?" matches reality`);
console.log(`  +${RULES.exactPosition}  per team finishing in exactly its predicted slot`);
console.log(`  +${RULES.upsetBonusPerPlace}  per (seed - predictedPos) when actualPos ≤ predictedPos AND seed > predictedPos`);
console.log(`  +${RULES.advancementCorrectBonus}  bonus if all 4 "advance/eliminate" calls are right`);
console.log(`  +${RULES.perfectOrderBonus}  bonus if all 4 positions are exactly right`);
console.log('');
console.log('Note on UPSET BONUS: this rewards predicting a low-pot team to outperform their seed.');
console.log('  Example: Turkiye is pot 4 (lowest). Predicting Turkiye 2nd → if Turkiye finishes 2nd or');
console.log('  better, you earn (4 - 2) = 2 bonus points. Predicting USA (pot 1) anywhere → 0 bonus,');
console.log('  since seed (1) - any predictedPos (≥1) ≤ 0.');

for (const s of scenarios) printScenario(s);

// ---------------------------------------------------------------------------
// Summary table
// ---------------------------------------------------------------------------

console.log('');
console.log(bar('═'));
console.log('SUMMARY TABLE — all scenarios');
console.log(bar('═'));
console.log('');
console.log(
  fmtCol('ID', 4) + ' │ ' +
  fmtCol('Final order', 38) + ' │ ' +
  fmtCol('3rd?', 6) + ' │ ' +
  fmtCol('Adv', 4, 'right') + ' │ ' +
  fmtCol('Exact', 6, 'right') + ' │ ' +
  fmtCol('Upset', 6, 'right') + ' │ ' +
  fmtCol('AdvB', 5, 'right') + ' │ ' +
  fmtCol('Perf', 5, 'right') + ' │ ' +
  fmtCol('TOTAL', 6, 'right'),
);
console.log(bar());
for (const s of scenarios) {
  const r = score(s);
  const adv = r.lines.reduce((x, l) => x + l.advancePts, 0);
  const exact = r.lines.reduce((x, l) => x + l.exactPts, 0);
  const upset = r.lines.reduce((x, l) => x + l.upsetPts, 0);
  const advB = r.flagAdvance ? RULES.advancementCorrectBonus : 0;
  const perfB = r.flagPerfect ? RULES.perfectOrderBonus : 0;
  console.log(
    fmtCol(s.id, 4) + ' │ ' +
    fmtCol(s.order.join(' > '), 38) + ' │ ' +
    fmtCol(s.thirdAdvances ? 'adv' : 'out', 6) + ' │ ' +
    fmtCol(adv, 4, 'right') + ' │ ' +
    fmtCol(exact, 6, 'right') + ' │ ' +
    fmtCol(upset, 6, 'right') + ' │ ' +
    fmtCol(advB, 5, 'right') + ' │ ' +
    fmtCol(perfB, 5, 'right') + ' │ ' +
    fmtCol(r.total, 6, 'right'),
  );
}
console.log('');
console.log('Theoretical max for this prediction: 13 pts (scenario A — every component fires).');
console.log('Theoretical floor: 0 pts (impossible here since picking the pot-1 team to advance is hard to miss; min observed = 1).');
console.log('');

// ---------------------------------------------------------------------------
// Live-score pipeline sanity check
// ---------------------------------------------------------------------------

import { sampleLiveScores } from '../src/lib/matchOdds';

console.log(bar('═'));
console.log('LIVE-SCORE PIPELINE SANITY CHECK');
console.log(bar('═'));
console.log('');
console.log('Scenario: USA 1-0 Paraguay at 60\' — other Group D matches not yet played.');
console.log('What happens when this in-progress match feeds into the forecast?');
console.log('');

const samples = sampleLiveScores('USA', 'Paraguay', 1, 0, 60, 5000, { stage: 'group' });
if (!samples) {
  console.log('ERROR: PELE ratings missing for USA or Paraguay');
} else {
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
  const top = [...tally.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6);

  console.log('  Match outcome (5000 sampled trajectories):');
  console.log(`    USA win   ${(usaWin / samples.length * 100).toFixed(1)}%`);
  console.log(`    Draw      ${(draw / samples.length * 100).toFixed(1)}%`);
  console.log(`    PAR win   ${(parWin / samples.length * 100).toFixed(1)}%`);
  console.log('');
  console.log('  Top final scorelines:');
  for (const [k, c] of top) {
    console.log(`    ${k.padEnd(6)}  ${(c / samples.length * 100).toFixed(1)}%`);
  }
  console.log('');
  console.log(`  Expected final: USA ${(totalA / samples.length).toFixed(2)} - ${(totalB / samples.length).toFixed(2)} PAR`);
  console.log('');
  console.log('  How this flows into edgecdec\'s forecast score:');
  console.log('  1. The simulate page samples 1000 of these scorelines and ships them to the worker.');
  console.log('  2. Each tournament-sim iteration:');
  console.log('     a) picks one random sample (e.g. "1-1") for USA-Paraguay;');
  console.log('     b) simulates the other 5 Group D matches normally;');
  console.log('     c) tallies points/GD/GF, sorts the table, computes 3rd-place advancement;');
  console.log('     d) runs scoreGroupStage on the resulting order.');
  console.log('  3. Across 10,000 sims, the per-player avg score = expected forecast score.');
  console.log('  4. So the same scoring rules from scenarios A-I apply to whatever order the');
  console.log('     simulator produces — the live match just shifts the distribution of orders.');
}
