// Pre-match analytic win/draw/loss probabilities using the same PELE +
// Dixon-Coles model as the simulator, but computed as a Poisson grid sum
// instead of Monte Carlo (faster, deterministic, exact to ~5 decimals).

import { PELE_RATINGS, AVG_GA, type PeleRating } from '@/lib/peleRatings';
import { teamHasHomeField } from '@/lib/matchVenues';

const DC_RHO = -0.13;
const GROUP_STAGE_MULT = 0.9;
const KNOCKOUT_STAGE_MULT = 1.1;
const KO_HFA_SCALE = 0.5;

// Analytic grid bound — covers >99.99% of mass for any realistic lambda
// (max lambda we see is ~5; e^-5 * 5^15 / 15! ≈ 1e-7).
const MAX_GOALS = 15;

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
  const rA = PELE_RATINGS[teamA];
  const rB = PELE_RATINGS[teamB];
  if (!rA || !rB) return null;

  const stage = opts.stage ?? 'group';
  const stageMult = stage === 'knockout' ? KNOCKOUT_STAGE_MULT : GROUP_STAGE_MULT;
  const hfaScale = stage === 'knockout' ? KO_HFA_SCALE : 1;

  // For group stage we treat any host playing as home (matchId === null sentinel).
  // For knockouts, we look up the match's host country.
  const matchIdForHfa = opts.matchId !== undefined
    ? opts.matchId
    : (stage === 'group' ? null : null);
  const aHasHfa = teamHasHomeField(teamA, matchIdForHfa);
  const bHasHfa = teamHasHomeField(teamB, matchIdForHfa);

  let effA = effectiveRating(rA, aHasHfa, hfaScale);
  let effB = effectiveRating(rB, bHasHfa, hfaScale);
  [effA, effB] = applyStageMultiplier(effA, effB, stageMult);

  const lambdaA = effA.gf * (effB.ga / AVG_GA);
  const lambdaB = effB.gf * (effA.ga / AVG_GA);

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
      // Dixon-Coles tau correction on the four lowest cells
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
