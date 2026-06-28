// Pre-match analytic win/draw/loss probabilities using the same PELE +
// Dixon-Coles model as the simulator, computed as a Poisson grid sum
// instead of Monte Carlo (faster, deterministic, exact to ~5 decimals).

import { PELE_RATINGS, AVG_GA, type PeleRating } from '@/lib/peleRatings';
import { teamHasHomeField } from '@/lib/matchVenues';

const DC_RHO = -0.13;
const GROUP_STAGE_MULT = 0.9;

// Knockout stage multiplier ramps up by round: each subsequent round is
// chalkier than the last, so the Final has the largest favorite amplification.
// R32 → 1.10, R16 → 1.125, QF → 1.15, SF → 1.175, Final/3rd → 1.20.
const KO_STAGE_MULT_BY_ROUND = {
  R32: 1.10, R16: 1.125, QF: 1.15, SF: 1.175, FINAL: 1.20, '3RD': 1.20,
} as const;
const KNOCKOUT_STAGE_MULT_DEFAULT = 1.10;

// Knockout HFA dampens DOWN as the tournament advances: the host nation gets
// less of an edge in later, more intense rounds (less crowd support relative
// to away contingent, neutralizing tactics, etc.). R32 keeps 60% of the
// group-stage HFA, ramping down to 40% by the Final.
const KO_HFA_SCALE_BY_ROUND = {
  R32: 0.60, R16: 0.55, QF: 0.50, SF: 0.45, FINAL: 0.40, '3RD': 0.40,
} as const;
const KO_HFA_SCALE_DEFAULT = 0.50;

function rampedKnockoutMult(matchId: string | null | undefined): number {
  if (!matchId) return KNOCKOUT_STAGE_MULT_DEFAULT;
  if (matchId.startsWith('R32')) return KO_STAGE_MULT_BY_ROUND.R32;
  if (matchId.startsWith('R16')) return KO_STAGE_MULT_BY_ROUND.R16;
  if (matchId.startsWith('QF')) return KO_STAGE_MULT_BY_ROUND.QF;
  if (matchId.startsWith('SF')) return KO_STAGE_MULT_BY_ROUND.SF;
  if (matchId === 'FINAL' || matchId === '3RD') return KO_STAGE_MULT_BY_ROUND.FINAL;
  return KNOCKOUT_STAGE_MULT_DEFAULT;
}

function rampedKnockoutHfa(matchId: string | null | undefined): number {
  if (!matchId) return KO_HFA_SCALE_DEFAULT;
  if (matchId.startsWith('R32')) return KO_HFA_SCALE_BY_ROUND.R32;
  if (matchId.startsWith('R16')) return KO_HFA_SCALE_BY_ROUND.R16;
  if (matchId.startsWith('QF')) return KO_HFA_SCALE_BY_ROUND.QF;
  if (matchId.startsWith('SF')) return KO_HFA_SCALE_BY_ROUND.SF;
  if (matchId === 'FINAL' || matchId === '3RD') return KO_HFA_SCALE_BY_ROUND.FINAL;
  return KO_HFA_SCALE_DEFAULT;
}

// Analytic grid bound — covers >99.99% of mass for any realistic lambda
// (max lambda we see is ~5; e^-5 * 5^15 / 15! ≈ 1e-7).
const MAX_GOALS = 15;

// =============================================================================
// IN-GAME HAZARD MODEL
// =============================================================================
//
// Real soccer goals are NOT uniformly distributed across 90 minutes. Empirical
// findings (Armatas et al., Dixon-Robinson 1998, Ridder et al., World Cup data):
//
//   1. Goal hazard rises through the match. Last 15 min ≈ 1.4–1.6× the average
//      rate; first 15 min ≈ 0.6–0.7×. Driver: late-game urgency, fatigue, gaps.
//   2. Stoppage time matters. Real "90 min" is closer to 95+5=100 in practice;
//      added time scoring rate is ~the same as minutes 75–90.
//   3. Score-state effect (Dixon-Robinson): a trailing team's scoring rate
//      goes UP, a leading team's goes DOWN. Magnitude in the literature is
//      roughly +25% for trailing, –10% for leading at a 1-goal margin.
//
// We capture (1) and (2) with a piecewise hazard curve normalized to integrate
// to 90 (so the pre-match lambda math is unchanged), then numerically integrate
// score-state-adjusted hazard from the current minute to ~95 min. The score
// state is updated whenever a sampled goal changes the lead.
//
// Implementation: rather than do continuous-time simulation analytically (hard
// with score-state coupling), we Monte Carlo at 1-minute resolution. Cheap
// (≤ ~95 iterations × N teams × MC count). With 5000 sims this still resolves
// in <10ms in a worker thread, and gives us flexibility to add more hazard
// effects later.

/**
 * Per-minute hazard multipliers vs the league average. Indexed by minute.
 * Regulation 0..89 is renormalized to integrate to 90 (so pre-match lambda math
 * is unchanged when there's no stoppage). Stoppage minutes 90..MAX_MINUTE-1
 * extend beyond regulation at the late-game hazard rate.
 */
const HAZARD_BASE: number[] = (() => {
  const curve = (minute: number): number => {
    if (minute < 15) return 0.70;
    if (minute < 30) return 0.90;
    if (minute < 45) return 1.00;
    if (minute < 60) return 1.05;
    if (minute < 75) return 1.20;
    if (minute < 90) return 1.45;
    return 1.45; // stoppage runs at the late-game rate
  };
  const arr: number[] = [];
  // Cover 90 regulation + up to 12 stoppage (covers >99% of stoppage durations).
  for (let m = 0; m < 102; m++) arr.push(curve(m));
  // Renormalize so that minutes 0-89 sum to 90 (preserves total expected
  // goals = pre-match lambda for full-90 matches, no stoppage).
  let s = 0;
  for (let m = 0; m < 90; m++) s += arr[m];
  const k = 90 / s;
  return arr.map((x) => x * k);
})();

/** Maximum minute simulated, including stoppage tail. */
const MAX_MINUTE = 102;

/**
 * Stoppage time distribution after minute 90. World Cup 2022 averaged ~6 min
 * of 2H stoppage with substantial variance. Discrete probabilities below sum to 1.
 *   3 min: 0.10, 4 min: 0.18, 5 min: 0.22, 6 min: 0.20,
 *   7 min: 0.14, 8 min: 0.09, 9 min: 0.05, 10 min: 0.02
 */
const STOPPAGE_DISTRIBUTION: ReadonlyArray<readonly [number, number]> = [
  [3, 0.10], [4, 0.18], [5, 0.22], [6, 0.20],
  [7, 0.14], [8, 0.09], [9, 0.05], [10, 0.02],
];

/** Sample a 2H stoppage-time duration in minutes. */
function sampleStoppageMinutes(): number {
  const r = Math.random();
  let cum = 0;
  for (const [mins, p] of STOPPAGE_DISTRIBUTION) {
    cum += p;
    if (r <= cum) return mins;
  }
  return 10;
}

// Score-state hazard adjustments. The "urgency" of a deficit ramps up over the
// match: a 1-goal trailer at 30' isn't pushing as hard as a 1-goal trailer at 85'.
// Effective multipliers per goal of margin =
//     base + late * urgencyFactor(minute)
// where urgencyFactor goes 0 before minute 60, ramps to 1 over 60-75, stays at 1.
//
// Examples (per 1-goal margin):
//   minute 30:  trail boost = +10%, lead damp = -5%   (mostly tactical baseline)
//   minute 67:  trail boost = +25%, lead damp = -12%  (mid-ramp)
//   minute 85:  trail boost = +40%, lead damp = -20%  (full late-game urgency)
const TRAIL_BOOST_BASE = 0.10;
const TRAIL_BOOST_LATE = 0.30;
const LEAD_DAMP_BASE = 0.05;
const LEAD_DAMP_LATE = 0.15;
const MAX_MARGIN_EFFECT = 2;

const URGENCY_RAMP_START = 60;
const URGENCY_RAMP_END = 75;

/** 0 before URGENCY_RAMP_START, linear up to 1 by URGENCY_RAMP_END, then 1. */
function urgencyFactor(minute: number): number {
  if (minute <= URGENCY_RAMP_START) return 0;
  if (minute >= URGENCY_RAMP_END) return 1;
  return (minute - URGENCY_RAMP_START) / (URGENCY_RAMP_END - URGENCY_RAMP_START);
}

/** Live MC sim count — enough for stable percentages, fast in-browser. */
const LIVE_MC_SIMS = 4000;

/** Default scoreline-sample count when feeding in-progress matches into the
 *  forecast. 1000 is enough that re-sampling per tournament-sim iteration
 *  doesn't introduce noticeable quantization. */
export const DEFAULT_SCORELINE_SAMPLES = 1000;

export interface MatchOdds {
  winA: number;
  draw: number;
  winB: number;
  expectedScoreA: number;
  expectedScoreB: number;
}

function poissonPmf(k: number, lambda: number): number {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p = (p * lambda) / i;
  return p;
}

function effectiveRating(rating: PeleRating, hasHfa: boolean, hfaScale: number) {
  if (!hasHfa || !rating.homeField) {
    return { gf: rating.gf, ga: rating.ga, pele: rating.pele };
  }
  const bonus = rating.homeField * hfaScale;
  const factor = Math.pow(10, bonus / 800);
  return { gf: rating.gf * factor, ga: rating.ga / factor, pele: rating.pele + bonus };
}

function applyStageMultiplier(
  a: { gf: number; ga: number; pele: number },
  b: { gf: number; ga: number; pele: number },
  mult: number,
) {
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

/**
 * Run one Monte Carlo trajectory of a match from `(scoreA, scoreB)` at minute
 * `startMin` to full time. Returns the final scoreline. Stoppage time is
 * sampled per trajectory from STOPPAGE_DISTRIBUTION (truncated if startMin
 * already exceeds 90).
 *
 * Per-minute logic:
 *   per-team rate = baseRate × HAZARD_BASE[minute] × scoreStateAdjust(margin, minute)
 * Per-minute Bernoulli ≈ Poisson at these rates (~0.01-0.05/min) — at most one
 * goal per team per minute, which empirically loses <0.1% of mass.
 */
function simulateMatchTrajectory(
  baseRateA: number,
  baseRateB: number,
  scoreA: number,
  scoreB: number,
  startMin: number,
): [number, number] {
  let a = scoreA, b = scoreB;

  // Sample the regulation portion (start..89).
  const regEnd = 90;
  for (let m = startMin; m < regEnd; m++) {
    const hazard = HAZARD_BASE[m] ?? HAZARD_BASE[89];
    const margin = a - b;
    const adjA = scoreStateAdjust(margin, m);
    const adjB = scoreStateAdjust(-margin, m);
    if (Math.random() < baseRateA * hazard * adjA) a++;
    if (Math.random() < baseRateB * hazard * adjB) b++;
  }

  // Sample stoppage time. If we already passed 90', whatever stoppage was
  // observed (e.g. ESPN reports "90+5") is treated as elapsed; we still sample
  // a remaining tail since real stoppage often runs a minute longer than the
  // board says (refs add for late substitutions, VAR, etc.).
  const stoppageTotal = sampleStoppageMinutes();
  const stoppageStart = Math.max(regEnd, startMin);
  const stoppageEnd = Math.min(MAX_MINUTE, regEnd + stoppageTotal);
  for (let m = stoppageStart; m < stoppageEnd; m++) {
    const hazard = HAZARD_BASE[m] ?? HAZARD_BASE[89];
    const margin = a - b;
    const adjA = scoreStateAdjust(margin, m);
    const adjB = scoreStateAdjust(-margin, m);
    if (Math.random() < baseRateA * hazard * adjA) a++;
    if (Math.random() < baseRateB * hazard * adjB) b++;
  }

  return [a, b];
}

/**
 * Live in-game odds — Monte Carlo per-minute sim from the current state.
 *
 * For each remaining minute, sample a goal for each team using a Poisson rate:
 *   per-minute rate = (lambda / 90) × HAZARD_BASE[minute] × scoreStateAdjust(margin, minute)
 * Score-state adjustment uses the lead/trail margin AT THAT MINUTE and ramps up
 * after minute 60, so a 1-goal trailer at 30' is mostly tactical and a 1-goal
 * trailer at 85' is throwing bodies forward.
 *
 * Stoppage time is sampled per trajectory (3-10 min, mode at 5).
 */
export function computeLiveOdds(
  teamA: string,
  teamB: string,
  scoreA: number,
  scoreB: number,
  minutesPlayed: number,
  opts: { stage?: 'group' | 'knockout'; matchId?: string | null } = {},
): MatchOdds | null {
  const base = computeBaseLambdas(teamA, teamB, opts);
  if (!base) return null;
  const { lambdaA, lambdaB } = base;

  const baseRateA = lambdaA / 90;
  const baseRateB = lambdaB / 90;
  const startMin = Math.max(0, Math.min(Math.floor(minutesPlayed), MAX_MINUTE));

  // If we're past the realistic stoppage tail, the game is over.
  if (startMin >= MAX_MINUTE) {
    if (scoreA > scoreB) return { winA: 1, draw: 0, winB: 0, expectedScoreA: scoreA, expectedScoreB: scoreB };
    if (scoreA < scoreB) return { winA: 0, draw: 0, winB: 1, expectedScoreA: scoreA, expectedScoreB: scoreB };
    return { winA: 0, draw: 1, winB: 0, expectedScoreA: scoreA, expectedScoreB: scoreB };
  }

  let winA = 0, draw = 0, winB = 0;
  let totalA = 0, totalB = 0;

  for (let s = 0; s < LIVE_MC_SIMS; s++) {
    const [a, b] = simulateMatchTrajectory(baseRateA, baseRateB, scoreA, scoreB, startMin);
    if (a > b) winA++;
    else if (a < b) winB++;
    else draw++;
    totalA += a;
    totalB += b;
  }

  return {
    winA: winA / LIVE_MC_SIMS,
    draw: draw / LIVE_MC_SIMS,
    winB: winB / LIVE_MC_SIMS,
    expectedScoreA: totalA / LIVE_MC_SIMS,
    expectedScoreB: totalB / LIVE_MC_SIMS,
  };
}

/**
 * Sample N final scorelines for an in-progress match. Used by the tournament
 * forecast to feed in-progress matches into group standings — drawing a random
 * sample per simulation iteration preserves the proper joint distribution.
 *
 * @returns null if either team isn't in PELE_RATINGS.
 */
export function sampleLiveScores(
  teamA: string,
  teamB: string,
  scoreA: number,
  scoreB: number,
  minutesPlayed: number,
  numSamples: number = DEFAULT_SCORELINE_SAMPLES,
  opts: { stage?: 'group' | 'knockout'; matchId?: string | null } = {},
): Array<[number, number]> | null {
  const base = computeBaseLambdas(teamA, teamB, opts);
  if (!base) return null;
  const { lambdaA, lambdaB } = base;

  const baseRateA = lambdaA / 90;
  const baseRateB = lambdaB / 90;
  const startMin = Math.max(0, Math.min(Math.floor(minutesPlayed), MAX_MINUTE));

  // Game already over: every sample is the same final score.
  if (startMin >= MAX_MINUTE) {
    const out: Array<[number, number]> = [];
    for (let i = 0; i < numSamples; i++) out.push([scoreA, scoreB]);
    return out;
  }

  const samples: Array<[number, number]> = new Array(numSamples);
  for (let s = 0; s < numSamples; s++) {
    samples[s] = simulateMatchTrajectory(baseRateA, baseRateB, scoreA, scoreB, startMin);
  }
  return samples;
}

// Knuth's algorithm — fine for small lambdas (our ET values are well under 2).
function poissonSample(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

/** Full breakdown of a single knockout-match sample. Tracks WHICH phase
 *  the winner emerged from so the UI can show "X% wins in regulation, Y%
 *  in ET, Z% on pens." */
export interface KnockoutSampleOutcome {
  winner: 'A' | 'B';
  phase: 'regulation' | 'et' | 'pens';
  /** Final scoreline including ET goals (pens not added to scoreline). */
  finalA: number;
  finalB: number;
}

export interface KnockoutSampleSummary {
  /** Per-sample outcome — full distribution including phase + final score. */
  samples: KnockoutSampleOutcome[];
  /** Probability of each phase resolving the match (sum ≈ 1). */
  regulationProb: number;
  etProb: number;
  pensProb: number;
  /** Probability team A advances (across all phases). */
  winProbA: number;
  /** Probability team B advances (across all phases). */
  winProbB: number;
}

/**
 * Full knockout-match sampler. Runs N trajectories through regulation, ET
 * (if tied), and pens (if still tied). Each sample carries which phase
 * decided it so the UI can show ET/pens probabilities and ET-inclusive
 * scoreline distributions.
 *
 * Phase model mirrors simulateKnockoutMatch in the tournament worker:
 *   - Regulation scoreline sampled by simulateMatchTrajectory.
 *   - If tied: 40% chance ET produces a winner (half-strength Poisson per
 *     team, sampled as one bulk Poisson — abstracts away the two 15' halves).
 *   - If still tied after ET: penalty shootout with a slight lean toward
 *     the higher-PELE team.
 */
export function sampleLiveKnockoutMatch(
  teamA: string,
  teamB: string,
  scoreA: number,
  scoreB: number,
  minutesPlayed: number,
  numSamples: number = DEFAULT_SCORELINE_SAMPLES,
  opts: { matchId?: string | null } = {},
): KnockoutSampleSummary | null {
  const regulation = sampleLiveScores(teamA, teamB, scoreA, scoreB, minutesPlayed, numSamples, { stage: 'knockout', matchId: opts.matchId });
  if (!regulation) return null;

  const base = computeBaseLambdas(teamA, teamB, { stage: 'knockout', matchId: opts.matchId });
  if (!base) return null;
  const { lambdaA, lambdaB } = base;

  const rA = PELE_RATINGS[teamA];
  const rB = PELE_RATINGS[teamB];
  const peleA = rA?.pele ?? 1, peleB = rB?.pele ?? 1;
  const probA = peleA / (peleA + peleB);
  const penProbA = 0.5 + (probA - 0.5) * 0.4;

  // ET total expected goals per team — half of full regulation lambda.
  const etLambdaA = lambdaA / 2;
  const etLambdaB = lambdaB / 2;

  let regCount = 0, etCount = 0, penCount = 0;
  let winACount = 0, winBCount = 0;
  const samples: KnockoutSampleOutcome[] = new Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const [ga, gb] = regulation[i];
    if (ga !== gb) {
      const winner = ga > gb ? 'A' : 'B';
      regCount++;
      if (winner === 'A') winACount++; else winBCount++;
      samples[i] = { winner, phase: 'regulation', finalA: ga, finalB: gb };
      continue;
    }
    // Tied at 90'. Always simulate ET first — pens can only happen if ET
    // also ends level. Use ~40% conversion rate: the half-strength Poisson
    // produces roughly that fraction of tied-at-90 games settled in ET,
    // matching observed World Cup history.
    const etA = poissonSample(etLambdaA);
    const etB = poissonSample(etLambdaB);
    if (etA !== etB) {
      const winner = etA > etB ? 'A' : 'B';
      etCount++;
      if (winner === 'A') winACount++; else winBCount++;
      samples[i] = { winner, phase: 'et', finalA: ga + etA, finalB: gb + etB };
      continue;
    }
    // ET also tied — go to pens.
    const winner = Math.random() < penProbA ? 'A' : 'B';
    penCount++;
    if (winner === 'A') winACount++; else winBCount++;
    samples[i] = { winner, phase: 'pens', finalA: ga + etA, finalB: gb + etB };
  }

  return {
    samples,
    regulationProb: regCount / numSamples,
    etProb: etCount / numSamples,
    pensProb: penCount / numSamples,
    winProbA: winACount / numSamples,
    winProbB: winBCount / numSamples,
  };
}

/**
 * Compatibility wrapper that returns just the winners (used by the
 * tournament sim worker, which doesn't care about phase/scoreline). Built
 * on top of sampleLiveKnockoutMatch so the model is single-sourced.
 */
export function sampleLiveKnockoutWinners(
  teamA: string,
  teamB: string,
  scoreA: number,
  scoreB: number,
  minutesPlayed: number,
  numSamples: number = DEFAULT_SCORELINE_SAMPLES,
  opts: { matchId?: string | null } = {},
): string[] | null {
  const summary = sampleLiveKnockoutMatch(teamA, teamB, scoreA, scoreB, minutesPlayed, numSamples, opts);
  if (!summary) return null;
  return summary.samples.map((s) => (s.winner === 'A' ? teamA : teamB));
}

/**
 * Score-state hazard multiplier — varies with both margin and game minute.
 * Late-game urgency ramps up the trailing-team boost and leading-team damp,
 * so a deficit at 30' has much milder behavioral effect than the same deficit
 * at 85'. Positive `margin` = this team is leading.
 */
function scoreStateAdjust(margin: number, minute: number): number {
  const m = Math.max(-MAX_MARGIN_EFFECT, Math.min(MAX_MARGIN_EFFECT, margin));
  if (m === 0) return 1;
  const u = urgencyFactor(minute);
  if (m > 0) {
    const damp = LEAD_DAMP_BASE + LEAD_DAMP_LATE * u;
    return Math.max(0.4, 1 - damp * m);
  }
  const boost = TRAIL_BOOST_BASE + TRAIL_BOOST_LATE * u;
  return 1 + boost * (-m);
}

/** Internal: compute pre-match Poisson lambdas for both teams. */
function computeBaseLambdas(
  teamA: string,
  teamB: string,
  opts: { stage?: 'group' | 'knockout'; matchId?: string | null } = {},
): { lambdaA: number; lambdaB: number } | null {
  const rA = PELE_RATINGS[teamA];
  const rB = PELE_RATINGS[teamB];
  if (!rA || !rB) return null;

  const stage = opts.stage ?? 'group';
  const matchIdForHfa = opts.matchId !== undefined ? opts.matchId : null;
  const stageMult = stage === 'knockout'
    ? rampedKnockoutMult(matchIdForHfa)
    : GROUP_STAGE_MULT;
  const hfaScale = stage === 'knockout'
    ? rampedKnockoutHfa(matchIdForHfa)
    : 1;
  const aHasHfa = teamHasHomeField(teamA, matchIdForHfa);
  const bHasHfa = teamHasHomeField(teamB, matchIdForHfa);

  let effA = effectiveRating(rA, aHasHfa, hfaScale);
  let effB = effectiveRating(rB, bHasHfa, hfaScale);
  [effA, effB] = applyStageMultiplier(effA, effB, stageMult);

  return {
    lambdaA: effA.gf * (effB.ga / AVG_GA),
    lambdaB: effB.gf * (effA.ga / AVG_GA),
  };
}

/**
 * Compute pre-match win/draw/loss odds and expected scoreline for teamA vs teamB.
 *
 * @param teamA Home/first team name (must exist in PELE_RATINGS)
 * @param teamB Away/second team name
 * @param opts.stage 'group' (0.9x rating gap) or 'knockout' (1.1x). Default 'group'.
 * @param opts.matchId Knockout match ID (e.g. 'R32-1') so we can look up host country.
 *                     For group matches pass null — any host plays at home automatically.
 *                     For knockout, the match-specific host is used. Pass undefined for
 *                     a neutral-site calculation.
 * @returns winA/draw/winB summing to 1.0, plus expected goals for each side.
 */
export function computeMatchOdds(
  teamA: string,
  teamB: string,
  opts: { stage?: 'group' | 'knockout'; matchId?: string | null } = {},
): MatchOdds | null {
  const base = computeBaseLambdas(teamA, teamB, opts);
  if (!base) return null;
  const { lambdaA, lambdaB } = base;

  // Pre-compute pmf vectors
  const pA: number[] = new Array(MAX_GOALS + 1);
  const pB: number[] = new Array(MAX_GOALS + 1);
  for (let i = 0; i <= MAX_GOALS; i++) {
    pA[i] = poissonPmf(i, lambdaA);
    pB[i] = poissonPmf(i, lambdaB);
  }

  let winA = 0, draw = 0, winB = 0;
  let expectedA = 0, expectedB = 0;

  for (let a = 0; a <= MAX_GOALS; a++) {
    for (let b = 0; b <= MAX_GOALS; b++) {
      let prob = pA[a] * pB[b];
      // Dixon-Coles tau correction on the four lowest cells.
      if (a === 0 && b === 0) prob *= 1 - lambdaA * lambdaB * DC_RHO;
      else if (a === 0 && b === 1) prob *= 1 + lambdaA * DC_RHO;
      else if (a === 1 && b === 0) prob *= 1 + lambdaB * DC_RHO;
      else if (a === 1 && b === 1) prob *= 1 - DC_RHO;

      if (a > b) winA += prob;
      else if (a < b) winB += prob;
      else draw += prob;

      expectedA += a * prob;
      expectedB += b * prob;
    }
  }

  // Renormalize for any floating-point drift
  const total = winA + draw + winB;
  return {
    winA: winA / total,
    draw: draw / total,
    winB: winB / total,
    expectedScoreA: expectedA / total,
    expectedScoreB: expectedB / total,
  };
}
