// =============================================================================
// 2026 FIFA World Cup Tournament Simulation Worker
// =============================================================================
//
// This Web Worker runs the full tournament simulation thousands of times to
// produce championship probabilities, advance probabilities, bracket-slot
// probabilities, and (optionally) per-player expected scores.
//
// SELF-CONTAINED: This file cannot import from anywhere else because Web
// Workers don't support TypeScript path aliases. All data (ratings, lookup
// tables, etc.) is passed in via the request message.
//
// METHODOLOGY (loosely based on Nate Silver's PELE model, Silver Bulletin):
//
//   1. PELE rating represents overall team strength on an Elo-like scale
//      (~1500 = average team, ~2000 = elite).
//   2. GF/GA represent the team's expected goals scored/conceded vs an
//      AVERAGE opponent. Used to derive Poisson lambdas per match:
//        lambdaA = teamA.gf * (teamB.ga / AVG_GA)
//        lambdaB = teamB.gf * (teamA.ga / AVG_GA)
//      Lower opponent GA → fewer expected goals from us. Higher opponent
//      GF → more expected goals against us.
//   3. Goals are sampled from a Dixon-Coles-corrected joint Poisson, which
//      adjusts for the well-known under-prediction of low-scoring outcomes
//      in pure Poisson (0-0, 1-1 happen more in real soccer than independent
//      Poisson predicts).
//   4. Three additional adjustments per Silver Bulletin's published method:
//      a. HOME FIELD ADVANTAGE: a host nation playing in their own country
//         gets a homeField PELE bonus, applied only to that team's GF/GA
//         via factor 10^(homeField/800). The /800 (vs /400) is because
//         scaling both GF and GA by the same factor shifts the lambda
//         RATIO by the square — to get a clean 10^(D/400) Elo shift we
//         apply 10^(D/800) to each.
//      b. STAGE MULTIPLIER: Group matches are upset-prone (0.9x rating
//         gap), knockout matches are chalkier (1.1x rating gap). This is
//         applied by shifting each team's PELE toward/away from the avg
//         of the two teams' PELEs by half the gap delta.
//      c. FORM STREAKINESS: Within a single sim, when a team overperforms
//         their PELE expectation, they get a temporary PELE bump for the
//         rest of that simulated tournament. Capped at ±60 PELE so a
//         single result can't dominate. Reset between sims.
//   5. Knockout draws: 40% resolved in extra time (better team more likely
//      to score), 60% go to penalties (60/40 edge to better team, compressed
//      from raw PELE prob to model shootout luck).
//   6. 3rd place advancement uses FIFA's official 495-combination lookup
//      table (passed in as `thirdPlaceLookup`). FIFA tiebreakers (pts > GD
//      > GF) determine which 8 of 12 third-place teams advance.
//
// The result of N simulations is a probability distribution for every
// outcome of interest: who wins each group, who advances, who reaches each
// round of the knockout, who wins the cup, and how each player's bracket
// scores against the simulated outcomes.
// =============================================================================

interface TeamRating {
  name: string;
  pele: number;
  gf: number;
  ga: number;
  /** Home field advantage in PELE points (only present for host nations). */
  homeField?: number;
}

interface PlayerEntry {
  key: string;
  group_predictions: Array<{ groupName: string; order: string[] }>;
  third_place_picks: string[];
  knockout_picks: Record<string, string>;
}

interface ScoringSettings {
  groupStage: {
    advanceCorrect: number;
    exactPosition: number;
    upsetBonusPerPlace: number;
    advancementCorrectBonus: number;
    perfectOrderBonus: number;
  };
  knockout: {
    pointsPerRound: number[];
    upsetMultiplierPerRound: number[];
    upsetModulus: number;
    championBonus: number;
  };
}

/** A completed match result. */
interface ActualMatch {
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
}

interface TournamentSimRequest {
  type: 'run';
  ratings: Record<string, TeamRating>;
  avgGA: number;
  groups: Record<string, string[]>;
  numSims: number;
  entries?: PlayerEntry[];
  scoring?: ScoringSettings;
  teamSeeds?: Record<string, number>;
  teamRankings?: Record<string, number>;
  thirdPlaceLookup?: Record<string, string[]>;
  /**
   * Already-completed group stage matches keyed by group name.
   * Each match locks the goals so the table is partially deterministic.
   */
  actualGroupMatches?: Record<string, ActualMatch[]>;
  /**
   * Final group stage standings (when the group stage is complete).
   * If provided, simulation skips group stage entirely and uses these orders.
   * Format: { groupName: [1stTeam, 2ndTeam, 3rdTeam, 4thTeam] }
   */
  finalGroupStandings?: Record<string, string[]>;
  /** Pre-determined list of 8 advancing 3rd-place teams (when group stage is complete). */
  finalAdvancing3rd?: string[];
  /**
   * Already-completed knockout match results.
   * Maps matchId (e.g. 'R32-1', 'R16-3', 'FINAL', '3RD') to the winning team name.
   */
  actualKnockoutResults?: Record<string, string>;
  /**
   * Per-knockout-match host country. When a host nation plays a match in
   * their own country, they get the homeField PELE bonus applied.
   * Map of matchId -> 'USA' | 'Mexico' | 'Canada'.
   */
  knockoutHosts?: Record<string, string>;
}

interface GroupPositionResult {
  team: string;
  pos: number[];  // count of times finished in each position [1st, 2nd, 3rd, 4th]
  advance: number;
}

interface BracketSlotResult {
  slotId: string;
  round: string;
  teams: Array<{ team: string; count: number }>;
}

interface PlayerScoreResult {
  key: string;
  avgScore: number;
  avgRank: number;
  winPct: number;
}

interface SimResponse {
  type: 'progress' | 'done';
  progress?: number;
  results?: {
    groupResults: Record<string, GroupPositionResult[]>;
    bracketSlots: BracketSlotResult[];
    championProbs: Array<{ team: string; pct: number }>;
    advanceProbs: Array<{ team: string; pct: number }>;
    playerScores?: PlayerScoreResult[];
  };
}

// FIFA R32 bracket structure
// Format: [teamASource, teamBSource]
// Sources: "1X" = winner of group X, "2X" = runner-up of group X, "3:" + slotIndex = 3rd place assigned to that slot
const R32_STRUCTURE = [
  ['2A', '2B'],      // R32-1
  ['1E', '3:0'],     // R32-2
  ['1F', '2C'],      // R32-3
  ['1C', '2F'],      // R32-4
  ['1I', '3:1'],     // R32-5
  ['2E', '2I'],      // R32-6
  ['1A', '3:2'],     // R32-7
  ['1L', '3:3'],     // R32-8
  ['1D', '3:4'],     // R32-9
  ['1G', '3:5'],     // R32-10
  ['2K', '2L'],      // R32-11
  ['1H', '2J'],      // R32-12
  ['1B', '3:6'],     // R32-13
  ['1J', '2H'],      // R32-14
  ['1K', '3:7'],     // R32-15
  ['2D', '2G'],      // R32-16
];

// R16 pairings: winners of R32 matches paired sequentially
// R16-1 = W(R32-1) vs W(R32-2), R16-2 = W(R32-3) vs W(R32-4), etc.
// QF-1 = W(R16-1) vs W(R16-2), etc.

function poissonSample(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

/**
 * Dixon-Coles correlation parameter (rho).
 *
 * Pure independent Poisson sampling has a well-documented problem in soccer:
 * it under-predicts both 0-0 draws AND blowouts. Real soccer has more
 * correlated low-scoring outcomes than independent Poisson assumes (because
 * teams' tactics depend on the current score).
 *
 * Dixon-Coles (1997) introduced a tau correction applied to the joint
 * probability of the 4 lowest-scoring cells (0-0, 0-1, 1-0, 1-1):
 *   tau(0,0) = 1 - lambda_a * lambda_b * rho
 *   tau(0,1) = 1 + lambda_a * rho
 *   tau(1,0) = 1 + lambda_b * rho
 *   tau(1,1) = 1 - rho
 *
 * Standard rho for soccer is around -0.13. With rho < 0:
 *   tau(0,0) > 1: 0-0 happens MORE often than independent Poisson predicts
 *   tau(1,1) > 1: 1-1 happens MORE often
 *   tau(0,1) < 1: 0-1 happens LESS often
 *   tau(1,0) < 1: 1-0 happens LESS often
 * This shifts probability mass from (0,1)/(1,0) to (0,0)/(1,1) — i.e., more draws.
 */
const DC_RHO = -0.13;

function sampleGoals(lambdaA: number, lambdaB: number): [number, number] {
  // Independent Poisson sample, then check if the cell needs adjustment
  const a = poissonSample(lambdaA);
  const b = poissonSample(lambdaB);

  // Apply tau adjustment via acceptance-rejection on low-score cells
  let tau = 1;
  if (a === 0 && b === 0) tau = 1 - lambdaA * lambdaB * DC_RHO;
  else if (a === 0 && b === 1) tau = 1 + lambdaA * DC_RHO;
  else if (a === 1 && b === 0) tau = 1 + lambdaB * DC_RHO;
  else if (a === 1 && b === 1) tau = 1 - DC_RHO;

  // For DC_RHO < 0, tau >= 1 for (0,0) and (1,1) and tau <= 1 for (0,1) and (1,0)
  // Reject with probability (1 - tau) when tau < 1 (resample from a different cell)
  if (tau < 1 && Math.random() > tau) {
    // Resample but bias toward (0,0) and (1,1) — flip to a draw nearby
    if (a === 0 && b === 1) return [0, 0];
    if (a === 1 && b === 0) return [1, 1];
  }
  // For tau > 1 (0-0, 1-1), the cell is already favored by the independent draw
  return [a, b];
}


/**
 * Apply home field advantage to a team's effective rating.
 *
 * THE MATH: HFA is given in PELE points (e.g. Mexico +145, USA +88).
 * In an Elo system, +D points = +D/400 in log-10 win-probability shift.
 * We want our Poisson lambda RATIO to shift by exactly 10^(D/400) when
 * a team gets +D PELE.
 *
 * Lambda for team A vs B:
 *   lambdaA = gf_A * (ga_B / avgGA)
 *   lambdaB = gf_B * (ga_A / avgGA)
 *
 * If we multiply gf_A by F and divide ga_A by F, both shifts increase
 * lambdaA/lambdaB by F. So to shift the RATIO by F_total = 10^(D/400),
 * each side gets F = sqrt(F_total) = 10^(D/800).
 *
 * This is why /800 is correct (vs /400 which would double-count).
 */
function effectiveRating(
  rating: TeamRating, hasHomeField: boolean,
): { gf: number; ga: number; pele: number } {
  if (!hasHomeField || !rating.homeField) {
    return { gf: rating.gf, ga: rating.ga, pele: rating.pele };
  }
  const factor = Math.pow(10, rating.homeField / 800);
  return {
    gf: rating.gf * factor,
    ga: rating.ga / factor,
    pele: rating.pele + rating.homeField,
  };
}

/**
 * Apply Silver Bulletin's empirical stage multiplier to the PELE gap.
 *
 * Per Silver Bulletin's methodology page:
 *   "applying a 0.9x multiplier on the difference in PELE ratings to
 *    group-stage matchups but a 1.1x multiplier to knockout-stage games"
 *
 * Why: group matches are empirically more upset-prone than PELE expects
 * (teams cautious early, draws are good results). Knockout matches are
 * chalkier (favorites win more often than baseline PELE expects).
 *
 * Implementation: pivot each team's PELE around the average of the two
 * PELEs, scaling each team's distance from that midpoint by `stageMult`.
 * Then re-derive GF/GA factors from the new PELE deltas via the same
 * 10^(delta/800) Elo→goal scaling used elsewhere.
 *
 * Worked example: Spain (PELE 2077) vs Cape Verde (PELE 1624)
 *   Avg = 1850.5, original gap = 453 PELE
 *   With 0.9x (group):    newSpain=2054, newCV=1647, gap=408 (compressed)
 *   With 1.1x (knockout): newSpain=2100, newCV=1601, gap=499 (stretched)
 *
 * The stage mult only affects this single match calculation — it does
 * NOT mutate stored ratings, so it doesn't carry across matches.
 */
function applyStageMultiplier(
  effA: { gf: number; ga: number; pele: number },
  effB: { gf: number; ga: number; pele: number },
  stageMult: number,
): [{ gf: number; ga: number; pele: number }, { gf: number; ga: number; pele: number }] {
  if (stageMult === 1) return [effA, effB];
  const avg = (effA.pele + effB.pele) / 2;
  const newPeleA = avg + (effA.pele - avg) * stageMult;
  const newPeleB = avg + (effB.pele - avg) * stageMult;
  // The change in PELE for each team — apply matching GF/GA scaling using 10^(delta/800)
  const factorA = Math.pow(10, (newPeleA - effA.pele) / 800);
  const factorB = Math.pow(10, (newPeleB - effB.pele) / 800);
  return [
    { gf: effA.gf * factorA, ga: effA.ga / factorA, pele: newPeleA },
    { gf: effB.gf * factorB, ga: effB.ga / factorB, pele: newPeleB },
  ];
}

const GROUP_STAGE_MULT = 0.9;
const KNOCKOUT_STAGE_MULT = 1.1;

// =============================================================================
// FORM STREAKINESS
// =============================================================================
// Per Silver Bulletin's methodology:
//   "rating adjustments within each simulated universe carry over from
//    game-to-game... a bit of short-term streakiness in international team
//    performance over intervals of roughly 30 days, i.e. coinciding with the
//    length of the World Cup, and our model accounts for this."
//
// MECHANIC: We track a per-team `form` bump (in PELE points) within each sim.
// After each match, the team's form is updated based on actual h-margin vs
// expected h-margin. Subsequent matches in the same sim use the bumped rating.
//
// FORM_K_FACTOR = 12 means a 1-goal overperformance vs expectation adds ~12
//   PELE points to that team's effective rating for remaining matches.
// FORM_MAX_BUMP = 60 caps the swing so a single result can't dominate; a hot
//   team can be at most 1.5 standard-deviations stronger than their base.

const FORM_K_FACTOR = 12;
const FORM_MAX_BUMP = 60;

/**
 * Update the within-sim form map after a match concludes.
 *
 * Uses h-margin (harmonic margin), per Silver Bulletin: 1st goal counts as 1,
 * 2nd as 1/2, 3rd as 1/3, etc. This gives diminishing returns to blowout
 * results — winning 7-1 isn't 6x as impressive as winning 2-1, since soccer
 * teams often play differently when leading.
 *
 * Update is zero-sum: teamA gains exactly what teamB loses.
 */
function applyFormUpdate(
  teamA: string, teamB: string,
  scoreA: number, scoreB: number,
  expectedLambdaA: number, expectedLambdaB: number,
  form: Record<string, number>,
): void {
  const actualMargin = harmonicMargin(scoreA - scoreB);
  const expectedMargin = harmonicMargin(expectedLambdaA - expectedLambdaB);
  const delta = (actualMargin - expectedMargin) * FORM_K_FACTOR;
  form[teamA] = clamp((form[teamA] ?? 0) + delta, -FORM_MAX_BUMP, FORM_MAX_BUMP);
  form[teamB] = clamp((form[teamB] ?? 0) - delta, -FORM_MAX_BUMP, FORM_MAX_BUMP);
}

/**
 * h-margin: harmonic series scoring. 1st goal=1, 2nd=1/2, 3rd=1/3.
 * A 3-1 win has h-margin = 1 + 1/2 = 1.5 (not 2 like raw margin).
 * A 2-0 win has h-margin = 1 + 1/2 = 1.5 (same as 3-1 — only the diff matters,
 *   so we apply harmonic on the absolute margin, not on each side's goals).
 */
function harmonicMargin(margin: number): number {
  if (margin === 0) return 0;
  const sign = margin < 0 ? -1 : 1;
  const abs = Math.abs(margin);
  let h = 0;
  for (let i = 1; i <= abs; i++) h += 1 / i;
  return sign * h;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Build a TEMPORARY copy of a team's rating with form bump applied.
 * The form bump is added to PELE; GF and GA are scaled by 10^(bump/800)
 * to match the standard PELE→goal conversion.
 *
 * Does not mutate the original rating object.
 */
function applyFormBump(rating: TeamRating, formBump: number): TeamRating {
  if (!formBump) return rating;
  const factor = Math.pow(10, formBump / 800);
  return {
    ...rating,
    pele: rating.pele + formBump,
    gf: rating.gf * factor,
    ga: rating.ga / factor,
  };
}

function simulateGroupMatch(
  teamA: string, teamB: string,
  ratings: Record<string, TeamRating>, avgGA: number,
  homeFor?: string,
  stageMult: number = GROUP_STAGE_MULT,
  form?: Record<string, number>,
): [number, number] {
  const a = ratings[teamA], b = ratings[teamB];
  if (!a || !b) return [0, 0];
  // Apply within-sim form bump
  const aBumped = applyFormBump(a, form?.[teamA] ?? 0);
  const bBumped = applyFormBump(b, form?.[teamB] ?? 0);
  let effA = effectiveRating(aBumped, homeFor === teamA);
  let effB = effectiveRating(bBumped, homeFor === teamB);
  [effA, effB] = applyStageMultiplier(effA, effB, stageMult);
  const lambdaA = effA.gf * (effB.ga / avgGA);
  const lambdaB = effB.gf * (effA.ga / avgGA);
  const [scoreA, scoreB] = sampleGoals(lambdaA, lambdaB);
  // Update form for the rest of this sim
  if (form) {
    applyFormUpdate(teamA, teamB, scoreA, scoreB, lambdaA, lambdaB, form);
  }
  return [scoreA, scoreB];
}

function simulateKnockoutMatch(
  teamA: string, teamB: string,
  ratings: Record<string, TeamRating>, avgGA: number,
  homeFor?: string,
  form?: Record<string, number>,
): string {
  const a = ratings[teamA], b = ratings[teamB];
  if (!a || !b) return Math.random() < 0.5 ? teamA : teamB;
  const aBumped = applyFormBump(a, form?.[teamA] ?? 0);
  const bBumped = applyFormBump(b, form?.[teamB] ?? 0);
  let effA = effectiveRating(aBumped, homeFor === teamA);
  let effB = effectiveRating(bBumped, homeFor === teamB);
  [effA, effB] = applyStageMultiplier(effA, effB, KNOCKOUT_STAGE_MULT);
  const lambdaA = effA.gf * (effB.ga / avgGA);
  const lambdaB = effB.gf * (effA.ga / avgGA);
  const [ga, gb] = sampleGoals(lambdaA, lambdaB);

  // Update form based on regulation result (the part that's "real" goals)
  if (form) {
    applyFormUpdate(teamA, teamB, ga, gb, lambdaA, lambdaB, form);
  }

  if (ga !== gb) return ga > gb ? teamA : teamB;
  // Draw after 90' regulation — simulate extra time then (if still tied) penalties.
  if (Math.random() < 0.4) {
    const [etA, etB] = sampleGoals(lambdaA / 2, lambdaB / 2);
    if (etA !== etB) return etA > etB ? teamA : teamB;
  }
  // Penalties: ~60/40 edge to better team based on PELE
  const probA = effA.pele / (effA.pele + effB.pele);
  const shotProb = 0.5 + (probA - 0.5) * 0.4;
  return Math.random() < shotProb ? teamA : teamB;
}

interface TeamStats { pts: number; gf: number; ga: number; gd: number }

interface GroupStageResult {
  order: Record<string, string[]>;
  tables: Record<string, Record<string, TeamStats>>;
}

/** Build a lookup of (teamA, teamB) -> actual score for fast match lookup. */
function buildActualLookup(actuals: ActualMatch[] | undefined): Map<string, [number, number]> {
  const m = new Map<string, [number, number]>();
  if (!actuals) return m;
  for (const a of actuals) {
    m.set(`${a.teamA}|${a.teamB}`, [a.scoreA, a.scoreB]);
    m.set(`${a.teamB}|${a.teamA}`, [a.scoreB, a.scoreA]);
  }
  return m;
}

function simulateGroupStage(
  groups: Record<string, string[]>,
  ratings: Record<string, TeamRating>,
  avgGA: number,
  actualGroupMatches?: Record<string, ActualMatch[]>,
  form?: Record<string, number>,
): GroupStageResult {
  const order: Record<string, string[]> = {};
  const tables: Record<string, Record<string, TeamStats>> = {};
  for (const [name, teams] of Object.entries(groups)) {
    const table: Record<string, TeamStats> = {};
    for (const t of teams) table[t] = { pts: 0, gf: 0, ga: 0, gd: 0 };
    const actualLookup = buildActualLookup(actualGroupMatches?.[name]);

    // In group stage, hosts play all 3 of their matches at home — find the host (if any) in this group
    const hostTeam = teams.find((t) => ratings[t]?.homeField);

    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        // Use real result if it exists, otherwise simulate (with home field if applicable)
        const actual = actualLookup.get(`${teams[i]}|${teams[j]}`);
        const homeFor = (teams[i] === hostTeam || teams[j] === hostTeam) ? hostTeam : undefined;
        const [ga, gb] = actual ?? simulateGroupMatch(teams[i], teams[j], ratings, avgGA, homeFor, GROUP_STAGE_MULT, form);
        table[teams[i]].gf += ga; table[teams[i]].ga += gb;
        table[teams[j]].gf += gb; table[teams[j]].ga += ga;
        if (ga > gb) table[teams[i]].pts += 3;
        else if (ga === gb) { table[teams[i]].pts += 1; table[teams[j]].pts += 1; }
        else table[teams[j]].pts += 3;
      }
    }
    for (const t of teams) table[t].gd = table[t].gf - table[t].ga;
    tables[name] = table;
    order[name] = [...teams].sort((a, b) =>
      table[b].pts - table[a].pts || table[b].gd - table[a].gd || table[b].gf - table[a].gf
    );
  }
  return { order, tables };
}

function getBest3rdPlace(
  groupOrder: Record<string, string[]>,
  tables: Record<string, Record<string, TeamStats>>,
): string[] {
  // Get all 12 third-place teams with their group stage stats
  const thirds: Array<{ team: string; pts: number; gd: number; gf: number }> = [];
  for (const [g, order] of Object.entries(groupOrder)) {
    const team = order[2];
    const stats = tables[g]?.[team];
    if (stats) {
      thirds.push({ team, pts: stats.pts, gd: stats.gd, gf: stats.gf });
    }
  }
  // FIFA tiebreakers: points > goal difference > goals scored
  thirds.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  return thirds.slice(0, 8).map(t => t.team);
}

function simulateKnockout(
  groupResults: Record<string, string[]>,
  advancing3rd: string[],
  ratings: Record<string, TeamRating>,
  avgGA: number,
  thirdPlaceLookup?: Record<string, string[]>,
  actualKnockoutResults?: Record<string, string>,
  knockoutHosts?: Record<string, string>,
  form?: Record<string, number>,
): { slotTeams: Record<string, string>; champion: string } {
  // Helper: pick a winner — use real result if exists, otherwise simulate.
  // If a host nation is playing in their own country, apply home field advantage.
  const winnerOf = (matchId: string, teamA: string, teamB: string): string => {
    const actual = actualKnockoutResults?.[matchId];
    if (actual && (actual === teamA || actual === teamB)) return actual;
    const host = knockoutHosts?.[matchId];
    let homeFor: string | undefined;
    if (host === teamA && ratings[teamA]?.homeField) homeFor = teamA;
    else if (host === teamB && ratings[teamB]?.homeField) homeFor = teamB;
    return simulateKnockoutMatch(teamA, teamB, ratings, avgGA, homeFor, form);
  };
  const winners: Record<string, string> = {};
  const runnersUp: Record<string, string> = {};
  for (const [g, order] of Object.entries(groupResults)) {
    winners[g] = order[0];
    runnersUp[g] = order[1];
  }

  // Build 3rd-place assignment using FIFA official lookup
  // Lookup order: [vs1A, vs1B, vs1D, vs1E, vs1G, vs1I, vs1K, vs1L]
  // R32_STRUCTURE slots using 3rd: indices 1(vs1E),4(vs1I),6(vs1A),7(vs1L),8(vs1D),9(vs1G),12(vs1B),14(vs1K)
  // Map: slot index in R32_STRUCTURE -> lookup table index
  const thirdPlaceSlotMap: Record<number, number> = { 1: 3, 4: 5, 6: 0, 7: 7, 8: 2, 9: 4, 12: 1, 14: 6 };

  // Determine which groups have advancing 3rd-place teams
  const advancingGroups: string[] = [];
  const groupToThird: Record<string, string> = {};
  for (const [g, order] of Object.entries(groupResults)) {
    const third = order[2];
    if (advancing3rd.includes(third)) {
      advancingGroups.push(g);
      groupToThird[g] = third;
    }
  }

  let thirdAssignment: string[] | null = null;
  if (thirdPlaceLookup) {
    const key = [...advancingGroups].sort().join('');
    thirdAssignment = thirdPlaceLookup[key] ?? null;
  }

  function resolveSource(src: string, r32Idx: number): string {
    if (src.startsWith('1')) return winners[src[1]];
    if (src.startsWith('2')) return runnersUp[src[1]];
    if (src.startsWith('3:')) {
      if (thirdAssignment) {
        const lookupIdx = thirdPlaceSlotMap[r32Idx];
        if (lookupIdx !== undefined) {
          const assignedGroup = thirdAssignment[lookupIdx];
          return groupToThird[assignedGroup] ?? advancing3rd[parseInt(src.slice(2))];
        }
      }
      return advancing3rd[parseInt(src.slice(2))];
    }
    return '';
  }

  const slotTeams: Record<string, string> = {};

  // R32
  const r32Winners: string[] = [];
  for (let i = 0; i < 16; i++) {
    const matchId = `R32-${i + 1}`;
    const [srcA, srcB] = R32_STRUCTURE[i];
    const teamA = resolveSource(srcA, i);
    const teamB = resolveSource(srcB, i);
    slotTeams[`${matchId}-A`] = teamA;
    slotTeams[`${matchId}-B`] = teamB;
    const winner = winnerOf(matchId, teamA, teamB);
    slotTeams[`${matchId}-W`] = winner;
    r32Winners.push(winner);
  }

  // R16
  const r16Winners: string[] = [];
  for (let i = 0; i < 8; i++) {
    const matchId = `R16-${i + 1}`;
    const teamA = r32Winners[i * 2];
    const teamB = r32Winners[i * 2 + 1];
    slotTeams[`${matchId}-A`] = teamA;
    slotTeams[`${matchId}-B`] = teamB;
    const winner = winnerOf(matchId, teamA, teamB);
    slotTeams[`${matchId}-W`] = winner;
    r16Winners.push(winner);
  }

  // QF
  const qfWinners: string[] = [];
  for (let i = 0; i < 4; i++) {
    const matchId = `QF-${i + 1}`;
    const teamA = r16Winners[i * 2];
    const teamB = r16Winners[i * 2 + 1];
    slotTeams[`${matchId}-A`] = teamA;
    slotTeams[`${matchId}-B`] = teamB;
    const winner = winnerOf(matchId, teamA, teamB);
    slotTeams[`${matchId}-W`] = winner;
    qfWinners.push(winner);
  }

  // SF
  const sfWinners: string[] = [];
  const sfLosers: string[] = [];
  for (let i = 0; i < 2; i++) {
    const matchId = `SF-${i + 1}`;
    const teamA = qfWinners[i * 2];
    const teamB = qfWinners[i * 2 + 1];
    slotTeams[`${matchId}-A`] = teamA;
    slotTeams[`${matchId}-B`] = teamB;
    const winner = winnerOf(matchId, teamA, teamB);
    const loser = winner === teamA ? teamB : teamA;
    slotTeams[`${matchId}-W`] = winner;
    sfWinners.push(winner);
    sfLosers.push(loser);
  }

  // 3rd place match
  slotTeams['3RD-A'] = sfLosers[0];
  slotTeams['3RD-B'] = sfLosers[1];
  slotTeams['3RD-W'] = winnerOf('3RD', sfLosers[0], sfLosers[1]);

  // Final
  slotTeams['FINAL-A'] = sfWinners[0];
  slotTeams['FINAL-B'] = sfWinners[1];
  const champion = winnerOf('FINAL', sfWinners[0], sfWinners[1]);
  slotTeams['FINAL-W'] = champion;

  return { slotTeams, champion };
}

// --- Player Scoring ---

function scoreGroupStageEntry(
  predictions: Array<{ groupName: string; order: string[] }>,
  thirdPlacePicks: string[],
  actualResults: Record<string, string[]>,
  advancing3rd: string[],
  teamSeeds: Record<string, number>,
  settings: ScoringSettings['groupStage'],
): number {
  let total = 0;
  for (const [groupName, actualOrder] of Object.entries(actualResults)) {
    const pred = predictions.find(p => p.groupName === groupName);
    if (!pred) continue;

    let advCorrectPts = 0, exactPts = 0, upsetPts = 0;
    let allAdvCorrect = true, allPosCorrect = true;

    for (let i = 0; i < 4; i++) {
      const team = actualOrder[i];
      const actualPos = i + 1;
      const predIdx = pred.order.indexOf(team);
      if (predIdx === -1) continue;
      const predPos = predIdx + 1;

      const predAdvance = predPos <= 2 || (predPos === 3 && thirdPlacePicks.includes(team));
      const actAdvance = actualPos <= 2 || (actualPos === 3 && advancing3rd.includes(team));
      if (predAdvance === actAdvance) advCorrectPts += settings.advanceCorrect;
      else allAdvCorrect = false;

      if (predPos === actualPos) exactPts += settings.exactPosition;
      else allPosCorrect = false;

      const seed = teamSeeds[team] ?? 4;
      if (actualPos <= predPos) {
        const bonus = Math.max(0, seed - predPos);
        upsetPts += bonus * settings.upsetBonusPerPlace;
      }
    }

    total += advCorrectPts + exactPts + upsetPts
      + (allAdvCorrect ? settings.advancementCorrectBonus : 0)
      + (allPosCorrect ? settings.perfectOrderBonus : 0);
  }
  return total;
}

interface KoMatchResult {
  winner: string;
  loser: string;
  round: number;
}

function scoreKnockoutEntry(
  picks: Record<string, string>,
  matchResults: Record<string, KoMatchResult>,
  teamRankings: Record<string, number>,
  settings: ScoringSettings['knockout'],
): number {
  let total = 0;
  for (const [matchId, result] of Object.entries(matchResults)) {
    if (!picks[matchId] || picks[matchId] !== result.winner) continue;

    total += settings.pointsPerRound[result.round] ?? 0;

    const winnerRank = teamRankings[result.winner] ?? 50;
    const loserRank = teamRankings[result.loser] ?? 50;
    const rankDiff = winnerRank - loserRank;
    if (rankDiff > 0) {
      const mult = settings.upsetMultiplierPerRound[result.round] ?? 0;
      total += Math.floor(rankDiff / settings.upsetModulus) * mult;
    }
  }
  return total;
}

// eslint-disable-next-line no-restricted-globals
const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<TournamentSimRequest>) => {
  const { ratings, avgGA, groups, numSims, entries, scoring, teamSeeds, teamRankings, thirdPlaceLookup, actualGroupMatches, actualKnockoutResults, finalGroupStandings, finalAdvancing3rd, knockoutHosts } = e.data;

  // Accumulators
  const groupPos: Record<string, number[][]> = {};
  const advanceCounts: Record<string, number> = {};
  const slotCounts: Record<string, Record<string, number>> = {};
  const championCounts: Record<string, number> = {};

  const allTeams = Object.values(groups).flat();
  for (const t of allTeams) {
    advanceCounts[t] = 0;
    championCounts[t] = 0;
  }
  for (const [g, teams] of Object.entries(groups)) {
    groupPos[g] = teams.map(() => [0, 0, 0, 0]);
  }

  // Player scoring accumulators
  const playerTotals: Record<string, { score: number; rank: number; wins: number }> = {};
  const hasPlayers = entries && entries.length > 0 && scoring && teamSeeds;
  if (hasPlayers) {
    for (const ent of entries!) playerTotals[ent.key] = { score: 0, rank: 0, wins: 0 };
  }

  const PROGRESS_INTERVAL = Math.max(1, Math.floor(numSims / 20));

  // If final group standings are provided (group stage complete), use them as-is
  const groupStageLocked = finalGroupStandings && Object.keys(finalGroupStandings).length === Object.keys(groups).length;

  for (let sim = 0; sim < numSims; sim++) {
    if (sim % PROGRESS_INTERVAL === 0) {
      ctx.postMessage({ type: 'progress', progress: sim } as SimResponse);
    }

    // Form bumps: per-team PELE adjustments accumulated within this single simulation.
    // Reset at the start of each sim so universes are independent. Per Silver Bulletin:
    // "rating adjustments within each simulated universe carry over from game-to-game"
    // and "there is a bit of short-term streakiness in international team performance
    // over intervals of roughly 30 days, i.e. coinciding with the length of the World Cup".
    const form: Record<string, number> = {};

    let groupOrder: Record<string, string[]>;
    let advancing3rd: string[];
    if (groupStageLocked) {
      groupOrder = finalGroupStandings!;
      advancing3rd = finalAdvancing3rd ?? [];
    } else {
      const gsResult = simulateGroupStage(groups, ratings, avgGA, actualGroupMatches, form);
      groupOrder = gsResult.order;
      advancing3rd = getBest3rdPlace(groupOrder, gsResult.tables);
    }

    // Track group positions
    for (const [g, order] of Object.entries(groupOrder)) {
      const teams = groups[g];
      for (let pos = 0; pos < 4; pos++) {
        const teamIdx = teams.indexOf(order[pos]);
        if (teamIdx >= 0) groupPos[g][teamIdx][pos]++;
      }
    }

    // Track advancement (top 2 + best 3rd)
    for (const order of Object.values(groupOrder)) {
      advanceCounts[order[0]]++;
      advanceCounts[order[1]]++;
    }
    for (const t of advancing3rd) {
      advanceCounts[t]++;
    }

    // Simulate knockout
    const { slotTeams, champion } = simulateKnockout(groupOrder, advancing3rd, ratings, avgGA, thirdPlaceLookup, actualKnockoutResults, knockoutHosts, form);
    championCounts[champion]++;

    // Track bracket slot occupancy
    for (const [slot, team] of Object.entries(slotTeams)) {
      if (!slotCounts[slot]) slotCounts[slot] = {};
      slotCounts[slot][team] = (slotCounts[slot][team] ?? 0) + 1;
    }

    // Score players
    if (hasPlayers) {
      // Build knockout match results with losers and rounds from slotTeams
      const koMatchResults: Record<string, KoMatchResult> = {};
      const roundLabels = ['R32', 'R16', 'QF', 'SF', '3RD', 'FINAL'];
      for (let rIdx = 0; rIdx < roundLabels.length; rIdx++) {
        const prefix = roundLabels[rIdx];
        if (prefix === '3RD' || prefix === 'FINAL') {
          const w = slotTeams[`${prefix}-W`];
          const a = slotTeams[`${prefix}-A`];
          const b = slotTeams[`${prefix}-B`];
          if (w && a && b) {
            koMatchResults[prefix] = { winner: w, loser: w === a ? b : a, round: rIdx };
          }
        } else {
          const count = prefix === 'R32' ? 16 : prefix === 'R16' ? 8 : prefix === 'QF' ? 4 : 2;
          for (let i = 1; i <= count; i++) {
            const matchId = `${prefix}-${i}`;
            const w = slotTeams[`${matchId}-W`];
            const a = slotTeams[`${matchId}-A`];
            const b = slotTeams[`${matchId}-B`];
            if (w && a && b) {
              koMatchResults[matchId] = { winner: w, loser: w === a ? b : a, round: rIdx };
            }
          }
        }
      }

      const scores: { key: string; score: number }[] = [];
      for (const ent of entries!) {
        const gsScore = scoreGroupStageEntry(
          ent.group_predictions, ent.third_place_picks,
          groupOrder, advancing3rd, teamSeeds!, scoring!.groupStage,
        );
        const koScore = scoreKnockoutEntry(ent.knockout_picks, koMatchResults, teamRankings ?? {}, scoring!.knockout);
        scores.push({ key: ent.key, score: gsScore + koScore });
      }
      scores.sort((a, b) => b.score - a.score);
      for (let i = 0; i < scores.length; i++) {
        const t = playerTotals[scores[i].key];
        t.score += scores[i].score;
        t.rank += i + 1;
        if (i === 0) t.wins++;
      }
    }
  }

  // Build results
  const groupResultsOut: Record<string, GroupPositionResult[]> = {};
  for (const [g, teams] of Object.entries(groups)) {
    groupResultsOut[g] = teams.map((team, idx) => ({
      team,
      pos: groupPos[g][idx],
      advance: advanceCounts[team],
    }));
  }

  const bracketSlots: BracketSlotResult[] = [];
  for (const [slotId, counts] of Object.entries(slotCounts)) {
    const teams = Object.entries(counts)
      .map(([team, count]) => ({ team, count }))
      .sort((a, b) => b.count - a.count);
    const round = slotId.split('-')[0];
    bracketSlots.push({ slotId, round, teams });
  }

  const championProbs = Object.entries(championCounts)
    .filter(([, c]) => c > 0)
    .map(([team, count]) => ({ team, pct: Math.round((count / numSims) * 1000) / 10 }))
    .sort((a, b) => b.pct - a.pct);

  const advanceProbs = Object.entries(advanceCounts)
    .map(([team, count]) => ({ team, pct: Math.round((count / numSims) * 1000) / 10 }))
    .sort((a, b) => b.pct - a.pct);

  // Player score results
  let playerScores: PlayerScoreResult[] | undefined;
  if (hasPlayers) {
    playerScores = entries!.map((ent) => {
      const t = playerTotals[ent.key];
      return {
        key: ent.key,
        avgScore: Math.round((t.score / numSims) * 10) / 10,
        avgRank: Math.round((t.rank / numSims) * 10) / 10,
        winPct: Math.round((t.wins / numSims) * 1000) / 10,
      };
    }).sort((a, b) => b.avgScore - a.avgScore);
  }

  ctx.postMessage({
    type: 'done',
    results: { groupResults: groupResultsOut, bracketSlots, championProbs, advanceProbs, playerScores },
  } as SimResponse);
};
