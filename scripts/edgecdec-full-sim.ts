// Run one random group-stage simulation and walk through edgecdec's scoring
// with explicit math per group. Used as a sanity check that the points add up
// the way the rules say they should.
//
// Run: npx tsx scripts/edgecdec-full-sim.ts

import { scoreGroupStage } from '../src/lib/scoring';
import { PELE_RATINGS, AVG_GA } from '../src/lib/peleRatings';
import {
  DEFAULT_SCORING,
  type BracketData,
  type Team,
  type Group,
  type GroupPrediction,
  type GroupStageResults,
} from '../src/types';

// ---------------------------------------------------------------------------
// Data: groups (matches the worker), seeds, edgecdec's picks
// ---------------------------------------------------------------------------

const GROUPS_DEF: Record<string, string[]> = {
  A: ['Mexico', 'South Africa', 'South Korea', 'Czechia'],
  B: ['Canada', 'Bosnia and Herzegovina', 'Qatar', 'Switzerland'],
  C: ['Brazil', 'Morocco', 'Haiti', 'Scotland'],
  D: ['USA', 'Paraguay', 'Australia', 'Turkiye'],
  E: ['Germany', 'Curacao', 'Ivory Coast', 'Ecuador'],
  F: ['Netherlands', 'Japan', 'Sweden', 'Tunisia'],
  G: ['Belgium', 'Egypt', 'Iran', 'New Zealand'],
  H: ['Spain', 'Cape Verde', 'Saudi Arabia', 'Uruguay'],
  I: ['France', 'Senegal', 'Norway', 'Iraq'],
  J: ['Argentina', 'Algeria', 'Austria', 'Jordan'],
  K: ['Portugal', 'DR Congo', 'Uzbekistan', 'Colombia'],
  L: ['England', 'Croatia', 'Ghana', 'Panama'],
};

// Pot/seed per team — used for upset bonus (we lookup via bracketData.groups[].teams[].groupSeed)
const POT: Record<string, 1 | 2 | 3 | 4> = {
  Spain: 1, Argentina: 1, France: 1, England: 1, Brazil: 1, Portugal: 1,
  Netherlands: 1, Belgium: 1, Germany: 1, USA: 1, Mexico: 1, Canada: 1,
  Croatia: 2, Morocco: 2, Colombia: 2, Uruguay: 2, Switzerland: 2,
  Japan: 2, Senegal: 2, Ecuador: 2, Austria: 2, Australia: 2, 'South Korea': 2, Egypt: 2,
  Norway: 3, Panama: 3, Scotland: 3, Paraguay: 3, Tunisia: 3, 'Ivory Coast': 3,
  Uzbekistan: 3, Qatar: 3, 'Saudi Arabia': 3, Algeria: 3, Iran: 3, Ghana: 3, Sweden: 3,
  Jordan: 4, 'Cape Verde': 4, 'Bosnia and Herzegovina': 4, Turkiye: 4, Curacao: 4,
  Haiti: 4, 'New Zealand': 4, Iraq: 4, 'South Africa': 4, 'DR Congo': 4,
};

const FIFA_RANK: Record<string, number> = {
  Spain: 1, Argentina: 2, France: 3, England: 4, Brazil: 5, Portugal: 6,
  Netherlands: 7, Belgium: 8, Germany: 9, Croatia: 10, Morocco: 11,
  Colombia: 13, USA: 14, Mexico: 15, Uruguay: 16, Switzerland: 17,
  Japan: 18, Senegal: 19, Iran: 20, 'South Korea': 22, Ecuador: 23,
  Austria: 24, Turkiye: 25, Australia: 26, Canada: 27, Norway: 29,
  Panama: 30, Paraguay: 39, Egypt: 34, Algeria: 35, Scotland: 36,
  Tunisia: 40, 'Ivory Coast': 42, Sweden: 43, Czechia: 44,
  Uzbekistan: 50, Qatar: 51, 'DR Congo': 56, Iraq: 58,
  'Saudi Arabia': 60, 'South Africa': 61, Jordan: 66,
  'Cape Verde': 68, 'Bosnia and Herzegovina': 71, Ghana: 72,
  Curacao: 82, Haiti: 84, 'New Zealand': 86,
};

// edgecdec's actual prediction (from prod DB, 2026-06-10)
const EDGECDEC_GROUPS: GroupPrediction[] = [
  { groupName: 'A', order: ['Mexico', 'Czechia', 'South Africa', 'South Korea'] },
  { groupName: 'B', order: ['Switzerland', 'Canada', 'Bosnia and Herzegovina', 'Qatar'] },
  { groupName: 'C', order: ['Brazil', 'Morocco', 'Scotland', 'Haiti'] },
  { groupName: 'D', order: ['USA', 'Turkiye', 'Paraguay', 'Australia'] },
  { groupName: 'E', order: ['Germany', 'Ecuador', 'Ivory Coast', 'Curacao'] },
  { groupName: 'F', order: ['Japan', 'Netherlands', 'Sweden', 'Tunisia'] },
  { groupName: 'G', order: ['Belgium', 'Iran', 'Egypt', 'New Zealand'] },
  { groupName: 'H', order: ['Spain', 'Uruguay', 'Cape Verde', 'Saudi Arabia'] },
  { groupName: 'I', order: ['France', 'Norway', 'Senegal', 'Iraq'] },
  { groupName: 'J', order: ['Argentina', 'Austria', 'Algeria', 'Jordan'] },
  { groupName: 'K', order: ['Portugal', 'Colombia', 'DR Congo', 'Uzbekistan'] },
  { groupName: 'L', order: ['England', 'Croatia', 'Panama', 'Ghana'] },
];

const EDGECDEC_3RD: string[] = [
  'Paraguay', 'Egypt', 'Ivory Coast', 'DR Congo',
  'Scotland', 'Algeria', 'Bosnia and Herzegovina', 'Senegal',
];

// ---------------------------------------------------------------------------
// Mini simulator (mirrors the worker's group-stage logic)
// ---------------------------------------------------------------------------

const GROUP_STAGE_MULT = 0.9;
const DC_RHO = -0.13;

function poissonSample(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

function sampleGoals(lA: number, lB: number): [number, number] {
  const a = poissonSample(lA);
  const b = poissonSample(lB);
  let tau = 1;
  if (a === 0 && b === 0) tau = 1 - lA * lB * DC_RHO;
  else if (a === 0 && b === 1) tau = 1 + lA * DC_RHO;
  else if (a === 1 && b === 0) tau = 1 + lB * DC_RHO;
  else if (a === 1 && b === 1) tau = 1 - DC_RHO;
  if (tau < 1 && Math.random() > tau) {
    if (a === 0 && b === 1) return [0, 0];
    if (a === 1 && b === 0) return [1, 1];
  }
  return [a, b];
}

function effectiveRating(rating: { gf: number; ga: number; pele: number; homeField?: number }, hostsHome: boolean) {
  if (!hostsHome || !rating.homeField) return { gf: rating.gf, ga: rating.ga, pele: rating.pele };
  const factor = Math.pow(10, rating.homeField / 800);
  return { gf: rating.gf * factor, ga: rating.ga / factor, pele: rating.pele + rating.homeField };
}

function applyStage(a: { gf: number; ga: number; pele: number }, b: { gf: number; ga: number; pele: number }, mult: number) {
  if (mult === 1) return [a, b] as const;
  const avg = (a.pele + b.pele) / 2;
  const newA = avg + (a.pele - avg) * mult;
  const newB = avg + (b.pele - avg) * mult;
  const fA = Math.pow(10, (newA - a.pele) / 800);
  const fB = Math.pow(10, (newB - b.pele) / 800);
  return [
    { gf: a.gf * fA, ga: a.ga / fA, pele: newA },
    { gf: b.gf * fB, ga: b.ga / fB, pele: newB },
  ] as const;
}

function simulateGroupMatch(teamA: string, teamB: string, hostsHome: string | undefined): [number, number] {
  const rA = PELE_RATINGS[teamA]; const rB = PELE_RATINGS[teamB];
  let eA = effectiveRating(rA, teamA === hostsHome);
  let eB = effectiveRating(rB, teamB === hostsHome);
  [eA, eB] = applyStage(eA, eB, GROUP_STAGE_MULT);
  const lA = eA.gf * (eB.ga / AVG_GA);
  const lB = eB.gf * (eA.ga / AVG_GA);
  return sampleGoals(lA, lB);
}

interface GroupResult {
  groupName: string;
  order: [string, string, string, string];
  table: Record<string, { pts: number; gd: number; gf: number; ga: number }>;
  matches: Array<{ a: string; b: string; sa: number; sb: number }>;
}

function simulateGroup(name: string, teams: string[]): GroupResult {
  const table: Record<string, { pts: number; gd: number; gf: number; ga: number }> = {};
  for (const t of teams) table[t] = { pts: 0, gd: 0, gf: 0, ga: 0 };
  const host = teams.find((t) => PELE_RATINGS[t]?.homeField);
  const matches: Array<{ a: string; b: string; sa: number; sb: number }> = [];
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      const [sa, sb] = simulateGroupMatch(teams[i], teams[j], host);
      matches.push({ a: teams[i], b: teams[j], sa, sb });
      table[teams[i]].gf += sa; table[teams[i]].ga += sb;
      table[teams[j]].gf += sb; table[teams[j]].ga += sa;
      if (sa > sb) table[teams[i]].pts += 3;
      else if (sa === sb) { table[teams[i]].pts += 1; table[teams[j]].pts += 1; }
      else table[teams[j]].pts += 3;
    }
  }
  for (const t of teams) table[t].gd = table[t].gf - table[t].ga;
  const order = [...teams].sort((a, b) =>
    table[b].pts - table[a].pts || table[b].gd - table[a].gd || table[b].gf - table[a].gf,
  ) as [string, string, string, string];
  return { groupName: name, order, table, matches };
}

// ---------------------------------------------------------------------------
// Run the sim
// ---------------------------------------------------------------------------

console.log('═'.repeat(80));
console.log('EDGECDEC FULL-SIM SCORING WALKTHROUGH (random group-stage simulation)');
console.log('═'.repeat(80));
console.log('');
console.log('Scoring rules used:');
console.log(`  +${DEFAULT_SCORING.groupStage.advanceCorrect}  per team where advance/eliminate prediction matches reality`);
console.log(`  +${DEFAULT_SCORING.groupStage.exactPosition}  per team finishing in exactly its predicted slot`);
console.log(`  +${DEFAULT_SCORING.groupStage.upsetBonusPerPlace}  per (pot - max(predPos, actualPos)) when team beats its pot`);
console.log(`  +${DEFAULT_SCORING.groupStage.advancementCorrectBonus}  bonus if all 4 advance/eliminate calls right in a group`);
console.log(`  +${DEFAULT_SCORING.groupStage.perfectOrderBonus}  bonus if all 4 positions exactly correct in a group`);
console.log('');

const groupResults: GroupResult[] = [];
for (const [name, teams] of Object.entries(GROUPS_DEF)) {
  groupResults.push(simulateGroup(name, teams));
}

// FIFA tiebreakers for advancing 3rd: pts > GD > GF — top 8 of 12 advance
const thirds = groupResults.map((gr) => ({
  team: gr.order[2], group: gr.groupName, ...gr.table[gr.order[2]],
}));
thirds.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
const advancing3rd = thirds.slice(0, 8).map((t) => t.team);
const eliminated3rd = thirds.slice(8).map((t) => t.team);

console.log(`Advancing 3rd-place teams (top 8 by pts/GD/GF):`);
console.log(`  ${advancing3rd.join(', ')}`);
console.log(`Eliminated 3rd-place teams: ${eliminated3rd.join(', ')}`);
console.log('');

// ---------------------------------------------------------------------------
// Build BracketData for the scorer
// ---------------------------------------------------------------------------

const bracketData: BracketData = {
  groups: Object.entries(GROUPS_DEF).map(([name, teams]) => ({
    name,
    teams: teams.map((teamName) => ({
      name: teamName,
      fifaRanking: FIFA_RANK[teamName] ?? 100,
      pot: POT[teamName] ?? 4,
      groupSeed: POT[teamName] ?? 4,
      espnId: 0,
    })) as [Team, Team, Team, Team],
  } as Group)),
};

const stageResults: GroupStageResults = {
  groupResults: groupResults.map((gr) => ({ groupName: gr.groupName, order: gr.order })),
  advancingThirdPlace: advancing3rd,
};

// ---------------------------------------------------------------------------
// Walk through each group with explicit math
// ---------------------------------------------------------------------------

let runningTotal = 0;

for (const gr of groupResults) {
  const pred = EDGECDEC_GROUPS.find((p) => p.groupName === gr.groupName)!;
  console.log('─'.repeat(80));
  console.log(`GROUP ${gr.groupName}`);
  console.log('─'.repeat(80));

  // Show match results
  console.log('Matches:');
  for (const m of gr.matches) {
    console.log(`  ${m.a.padEnd(24)} ${m.sa}-${m.sb}  ${m.b}`);
  }

  // Show final table
  console.log('\nFinal table (sorted pts > GD > GF):');
  console.log(`  Pos  Team                    Pts  GD   GF`);
  gr.order.forEach((t, i) => {
    const s = gr.table[t];
    console.log(`  ${i + 1}    ${t.padEnd(22)} ${s.pts}    ${s.gd >= 0 ? '+' : ''}${s.gd}   ${s.gf}`);
  });

  console.log(`\n  edgecdec predicted: ${pred.order.join(' > ')}`);
  console.log(`  Actual:             ${gr.order.join(' > ')}`);
  if (gr.order.includes(pred.order[2]) || pred.order[2] === gr.order[2]) {
    // 3rd-place pick info
    const predicted3rd = pred.order[2];
    const did3rdAdvance = advancing3rd.includes(gr.order[2]);
    console.log(`  3rd place actual: ${gr.order[2]} (${did3rdAdvance ? 'ADVANCES' : 'eliminated'})`);
    if (EDGECDEC_3RD.includes(predicted3rd)) {
      console.log(`  edgecdec picked ${predicted3rd} as advancing 3rd: ${advancing3rd.includes(predicted3rd) ? '✓ in top 8' : '✗ not in top 8'}`);
    }
  }

  // Per-team breakdown
  console.log('\n  Per-team scoring:');
  console.log(`    ${'Team'.padEnd(22)} ${'Actual'.padEnd(8)} ${'Pred'.padEnd(6)} ${'Pot'.padEnd(4)} ${'Adv?'.padEnd(15)} ${'Exact?'.padEnd(8)} ${'Upset bonus'}`);

  let advTotal = 0, exactTotal = 0, upsetTotal = 0;
  let allAdvCorrect = true, allExactCorrect = true;

  for (let i = 0; i < 4; i++) {
    const team = gr.order[i];
    const actualPos = i + 1;
    const predPos = pred.order.indexOf(team) + 1;
    const pot = POT[team] ?? 4;

    // Advance check
    const predAdv = predPos <= 2 || (predPos === 3 && EDGECDEC_3RD.includes(team));
    const actAdv = actualPos <= 2 || (actualPos === 3 && advancing3rd.includes(team));
    const advMatch = predAdv === actAdv;
    if (!advMatch) allAdvCorrect = false;
    if (advMatch) advTotal += 1;

    const exactMatch = predPos === actualPos;
    if (!exactMatch) allExactCorrect = false;
    if (exactMatch) exactTotal += 1;

    // Upset bonus = max(0, pot - max(predPos, actualPos))
    const effectivePos = Math.max(predPos, actualPos);
    const upset = Math.max(0, pot - effectivePos);
    upsetTotal += upset;

    const advLabel = advMatch ? `match (+1)` : `MISS`;
    const exactLabel = exactMatch ? `yes (+1)` : `no`;
    const upsetLabel = upset > 0 ? `pot ${pot} - ${effectivePos} = +${upset}` : `0`;

    console.log(`    ${team.padEnd(22)} #${actualPos.toString().padEnd(7)} ${('#' + predPos).padEnd(6)} ${pot.toString().padEnd(4)} ${advLabel.padEnd(15)} ${exactLabel.padEnd(8)} ${upsetLabel}`);
  }

  const advBonus = allAdvCorrect ? DEFAULT_SCORING.groupStage.advancementCorrectBonus : 0;
  const perfectBonus = allExactCorrect ? DEFAULT_SCORING.groupStage.perfectOrderBonus : 0;
  const groupTotal = advTotal + exactTotal + upsetTotal + advBonus + perfectBonus;

  console.log(`\n  Subtotals: advance=${advTotal}, exact=${exactTotal}, upset=${upsetTotal}, adv-bonus=${advBonus} (${allAdvCorrect ? 'all 4 advance/eliminate calls right' : 'missed at least one'}), perfect=${perfectBonus} (${allExactCorrect ? 'all 4 positions right' : 'missed at least one'})`);
  console.log(`  GROUP ${gr.groupName} TOTAL: ${groupTotal} pts`);

  runningTotal += groupTotal;
  console.log(`  Running total after Group ${gr.groupName}: ${runningTotal} pts`);
  console.log('');
}

// ---------------------------------------------------------------------------
// Sanity check — run scoreGroupStage and confirm
// ---------------------------------------------------------------------------

const officialScore = scoreGroupStage(
  EDGECDEC_GROUPS,
  EDGECDEC_3RD,
  stageResults,
  bracketData,
  DEFAULT_SCORING.groupStage,
);

console.log('═'.repeat(80));
console.log(`HAND-COMPUTED RUNNING TOTAL: ${runningTotal} pts`);
console.log(`OFFICIAL scoreGroupStage:    ${officialScore.total} pts`);
console.log('Match? ' + (officialScore.total === runningTotal ? '✓ YES' : '✗ NO — bug somewhere'));
console.log('═'.repeat(80));
