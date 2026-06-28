// =============================================================================
// 2026 FIFA World Cup Tournament Simulation Worker
// =============================================================================
//
// This Web Worker runs the full tournament simulation thousands of times to
// produce championship probabilities, advance probabilities, bracket-slot
// probabilities, and (optionally) per-player expected scores.
//
// Imports the shared 2026 FIFA group-stage tiebreaker chain from
// lib/groupOrder so every surface in the app (Live Standings, autofill,
// what-if simulator, sync/finalization, this worker) produces the same
// finishing order from the same match data. All other data (ratings, lookup
// tables, etc.) is still passed in via the request message.
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
//   3. Goals are sampled from a Dixon-Coles-corrected joint Poisson with
//      rho = -0.13. Empirically, removing DC made per-match draws closer to
//      sportsbook reality but worsened tournament-level RMSE (favorites lost
//      amplification). Kept here as an empirical tuning knob — combined with
//      a ramping knockout stage multiplier, the tournament % match SB.
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

import {
  orderGroupTeams,
  rankThirdPlaceCandidates,
  type GroupMatch,
  type TeamRecord,
} from '@/lib/groupOrder';

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
  /**
   * 'full' (default): run group + knockout simulation, produce all the usual
   *   results (championProbs, advanceProbs, bracketSlots, playerScores, etc).
   * 'groupOnly': simulate only the group stage and compute the R32 slot team
   *   distributions (which team is most likely to fill each R32 side). Knockout
   *   matches are not simulated. Used by the knockout-picker UI to power
   *   "click to see possibilities" before R32 teams are locked.
   */
  mode?: 'full' | 'groupOnly';
  ratings: Record<string, TeamRating>;
  avgGA: number;
  groups: Record<string, string[]>;
  numSims: number;
  entries?: PlayerEntry[];
  scoring?: ScoringSettings;
  /**
   * When false (default), the worker scores ONLY group-stage points for each
   * player and skips knockout scoring entirely — even if a user has saved
   * knockout picks. Used pre-knockout-lock so the leaderboard's projected
   * "Exp Pts" reflects only what's truly committed (group picks) and isn't
   * inflated by knockout picks that the user can still change before lock.
   * Set to true once lock_time_knockout has passed.
   */
  scoreKnockoutPicks?: boolean;
  teamSeeds?: Record<string, number>;
  teamRankings?: Record<string, number>;
  thirdPlaceLookup?: Record<string, string[]>;
  /**
   * Already-completed group stage matches keyed by group name.
   * Each match locks the goals so the table is partially deterministic.
   */
  actualGroupMatches?: Record<string, ActualMatch[]>;
  /**
   * In-progress group matches keyed by group name. Each entry carries
   * pre-sampled final scorelines from the live model — the worker draws a
   * random one per iteration so the standings distribution captures the
   * uncertainty in how an unfinished match might end.
   */
  inProgressGroupMatches?: Record<string, Array<{
    teamA: string;
    teamB: string;
    sampledScores: Array<[number, number]>;
  }>>;
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
   * In-progress knockout matches — analogue of inProgressGroupMatches but
   * collapsed to a single winner per sample (knockouts have no draws). Keyed
   * by team pair so the worker can look up by (teamA, teamB) regardless of
   * which downstream slot the match feeds. Built on the page via
   * sampleLiveKnockoutWinners using the current scoreline and minute.
   */
  inProgressKnockoutMatches?: Array<{
    teamA: string;
    teamB: string;
    sampledWinners: string[];
  }>;
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
  /** Score → fraction of sims that produced this exact score. Sums to 1.
   *  Sparse: only buckets with non-zero probability are present. */
  scoreDistribution: Record<number, number>;
  /** Expected points per group ('A'..'L') across all sims. */
  avgGroupScores: Record<string, number>;
  /** Expected points per knockout round ('R32', 'R16', 'QF', 'SF', '3RD', 'FINAL'). */
  avgRoundScores: Record<string, number>;
  /** Per-group full score distribution: groupName → score → fraction. */
  groupScoreDistributions: Record<string, Record<number, number>>;
  /** Per-round full score distribution: roundLabel → score → fraction. */
  roundScoreDistributions: Record<string, Record<number, number>>;
}

interface SimResponse {
  type: 'progress' | 'partial' | 'done';
  progress?: number;
  /** When the message is 'partial', this is the sim count the partial covers. */
  simsCompleted?: number;
  results?: {
    groupResults: Record<string, GroupPositionResult[]>;
    bracketSlots: BracketSlotResult[];
    championProbs: Array<{ team: string; pct: number }>;
    advanceProbs: Array<{ team: string; pct: number }>;
    playerScores?: PlayerScoreResult[];
    /** matchId → outcome → userKey → expected total score given that outcome. */
    conditionalScores?: Record<string, Record<string, Record<string, number>>>;
  };
  /** Present only when the request was mode: 'groupOnly'. */
  groupOnlyResults?: {
    /** R32 slot teams keyed by 'R32-{n}-A' / 'R32-{n}-B' → team → fraction
     *  of sims they filled that side. */
    r32SlotDistributions: Record<string, Record<string, number>>;
    /** team → P(team advances | team finished 3rd in their group). 1.0 means
     *  every sim where the team finished 3rd resulted in them advancing —
     *  i.e. they're CLINCHED to advance if their actual finish is 3rd.
     *  0.0 means they're clinched-out. Anything in between is undecided. */
    thirdAdvanceProb: Record<string, number>;
    /** Companion to thirdAdvanceProb: how many sims out of total this team
     *  actually finished 3rd. A team that only finished 3rd in 5 of 10000
     *  sims with thirdAdvanceProb=1.0 is still a high-confidence clinch,
     *  but the absolute count lets downstream consumers be conservative if
     *  they want. */
    thirdFinishCounts: Record<string, number>;
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

// FIFA 2026 R16 pairings — NOT sequential!
// Per FIFA's published bracket structure (Wikipedia 2026 FIFA World Cup
// knockout stage): each R16 match has specific R32 feeders that DON'T
// match the sequential 1+2, 3+4, ... pattern.
// FIFA match IDs M89-96 map to our R16-1..8.
//
//   R16-1 (M89) = W(R32-2) vs W(R32-5)  [feeders: 1E-3rd, 1I-3rd]
//   R16-2 (M90) = W(R32-1) vs W(R32-3)  [feeders: 2A-2B, 1F-2C]
//   R16-3 (M91) = W(R32-4) vs W(R32-6)  [feeders: 1C-2F, 2E-2I]
//   R16-4 (M92) = W(R32-7) vs W(R32-8)  [feeders: 1A-3rd, 1L-3rd]
//   R16-5 (M93) = W(R32-11) vs W(R32-12) [feeders: 2K-2L, 1H-2J]
//   R16-6 (M94) = W(R32-9) vs W(R32-10) [feeders: 1D-3rd, 1G-3rd]
//   R16-7 (M95) = W(R32-14) vs W(R32-16) [feeders: 1J-2H, 2D-2G]
//   R16-8 (M96) = W(R32-13) vs W(R32-15) [feeders: 1B-3rd, 1K-3rd]
//
// R32 indices below are 0-indexed (R32-1 = index 0, R32-16 = index 15).
const R16_FEEDERS: [number, number][] = [
  [1, 4],  // R16-1
  [0, 2],  // R16-2
  [3, 5],  // R16-3
  [6, 7],  // R16-4
  [10, 11], // R16-5
  [8, 9],  // R16-6
  [13, 15], // R16-7
  [12, 14], // R16-8
];

// QF pairings — also NOT sequential. Per FIFA's published structure:
//   QF-1 (M97)  = W(R16-1) vs W(R16-2)  ← happens to be sequential
//   QF-2 (M98)  = W(R16-5) vs W(R16-6)  ← skipped 3,4
//   QF-3 (M99)  = W(R16-3) vs W(R16-4)
//   QF-4 (M100) = W(R16-7) vs W(R16-8)
// R16 indices are 0-indexed (R16-1 = 0).
const QF_FEEDERS: [number, number][] = [
  [0, 1],  // QF-1
  [4, 5],  // QF-2
  [2, 3],  // QF-3
  [6, 7],  // QF-4
];

// SF pairings:
//   SF-1 (M101) = W(QF-1) vs W(QF-2)
//   SF-2 (M102) = W(QF-3) vs W(QF-4)
const SF_FEEDERS: [number, number][] = [
  [0, 1],  // SF-1
  [2, 3],  // SF-2
];

function poissonSample(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

/**
 * Dixon-Coles correlation parameter (rho).
 *
 * Pure independent Poisson under-predicts low-scoring draws (0-0, 1-1) per the
 * Dixon-Coles 1997 paper. Their tau correction inflates the joint probability
 * of the 4 lowest-scoring cells:
 *   tau(0,0) = 1 - lambda_a * lambda_b * rho
 *   tau(0,1) = 1 + lambda_a * rho
 *   tau(1,0) = 1 + lambda_b * rho
 *   tau(1,1) = 1 - rho
 *
 * Back-testing on 1080 international matches showed pure Poisson actually
 * predicts 0-0 slightly OVER what occurs (9.4% vs 8.5%) — DC theoretically
 * shouldn't be needed. But removing it hurt tournament-level calibration
 * because favorites lose the small amplification DC provides via the 1-1
 * cell boost. Kept at -0.13 as an empirical tuning knob.
 */
const DC_RHO = -0.13;

function sampleGoals(lambdaA: number, lambdaB: number): [number, number] {
  const a = poissonSample(lambdaA);
  const b = poissonSample(lambdaB);

  let tau = 1;
  if (a === 0 && b === 0) tau = 1 - lambdaA * lambdaB * DC_RHO;
  else if (a === 0 && b === 1) tau = 1 + lambdaA * DC_RHO;
  else if (a === 1 && b === 0) tau = 1 + lambdaB * DC_RHO;
  else if (a === 1 && b === 1) tau = 1 - DC_RHO;

  if (tau < 1 && Math.random() > tau) {
    if (a === 0 && b === 1) return [0, 0];
    if (a === 1 && b === 0) return [1, 1];
  }
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
  hfaScale: number = 1,
): { gf: number; ga: number; pele: number } {
  if (!hasHomeField || !rating.homeField) {
    return { gf: rating.gf, ga: rating.ga, pele: rating.pele };
  }
  // Apply optional scaling — used to dampen knockout HFA. See KO_HFA_SCALE
  // below: empirically calibrated against Silver Bulletin's published forecast,
  // host nations match SB's % when knockout HFA is applied at 50% of the
  // group-stage HFA. Likely reflects that high-stakes knockout matches are
  // tactically tighter and home-crowd effects matter less.
  const bonus = rating.homeField * hfaScale;
  const factor = Math.pow(10, bonus / 800);
  return {
    gf: rating.gf * factor,
    ga: rating.ga / factor,
    pele: rating.pele + bonus,
  };
}

/**
 * Scaling for knockout-stage home field advantage. Ramps DOWN as the tournament
 * advances: the host nation gets less of an edge in later, higher-stakes rounds.
 *   R32: 60%  →  R16: 55%  →  QF: 50%  →  SF: 45%  →  Final/3rd: 40%
 *
 * Group stage uses 100% HFA (full home field bonus from peleRatings.ts).
 */
const KO_HFA_SCALE_BY_ROUND: Record<string, number> = {
  R32: 0.60, R16: 0.55, QF: 0.50, SF: 0.45, FINAL: 0.40, '3RD': 0.40,
};
function knockoutHfaScale(matchId: string): number {
  if (matchId.startsWith('R32')) return KO_HFA_SCALE_BY_ROUND.R32;
  if (matchId.startsWith('R16')) return KO_HFA_SCALE_BY_ROUND.R16;
  if (matchId.startsWith('QF')) return KO_HFA_SCALE_BY_ROUND.QF;
  if (matchId.startsWith('SF')) return KO_HFA_SCALE_BY_ROUND.SF;
  if (matchId === 'FINAL' || matchId === '3RD') return KO_HFA_SCALE_BY_ROUND.FINAL;
  return 0.50;
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

/**
 * Knockout stage multiplier ramps UP by round: each subsequent round is
 * chalkier than the last, so the Final has the largest favorite amplification.
 *   R32: 1.10  →  R16: 1.125  →  QF: 1.15  →  SF: 1.175  →  Final/3rd: 1.20
 */
const KO_STAGE_MULT_BY_ROUND: Record<string, number> = {
  R32: 1.10, R16: 1.125, QF: 1.15, SF: 1.175, FINAL: 1.20, '3RD': 1.20,
};
function knockoutStageMult(matchId: string): number {
  if (matchId.startsWith('R32')) return KO_STAGE_MULT_BY_ROUND.R32;
  if (matchId.startsWith('R16')) return KO_STAGE_MULT_BY_ROUND.R16;
  if (matchId.startsWith('QF')) return KO_STAGE_MULT_BY_ROUND.QF;
  if (matchId.startsWith('SF')) return KO_STAGE_MULT_BY_ROUND.SF;
  if (matchId === 'FINAL' || matchId === '3RD') return KO_STAGE_MULT_BY_ROUND.FINAL;
  return 1.10;
}

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
  matchId: string = 'R32-1',
): string {
  const a = ratings[teamA], b = ratings[teamB];
  if (!a || !b) return Math.random() < 0.5 ? teamA : teamB;
  const aBumped = applyFormBump(a, form?.[teamA] ?? 0);
  const bBumped = applyFormBump(b, form?.[teamB] ?? 0);
  // Both HFA scaling and stage multiplier ramp by round (see consts above).
  const hfaScale = knockoutHfaScale(matchId);
  const stageMult = knockoutStageMult(matchId);
  let effA = effectiveRating(aBumped, homeFor === teamA, hfaScale);
  let effB = effectiveRating(bBumped, homeFor === teamB, hfaScale);
  [effA, effB] = applyStageMultiplier(effA, effB, stageMult);
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
  /** Per-group matches with scorelines for this sim — used by the conditional
   *  expected-score accumulator. matches[groupName][i] = { teamA, teamB, scoreA, scoreB }. */
  matches: Record<string, Array<{ teamA: string; teamB: string; scoreA: number; scoreB: number }>>;
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
  inProgressGroupMatches?: Record<string, Array<{
    teamA: string;
    teamB: string;
    sampledScores: Array<[number, number]>;
  }>>,
  teamRankings?: Record<string, number>,
): GroupStageResult {
  const order: Record<string, string[]> = {};
  const tables: Record<string, Record<string, TeamStats>> = {};
  const matches: Record<string, Array<{ teamA: string; teamB: string; scoreA: number; scoreB: number }>> = {};
  for (const [name, teams] of Object.entries(groups)) {
    const table: Record<string, TeamStats> = {};
    for (const t of teams) table[t] = { pts: 0, gf: 0, ga: 0, gd: 0 };
    const actualLookup = buildActualLookup(actualGroupMatches?.[name]);
    const inProgressLookup = buildInProgressLookup(inProgressGroupMatches?.[name]);
    matches[name] = [];

    // In group stage, hosts play all 3 of their matches at home — find the host (if any) in this group
    const hostTeam = teams.find((t) => ratings[t]?.homeField);

    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const matchKey = `${teams[i]}|${teams[j]}`;
        const actual = actualLookup.get(matchKey);
        const inProgressSamples = inProgressLookup.get(matchKey);
        const homeFor = (teams[i] === hostTeam || teams[j] === hostTeam) ? hostTeam : undefined;

        let ga: number, gb: number;
        if (actual) {
          [ga, gb] = actual;
        } else if (inProgressSamples) {
          // Draw a random pre-sampled scoreline (already keyed teamA→teamB
          // when the lookup was built — see buildInProgressLookup).
          const sample = inProgressSamples[Math.floor(Math.random() * inProgressSamples.length)];
          [ga, gb] = sample;
        } else {
          [ga, gb] = simulateGroupMatch(teams[i], teams[j], ratings, avgGA, homeFor, GROUP_STAGE_MULT, form);
        }
        table[teams[i]].gf += ga; table[teams[i]].ga += gb;
        table[teams[j]].gf += gb; table[teams[j]].ga += ga;
        if (ga > gb) table[teams[i]].pts += 3;
        else if (ga === gb) { table[teams[i]].pts += 1; table[teams[j]].pts += 1; }
        else table[teams[j]].pts += 3;
        matches[name].push({ teamA: teams[i], teamB: teams[j], scoreA: ga, scoreB: gb });
      }
    }
    for (const t of teams) table[t].gd = table[t].gf - table[t].ga;
    tables[name] = table;
    // Build a TeamRecord map and delegate to the shared canonical sorter.
    // Fair Play is `() => 0` in pure sims (we don't model card rates), so
    // step 7 of the chain is effectively a no-op and ties fall through to
    // the FIFA ranking step.
    const recordMap = new Map<string, TeamRecord>();
    for (const t of teams) {
      const s = table[t];
      recordMap.set(t, { team: t, points: s.pts, goalDifference: s.gd, goalsFor: s.gf });
    }
    const groupMatchesShared: GroupMatch[] = matches[name];
    order[name] = orderGroupTeams(
      teams,
      recordMap,
      groupMatchesShared,
      () => 0,
      (t) => teamRankings?.[t] ?? 9999,
    );
  }
  return { order, tables, matches };
}

/**
 * Build a lookup keyed by the pair-iteration order used in simulateGroupStage:
 * `${teams[i]}|${teams[j]}` → samples in that team order. Caller may pass the
 * teams in either order, so we register both keys with appropriately flipped
 * scoreline samples.
 */
function buildInProgressLookup(
  matches?: Array<{ teamA: string; teamB: string; sampledScores: Array<[number, number]> }>,
): Map<string, Array<[number, number]>> {
  const lookup = new Map<string, Array<[number, number]>>();
  if (!matches) return lookup;
  for (const m of matches) {
    if (!m.sampledScores?.length) continue;
    lookup.set(`${m.teamA}|${m.teamB}`, m.sampledScores);
    // Flipped so the iteration order doesn't matter.
    const flipped: Array<[number, number]> = m.sampledScores.map(([a, b]) => [b, a]);
    lookup.set(`${m.teamB}|${m.teamA}`, flipped);
  }
  return lookup;
}

function getBest3rdPlace(
  groupOrder: Record<string, string[]>,
  tables: Record<string, Record<string, TeamStats>>,
  teamRankings?: Record<string, number>,
): string[] {
  // Across-groups ranking can't use head-to-head (these teams haven't met).
  // Delegate to the canonical cross-group sorter.
  const candidates = [];
  for (const [g, order] of Object.entries(groupOrder)) {
    const team = order[2];
    const stats = tables[g]?.[team];
    if (stats) {
      candidates.push({
        team, points: stats.pts, goalDifference: stats.gd, goalsFor: stats.gf, fairPlay: 0,
      });
    }
  }
  return rankThirdPlaceCandidates(candidates, (t) => teamRankings?.[t] ?? 9999)
    .slice(0, 8)
    .map((c) => c.team);
}

/**
 * Compute R32 slot team assignments (each R32 match's A and B sides) given a
 * group-stage result and the 3rd-place advancement set. Pure: no knockout
 * matches simulated, no PRNG, just the FIFA seeding rules.
 *
 * Returns map like { 'R32-1-A': '<team>', 'R32-1-B': '<team>', ... }. Used by
 * the groupOnly mode of this worker, which feeds the knockout-picker UI.
 */
function computeR32SlotTeams(
  groupResults: Record<string, string[]>,
  advancing3rd: string[],
  thirdPlaceLookup?: Record<string, string[]>,
): Record<string, string> {
  const winners: Record<string, string> = {};
  const runnersUp: Record<string, string> = {};
  for (const [g, order] of Object.entries(groupResults)) {
    winners[g] = order[0];
    runnersUp[g] = order[1];
  }
  // R32_STRUCTURE slot index -> third-place lookup table index.
  const thirdPlaceSlotMap: Record<number, number> = { 1: 3, 4: 5, 6: 0, 7: 7, 8: 2, 9: 4, 12: 1, 14: 6 };
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
  const resolveSource = (src: string, r32Idx: number): string => {
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
  };
  const slotTeams: Record<string, string> = {};
  for (let i = 0; i < 16; i++) {
    const matchId = `R32-${i + 1}`;
    const [srcA, srcB] = R32_STRUCTURE[i];
    slotTeams[`${matchId}-A`] = resolveSource(srcA, i);
    slotTeams[`${matchId}-B`] = resolveSource(srcB, i);
  }
  return slotTeams;
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
  inProgressKnockoutLookup?: Map<string, string[]>,
): { slotTeams: Record<string, string>; champion: string } {
  // Helper: pick a winner — finalized result > live in-progress pre-samples >
  // fresh sim. Finalized takes precedence so once a game ends our cells stop
  // drifting; live samples already factor in the current scoreline + minute.
  const winnerOf = (matchId: string, teamA: string, teamB: string): string => {
    const actual = actualKnockoutResults?.[matchId];
    if (actual && (actual === teamA || actual === teamB)) return actual;
    if (inProgressKnockoutLookup) {
      const live = inProgressKnockoutLookup.get(`${teamA}|${teamB}`)
                ?? inProgressKnockoutLookup.get(`${teamB}|${teamA}`);
      if (live && live.length > 0) {
        return live[Math.floor(Math.random() * live.length)];
      }
    }
    const host = knockoutHosts?.[matchId];
    let homeFor: string | undefined;
    if (host === teamA && ratings[teamA]?.homeField) homeFor = teamA;
    else if (host === teamB && ratings[teamB]?.homeField) homeFor = teamB;
    return simulateKnockoutMatch(teamA, teamB, ratings, avgGA, homeFor, form, matchId);
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

  // R16 — using FIFA's official R16_FEEDERS map (not sequential)
  const r16Winners: string[] = [];
  for (let i = 0; i < 8; i++) {
    const matchId = `R16-${i + 1}`;
    const [aIdx, bIdx] = R16_FEEDERS[i];
    const teamA = r32Winners[aIdx];
    const teamB = r32Winners[bIdx];
    slotTeams[`${matchId}-A`] = teamA;
    slotTeams[`${matchId}-B`] = teamB;
    const winner = winnerOf(matchId, teamA, teamB);
    slotTeams[`${matchId}-W`] = winner;
    r16Winners.push(winner);
  }

  // QF — using FIFA's official QF_FEEDERS map (not sequential)
  const qfWinners: string[] = [];
  for (let i = 0; i < 4; i++) {
    const matchId = `QF-${i + 1}`;
    const [aIdx, bIdx] = QF_FEEDERS[i];
    const teamA = r16Winners[aIdx];
    const teamB = r16Winners[bIdx];
    slotTeams[`${matchId}-A`] = teamA;
    slotTeams[`${matchId}-B`] = teamB;
    const winner = winnerOf(matchId, teamA, teamB);
    slotTeams[`${matchId}-W`] = winner;
    qfWinners.push(winner);
  }

  // SF — using SF_FEEDERS (happens to be sequential pairing)
  const sfWinners: string[] = [];
  const sfLosers: string[] = [];
  for (let i = 0; i < 2; i++) {
    const matchId = `SF-${i + 1}`;
    const [aIdx, bIdx] = SF_FEEDERS[i];
    const teamA = qfWinners[aIdx];
    const teamB = qfWinners[bIdx];
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

/**
 * Score the group stage and return per-group breakdown plus total.
 * The per-group map is keyed by group name (A, B, ..., L) and includes the
 * group's full point contribution (advance + exact + upset + bonuses).
 */
function scoreGroupStageEntry(
  predictions: Array<{ groupName: string; order: string[] }>,
  thirdPlacePicks: string[],
  actualResults: Record<string, string[]>,
  advancing3rd: string[],
  teamSeeds: Record<string, number>,
  settings: ScoringSettings['groupStage'],
): { total: number; perGroup: Record<string, number> } {
  let total = 0;
  const perGroup: Record<string, number> = {};
  for (const [groupName, actualOrder] of Object.entries(actualResults)) {
    const pred = predictions.find(p => p.groupName === groupName);
    if (!pred) { perGroup[groupName] = 0; continue; }

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

      // Upset bonus uses max(predPos, actualPos) so a bold call that lands one
      // slot short still earns partial credit. Mirrors src/lib/scoring.ts.
      const seed = teamSeeds[team] ?? 4;
      const effectivePos = Math.max(predPos, actualPos);
      const bonus = Math.max(0, seed - effectivePos);
      upsetPts += bonus * settings.upsetBonusPerPlace;
    }

    const groupTotal = advCorrectPts + exactPts + upsetPts
      + (allAdvCorrect ? settings.advancementCorrectBonus : 0)
      + (allPosCorrect ? settings.perfectOrderBonus : 0);
    perGroup[groupName] = groupTotal;
    total += groupTotal;
  }
  return { total, perGroup };
}

interface KoMatchResult {
  winner: string;
  loser: string;
  round: number;
}

/**
 * Score the knockout stage and return per-round breakdown plus total.
 * Round labels: 'R32', 'R16', 'QF', 'SF', '3RD', 'FINAL'.
 */
const KO_ROUND_LABELS = ['R32', 'R16', 'QF', 'SF', '3RD', 'FINAL'] as const;

function scoreKnockoutEntry(
  picks: Record<string, string>,
  matchResults: Record<string, KoMatchResult>,
  teamRankings: Record<string, number>,
  settings: ScoringSettings['knockout'],
): { total: number; perRound: Record<string, number> } {
  let total = 0;
  const perRound: Record<string, number> = {};
  for (const label of KO_ROUND_LABELS) perRound[label] = 0;

  for (const [matchId, result] of Object.entries(matchResults)) {
    if (!picks[matchId] || picks[matchId] !== result.winner) continue;

    let pts = settings.pointsPerRound[result.round] ?? 0;

    const winnerRank = teamRankings[result.winner] ?? 50;
    const loserRank = teamRankings[result.loser] ?? 50;
    const rankDiff = winnerRank - loserRank;
    if (rankDiff > 0) {
      const mult = settings.upsetMultiplierPerRound[result.round] ?? 0;
      pts += Math.floor(rankDiff / settings.upsetModulus) * mult;
    }

    const label = KO_ROUND_LABELS[result.round] ?? 'R32';
    perRound[label] += pts;
    total += pts;
  }
  return { total, perRound };
}

/**
 * Run the group-only simulation: many iterations of the group stage, computing
 * R32 slot team assignments deterministically from each iteration's standings.
 * Aggregates per-slot team counts and reports them as fractions. Emits
 * progress + partials along the way, finishing with a 'done' carrying
 * `groupOnlyResults.r32SlotDistributions`.
 */
function runGroupOnly(
  ratings: Record<string, TeamRating>,
  avgGA: number,
  groups: Record<string, string[]>,
  numSims: number,
  thirdPlaceLookup?: Record<string, string[]>,
  actualGroupMatches?: Record<string, ActualMatch[]>,
  inProgressGroupMatches?: Record<string, Array<{ teamA: string; teamB: string; sampledScores: Array<[number, number]> }>>,
  teamRankings?: Record<string, number>,
  finalGroupStandings?: Record<string, string[]>,
  finalAdvancing3rd?: string[],
) {
  // eslint-disable-next-line no-restricted-globals
  const localCtx = self as unknown as Worker;
  const slotCounts: Record<string, Record<string, number>> = {};
  // Per (team, group): how often did this team finish 3rd in their group, and
  // of those, how often did they advance? After numSims iterations, the
  // ratio gives us P(team T advances | T finished 3rd). A value of 1.0 means
  // T advances in every universe where T finished 3rd; 0.0 means T never
  // advances in that case. Used to detect mid-stage 3rd-place clinches
  // before all 12 groups complete.
  const thirdFinishCounts: Record<string, number> = {};
  const thirdAdvanceCounts: Record<string, number> = {};
  const groupStageLocked = finalGroupStandings && Object.keys(finalGroupStandings).length === Object.keys(groups).length;

  const buildPartial = (sims: number) => {
    const dist: Record<string, Record<string, number>> = {};
    for (const [slot, counts] of Object.entries(slotCounts)) {
      const m: Record<string, number> = {};
      for (const [team, c] of Object.entries(counts)) m[team] = c / sims;
      dist[slot] = m;
    }
    // P(T advances | T finished 3rd). Only include teams that finished 3rd
    // at least once — otherwise the question is moot for them.
    const thirdAdvanceProb: Record<string, number> = {};
    for (const [team, n] of Object.entries(thirdFinishCounts)) {
      if (n === 0) continue;
      thirdAdvanceProb[team] = (thirdAdvanceCounts[team] ?? 0) / n;
    }
    return {
      r32SlotDistributions: dist,
      thirdAdvanceProb,
      // Also expose the absolute count so downstream code can confidence-gate
      // ("100% of 10000 sims" vs "100% of 5 sims" feels different).
      thirdFinishCounts: { ...thirdFinishCounts },
    };
  };

  // GroupOnly is roughly 2x faster per iteration than the full sim, so a
  // smaller partial step keeps the bracket updating at a similar wall-clock
  // cadence to /simulate (~10 visible refreshes across the run).
  const PROGRESS_INTERVAL = Math.max(1, Math.floor(numSims / 50));
  const PARTIAL_STEP = Math.max(100, Math.floor(numSims / 20));
  // Fire an early partial after just a few hundred sims so the bracket
  // gets something on screen quickly, rather than waiting for the first
  // full PARTIAL_STEP slice.
  const FIRST_PARTIAL_AT = 200;
  let earlyPartialEmitted = false;

  for (let sim = 0; sim < numSims; sim++) {
    if (sim % PROGRESS_INTERVAL === 0) {
      localCtx.postMessage({ type: 'progress', progress: sim } as SimResponse);
    }
    if (!earlyPartialEmitted && sim === FIRST_PARTIAL_AT) {
      localCtx.postMessage({
        type: 'partial', simsCompleted: sim, progress: sim,
        groupOnlyResults: buildPartial(sim),
      } as SimResponse);
      earlyPartialEmitted = true;
    } else if (sim > 0 && sim % PARTIAL_STEP === 0) {
      localCtx.postMessage({
        type: 'partial', simsCompleted: sim, progress: sim,
        groupOnlyResults: buildPartial(sim),
      } as SimResponse);
    }

    let groupOrder: Record<string, string[]>;
    let advancing3rd: string[];
    if (groupStageLocked) {
      groupOrder = finalGroupStandings!;
      advancing3rd = finalAdvancing3rd ?? [];
    } else {
      // Form bumps reset per sim (independent universes), same as full mode.
      const form: Record<string, number> = {};
      const gs = simulateGroupStage(groups, ratings, avgGA, actualGroupMatches, form, inProgressGroupMatches, teamRankings);
      groupOrder = gs.order;
      advancing3rd = getBest3rdPlace(groupOrder, gs.tables, teamRankings);
    }
    const slotTeams = computeR32SlotTeams(groupOrder, advancing3rd, thirdPlaceLookup);
    for (const [slot, team] of Object.entries(slotTeams)) {
      if (!team) continue;
      if (!slotCounts[slot]) slotCounts[slot] = {};
      slotCounts[slot][team] = (slotCounts[slot][team] ?? 0) + 1;
    }
    // Track 3rd-place advance probability for mid-stage clinch detection.
    const advancing3rdSet = new Set(advancing3rd);
    for (const order of Object.values(groupOrder)) {
      const thirdTeam = order[2];
      if (!thirdTeam) continue;
      thirdFinishCounts[thirdTeam] = (thirdFinishCounts[thirdTeam] ?? 0) + 1;
      if (advancing3rdSet.has(thirdTeam)) {
        thirdAdvanceCounts[thirdTeam] = (thirdAdvanceCounts[thirdTeam] ?? 0) + 1;
      }
    }
  }
  localCtx.postMessage({
    type: 'done', simsCompleted: numSims,
    groupOnlyResults: buildPartial(numSims),
  } as SimResponse);
}

// eslint-disable-next-line no-restricted-globals
const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<TournamentSimRequest>) => {
  const { mode, ratings, avgGA, groups, numSims, entries, scoring, teamSeeds, teamRankings, thirdPlaceLookup, actualGroupMatches, actualKnockoutResults, finalGroupStandings, finalAdvancing3rd, knockoutHosts, inProgressGroupMatches, inProgressKnockoutMatches, scoreKnockoutPicks } = e.data;

  // Build a fast lookup of in-progress knockout samples by team pair. Both
  // (A|B) and (B|A) keys are populated so the worker can find the match
  // regardless of which team is on which bracket side. Empty map when
  // there are no live knockouts — falls through to from-scratch sim.
  const inProgressKnockoutLookup = new Map<string, string[]>();
  if (inProgressKnockoutMatches) {
    for (const m of inProgressKnockoutMatches) {
      if (!m.sampledWinners?.length) continue;
      inProgressKnockoutLookup.set(`${m.teamA}|${m.teamB}`, m.sampledWinners);
      inProgressKnockoutLookup.set(`${m.teamB}|${m.teamA}`, m.sampledWinners);
    }
  }
  // Default to FALSE: pre-lock, the leaderboard's expected-points projection
  // should be group-stage only. Callers explicitly pass true once knockout
  // picks are locked in to include them in scoring.
  const includeKnockoutScoring = scoreKnockoutPicks === true;

  // Fast path for the knockout-picker UI: simulate the group stage only,
  // compute R32 slot team distributions, and return. No knockout matches
  // simulated, no player scoring — runs in roughly half the time of the
  // full sim and produces just what the picker needs.
  if (mode === 'groupOnly') {
    runGroupOnly(ratings, avgGA, groups, numSims, thirdPlaceLookup, actualGroupMatches, inProgressGroupMatches, teamRankings, finalGroupStandings, finalAdvancing3rd);
    return;
  }

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

  // Player scoring accumulators. groupScoreSums and roundScoreSums accumulate
  // per-bucket point totals across all sims so the leaderboard can show each
  // user's expected points per group / per round. groupScoreDist / roundScoreDist
  // track the full distribution of bucket scores so hover histograms work.
  const playerTotals: Record<string, {
    score: number;
    rank: number;
    wins: number;
    scoreCounts: Record<number, number>;
    groupScoreSums: Record<string, number>;
    roundScoreSums: Record<string, number>;
    /** Group → score-value → count. Same shape as scoreCounts but per group. */
    groupScoreDist: Record<string, Record<number, number>>;
    /** Round → score-value → count. */
    roundScoreDist: Record<string, Record<number, number>>;
  }> = {};
  const hasPlayers = entries && entries.length > 0 && scoring && teamSeeds;
  if (hasPlayers) {
    for (const ent of entries!) {
      playerTotals[ent.key] = {
        score: 0, rank: 0, wins: 0, scoreCounts: {},
        groupScoreSums: {}, roundScoreSums: {},
        groupScoreDist: {}, roundScoreDist: {},
      };
    }
  }

  /**
   * Conditional expected scores: matchId → outcome → userKey → { totalScore, count }.
   *   matchId examples: 'group:A:Mexico-South Africa', 'ko:R32-1', 'ko:FINAL'
   *   outcome for group: 'W' (teamA wins) | 'D' | 'L' (teamB wins)
   *   outcome for ko: team name (the winner)
   * After all sims complete, divide totalScore/count to get expected total
   * given that match outcome.
   */
  const conditionalScores: Record<string, Record<string, Record<string, { total: number; count: number }>>> = {};
  function bucketCond(matchId: string, outcome: string, userKey: string, score: number) {
    let m = conditionalScores[matchId];
    if (!m) { m = {}; conditionalScores[matchId] = m; }
    let o = m[outcome];
    if (!o) { o = {}; m[outcome] = o; }
    let u = o[userKey];
    if (!u) { u = { total: 0, count: 0 }; o[userKey] = u; }
    u.total += score;
    u.count += 1;
  }

  const PROGRESS_INTERVAL = Math.max(1, Math.floor(numSims / 20));

  /**
   * Build the result payload from current accumulator state. Called once at
   * each partial-result checkpoint (so the page can render fast) and once at
   * completion. Each call divides counts by `simsSoFar`, NOT the total numSims,
   * so the percentages reflect the data actually accumulated.
   */
  function buildResults(simsSoFar: number) {
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
      .map(([team, count]) => ({ team, pct: Math.round((count / simsSoFar) * 1000) / 10 }))
      .sort((a, b) => b.pct - a.pct);

    const advanceProbs = Object.entries(advanceCounts)
      .map(([team, count]) => ({ team, pct: Math.round((count / simsSoFar) * 1000) / 10 }))
      .sort((a, b) => b.pct - a.pct);

    let playerScores: PlayerScoreResult[] | undefined;
    if (hasPlayers) {
      playerScores = entries!.map((ent) => {
        const t = playerTotals[ent.key];
        const dist: Record<number, number> = {};
        for (const [score, count] of Object.entries(t.scoreCounts)) {
          dist[Number(score)] = Math.round((count / simsSoFar) * 100000) / 100000;
        }
        const avgGroupScores: Record<string, number> = {};
        for (const [g, sum] of Object.entries(t.groupScoreSums)) {
          avgGroupScores[g] = Math.round((sum / simsSoFar) * 10) / 10;
        }
        const avgRoundScores: Record<string, number> = {};
        for (const [r, sum] of Object.entries(t.roundScoreSums)) {
          avgRoundScores[r] = Math.round((sum / simsSoFar) * 10) / 10;
        }
        // Per-bucket distributions: convert counts → fractions.
        const groupScoreDistributions: Record<string, Record<number, number>> = {};
        for (const [g, byScore] of Object.entries(t.groupScoreDist)) {
          const out: Record<number, number> = {};
          for (const [s, c] of Object.entries(byScore)) {
            out[Number(s)] = Math.round((c / simsSoFar) * 100000) / 100000;
          }
          groupScoreDistributions[g] = out;
        }
        const roundScoreDistributions: Record<string, Record<number, number>> = {};
        for (const [r, byScore] of Object.entries(t.roundScoreDist)) {
          const out: Record<number, number> = {};
          for (const [s, c] of Object.entries(byScore)) {
            out[Number(s)] = Math.round((c / simsSoFar) * 100000) / 100000;
          }
          roundScoreDistributions[r] = out;
        }
        return {
          key: ent.key,
          avgScore: Math.round((t.score / simsSoFar) * 10) / 10,
          avgRank: Math.round((t.rank / simsSoFar) * 10) / 10,
          winPct: Math.round((t.wins / simsSoFar) * 1000) / 10,
          scoreDistribution: dist,
          avgGroupScores,
          avgRoundScores,
          groupScoreDistributions,
          roundScoreDistributions,
        };
      }).sort((a, b) => b.avgScore - a.avgScore);
    }

    // Conditional expected scores — finalize by dividing total/count per cell.
    const conditionalExpected: Record<string, Record<string, Record<string, number>>> = {};
    for (const [matchId, byOutcome] of Object.entries(conditionalScores)) {
      const m: Record<string, Record<string, number>> = {};
      for (const [outcome, byUser] of Object.entries(byOutcome)) {
        const u: Record<string, number> = {};
        for (const [userKey, { total, count }] of Object.entries(byUser)) {
          if (count > 0) u[userKey] = Math.round((total / count) * 10) / 10;
        }
        m[outcome] = u;
      }
      conditionalExpected[matchId] = m;
    }

    return { groupResults: groupResultsOut, bracketSlots, championProbs, advanceProbs, playerScores, conditionalScores: conditionalExpected };
  }

  // Sim-count checkpoints at which to emit partial results. Every 1000 sims
  // the page gets a refined snapshot (1k, 2k, 3k, ..., 9k); 10k is the final.
  const PARTIAL_STEP = 1000;

  // If final group standings are provided (group stage complete), use them as-is
  const groupStageLocked = finalGroupStandings && Object.keys(finalGroupStandings).length === Object.keys(groups).length;

  for (let sim = 0; sim < numSims; sim++) {
    if (sim % PROGRESS_INTERVAL === 0) {
      ctx.postMessage({ type: 'progress', progress: sim } as SimResponse);
    }
    if (sim > 0 && sim < numSims && sim % PARTIAL_STEP === 0) {
      ctx.postMessage({
        type: 'partial',
        simsCompleted: sim,
        progress: sim,
        results: buildResults(sim),
      } as SimResponse);
    }

    // Form bumps: per-team PELE adjustments accumulated within this single simulation.
    // Reset at the start of each sim so universes are independent. Per Silver Bulletin:
    // "rating adjustments within each simulated universe carry over from game-to-game"
    // and "there is a bit of short-term streakiness in international team performance
    // over intervals of roughly 30 days, i.e. coinciding with the length of the World Cup".
    const form: Record<string, number> = {};

    let groupOrder: Record<string, string[]>;
    let advancing3rd: string[];
    let groupMatchesThisSim: Record<string, Array<{ teamA: string; teamB: string; scoreA: number; scoreB: number }>> = {};
    if (groupStageLocked) {
      groupOrder = finalGroupStandings!;
      advancing3rd = finalAdvancing3rd ?? [];
    } else {
      const gsResult = simulateGroupStage(groups, ratings, avgGA, actualGroupMatches, form, inProgressGroupMatches, teamRankings);
      groupOrder = gsResult.order;
      advancing3rd = getBest3rdPlace(groupOrder, gsResult.tables, teamRankings);
      groupMatchesThisSim = gsResult.matches;
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
    const { slotTeams, champion } = simulateKnockout(groupOrder, advancing3rd, ratings, avgGA, thirdPlaceLookup, actualKnockoutResults, knockoutHosts, form, inProgressKnockoutLookup);
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

      const scores: { key: string; score: number; perGroup: Record<string, number>; perRound: Record<string, number> }[] = [];
      const EMPTY_PER_ROUND: Record<string, number> = {};
      for (const ent of entries!) {
        const gs = scoreGroupStageEntry(
          ent.group_predictions, ent.third_place_picks,
          groupOrder, advancing3rd, teamSeeds!, scoring!.groupStage,
        );
        // Pre-knockout-lock: skip knockout scoring so the projected score
        // is group-only. Knockout picks can still change so it would be
        // misleading to bake them into Exp Pts.
        const ko = includeKnockoutScoring
          ? scoreKnockoutEntry(ent.knockout_picks, koMatchResults, teamRankings ?? {}, scoring!.knockout)
          : { total: 0, perRound: EMPTY_PER_ROUND };
        scores.push({
          key: ent.key,
          score: gs.total + ko.total,
          perGroup: gs.perGroup,
          perRound: ko.perRound,
        });
      }
      scores.sort((a, b) => b.score - a.score);
      for (let i = 0; i < scores.length; i++) {
        const t = playerTotals[scores[i].key];
        const s = scores[i].score;
        t.score += s;
        t.rank += i + 1;
        if (i === 0) t.wins++;
        // Tally score histogram (integer buckets — group + knockout always integer).
        t.scoreCounts[s] = (t.scoreCounts[s] ?? 0) + 1;
        // Accumulate per-bucket sums + full distributions.
        for (const [g, pts] of Object.entries(scores[i].perGroup)) {
          t.groupScoreSums[g] = (t.groupScoreSums[g] ?? 0) + pts;
          if (!t.groupScoreDist[g]) t.groupScoreDist[g] = {};
          t.groupScoreDist[g][pts] = (t.groupScoreDist[g][pts] ?? 0) + 1;
        }
        for (const [r, pts] of Object.entries(scores[i].perRound)) {
          t.roundScoreSums[r] = (t.roundScoreSums[r] ?? 0) + pts;
          if (!t.roundScoreDist[r]) t.roundScoreDist[r] = {};
          t.roundScoreDist[r][pts] = (t.roundScoreDist[r][pts] ?? 0) + 1;
        }
      }

      // Bucket this sim into conditionalScores for every match outcome.
      // We do this once per sim (not per user-iteration) and loop over users inside.
      // Also bucket under the reversed team order with W/L flipped — the front-end
      // doesn't know the canonical GROUPS-array order, so it may build the matchId
      // with home/away from ESPN in either direction.
      for (const [groupName, gms] of Object.entries(groupMatchesThisSim)) {
        for (const m of gms) {
          const matchId = `group:${groupName}:${m.teamA}-${m.teamB}`;
          const matchIdRev = `group:${groupName}:${m.teamB}-${m.teamA}`;
          const outcome = m.scoreA > m.scoreB ? 'W' : m.scoreA < m.scoreB ? 'L' : 'D';
          const outcomeRev = outcome === 'W' ? 'L' : outcome === 'L' ? 'W' : 'D';
          const exact = `${m.scoreA}-${m.scoreB}`;
          const exactRev = `${m.scoreB}-${m.scoreA}`;
          for (const sc of scores) {
            bucketCond(matchId, outcome, sc.key, sc.score);
            bucketCond(matchId, exact, sc.key, sc.score);
            bucketCond(matchIdRev, outcomeRev, sc.key, sc.score);
            bucketCond(matchIdRev, exactRev, sc.key, sc.score);
          }
        }
      }
      for (const [matchId, ko] of Object.entries(koMatchResults)) {
        const id = `ko:${matchId}`;
        for (const sc of scores) {
          bucketCond(id, ko.winner, sc.key, sc.score);
        }
      }
    }
  }

  ctx.postMessage({
    type: 'done',
    simsCompleted: numSims,
    results: buildResults(numSims),
  } as SimResponse);
};
