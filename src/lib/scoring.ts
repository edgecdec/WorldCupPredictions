import {
  GroupPrediction,
  GroupStageResults,
  GroupStageScoringSettings,
  KnockoutScoringSettings,
  KnockoutResults,
  KnockoutMatchup,
  BracketData,
  DEFAULT_SCORING,
  ScoringSettings,
  KNOCKOUT_ROUNDS,
} from '@/types';
import { getTeamSeed, getTeamRanking } from '@/lib/bracketData';
import { computeEffectiveMatchups } from '@/lib/bracketUtils';

export interface GroupScoreDetail {
  groupName: string;
  total: number;
  advanceCorrectPoints: number;
  exactPositionPoints: number;
  upsetBonusPoints: number;
  advancementCorrectBonus: number;
  perfectOrderBonus: number;
}

export interface GroupStageScoreResult {
  total: number;
  perGroup: GroupScoreDetail[];
}

function didTeamAdvancePredicted(
  teamName: string,
  predictedPosition: number,
  thirdPlacePicks: string[],
): boolean {
  if (predictedPosition <= 2) return true;
  if (predictedPosition === 3) return thirdPlacePicks.includes(teamName);
  return false;
}

/**
 * Did this team advance, given the final group-stage outcome?
 *
 *   1st / 2nd → always advances (deterministic from order alone).
 *   4th       → never advances.
 *   3rd       → advances iff their team is in advancingThirdPlace.
 *
 * `advancingThirdPlace = undefined` means we don't yet know who advances
 * (the group stage isn't fully resolved). Callers should treat the 3rd-
 * place return value as "pending" in that case and skip awarding /
 * penalizing the advanceCorrect points for the 3rd-finisher.
 */
function didTeamAdvanceActual(
  teamName: string,
  actualPosition: number,
  advancingThirdPlace: string[] | undefined,
): boolean | undefined {
  if (actualPosition <= 2) return true;
  if (actualPosition >= 4) return false;
  // actualPosition === 3: only decidable when the advancing set is known.
  if (advancingThirdPlace === undefined) return undefined;
  return advancingThirdPlace.includes(teamName);
}

export function scoreGroupStage(
  predictions: GroupPrediction[],
  thirdPlacePicks: string[],
  results: GroupStageResults,
  bracketData: BracketData,
  settings: GroupStageScoringSettings = DEFAULT_SCORING.groupStage,
): GroupStageScoreResult {
  const perGroup: GroupScoreDetail[] = [];

  // `advancingThirdPlace` is the 8 teams advancing on a 3rd-place tiebreak.
  // When it's an empty array we treat that as "not yet known" — the partial-
  // scoring flow at the API uses `[]` to mean "this group is complete but
  // the 3rd-place advancement across the whole stage hasn't resolved yet."
  // Pass it as `undefined` to the helper so it can return "pending" for
  // 3rd-finishers in that case.
  const thirdPlaceKnown = results.advancingThirdPlace && results.advancingThirdPlace.length > 0;
  const knownAdvancing = thirdPlaceKnown ? results.advancingThirdPlace : undefined;

  for (const result of results.groupResults) {
    const prediction = predictions.find((p) => p.groupName === result.groupName);
    if (!prediction) continue;

    let advanceCorrectPoints = 0;
    let exactPositionPoints = 0;
    let upsetBonusPoints = 0;
    // Track whether every advance call was decidable AND correct. If even one
    // 3rd-finisher's call is pending, we can't award the advancementBonus yet.
    let allAdvanceCorrect = true;
    let anyAdvancePending = false;
    let allPositionsCorrect = true;

    for (let i = 0; i < 4; i++) {
      const teamName = result.order[i];
      const actualPosition = i + 1;
      const predictedIndex = prediction.order.indexOf(teamName);
      if (predictedIndex === -1) continue;
      const predictedPosition = predictedIndex + 1;

      // Advance correct. `actualAdvance === undefined` means we don't yet
      // know whether the 3rd-place team advances — skip awarding and skip
      // penalizing for now; revisit when the advancing set is known.
      const predictedAdvance = didTeamAdvancePredicted(teamName, predictedPosition, thirdPlacePicks);
      const actualAdvance = didTeamAdvanceActual(teamName, actualPosition, knownAdvancing);
      if (actualAdvance === undefined) {
        anyAdvancePending = true;
      } else if (predictedAdvance === actualAdvance) {
        advanceCorrectPoints += settings.advanceCorrect;
      } else {
        allAdvanceCorrect = false;
      }

      // Exact position
      if (predictedPosition === actualPosition) {
        exactPositionPoints += settings.exactPosition;
      } else {
        allPositionsCorrect = false;
      }

      // Upset bonus: reward identifying a low-pot team that overperforms its
      // seed. The bonus is computed against whichever is WORSE of (predictedPos,
      // actualPos) — so you get partial credit for spotting the upset even if
      // the team fell one slot short of your bold call.
      //
      // Examples (Turkiye = seed 4):
      //   pred=1, actual=2 → bonus = 4 - max(1,2) = 2   (you get partial credit)
      //   pred=3, actual=2 → bonus = 4 - max(3,2) = 1   (you predicted 3rd, they did better)
      //   pred=1, actual=1 → bonus = 4 - 1 = 3          (max bold call, fully realized)
      //   pred=2, actual=4 → bonus = 4 - max(2,4) = 0   (Turkiye finished at seed, no upset)
      const seed = getTeamSeed(bracketData, teamName);
      if (seed !== undefined) {
        const effectivePos = Math.max(predictedPosition, actualPosition);
        const bonus = Math.max(0, seed - effectivePos);
        upsetBonusPoints += bonus * settings.upsetBonusPerPlace;
      }
    }

    // Award the advancementCorrectBonus only when EVERY advance call has
    // resolved AND every one was right. If any call is pending (3rd-place
    // advancement unresolved), defer the bonus rather than failing it —
    // it'll pay out once the partial-scoring path sees the locked advancing
    // set on a subsequent run.
    const advancementBonus = (!anyAdvancePending && allAdvanceCorrect)
      ? settings.advancementCorrectBonus
      : 0;
    const perfectBonus = allPositionsCorrect ? settings.perfectOrderBonus : 0;

    const groupTotal = advanceCorrectPoints + exactPositionPoints + upsetBonusPoints + advancementBonus + perfectBonus;

    perGroup.push({
      groupName: result.groupName,
      total: groupTotal,
      advanceCorrectPoints,
      exactPositionPoints,
      upsetBonusPoints,
      advancementCorrectBonus: advancementBonus,
      perfectOrderBonus: perfectBonus,
    });
  }

  return {
    total: perGroup.reduce((sum, g) => sum + g.total, 0),
    perGroup,
  };
}

export interface KnockoutRoundDetail {
  round: string;
  basePoints: number;
  upsetBonusPoints: number;
  total: number;
}

export interface KnockoutScoreResult {
  total: number;
  perRound: KnockoutRoundDetail[];
  championBonus: number;
}

function getMatchRoundIndex(matchup: KnockoutMatchup): number {
  return matchup.round;
}

export function scoreKnockout(
  picks: Record<string, string>,
  results: KnockoutResults,
  matchups: KnockoutMatchup[],
  bracketData: BracketData,
  settings: KnockoutScoringSettings = DEFAULT_SCORING.knockout,
): KnockoutScoreResult {
  const roundDetails: Map<number, { basePoints: number; upsetBonusPoints: number }> = new Map();

  for (let i = 0; i < KNOCKOUT_ROUNDS.length; i++) {
    roundDetails.set(i, { basePoints: 0, upsetBonusPoints: 0 });
  }

  // Propagate ACTUAL winners forward so R16+ matchup.teamA/teamB are the
  // real teams that advanced. Without this, the raw knockoutBracket only
  // has R32 teams populated (round 0), and every R16+ upset-bonus lookup
  // fell through null to zero — silently underscoring every downstream
  // upset bonus. Only affects the upset lookup; base points still keyed
  // on matchup.id/round which are already correct.
  const effective = computeEffectiveMatchups(matchups, results);
  const effectiveById = new Map(effective.map((m) => [m.id, m]));

  for (const matchup of matchups) {
    const actualWinner = results[matchup.id];
    if (!actualWinner) continue;

    const userPick = picks[matchup.id];
    if (userPick !== actualWinner) continue;

    const roundIdx = getMatchRoundIndex(matchup);
    const detail = roundDetails.get(roundIdx);
    if (!detail) continue;

    // Base points
    detail.basePoints += settings.pointsPerRound[roundIdx] ?? 0;

    // Upset bonus — use the effective matchup which has teams populated
    // for R16+ via winner propagation.
    const eff = effectiveById.get(matchup.id) ?? matchup;
    const loser = eff.teamA === actualWinner ? eff.teamB : eff.teamA;
    if (loser) {
      const winnerRank = getTeamRanking(bracketData, actualWinner);
      const loserRank = getTeamRanking(bracketData, loser);
      if (winnerRank !== undefined && loserRank !== undefined) {
        const rankDiff = winnerRank - loserRank;
        if (rankDiff > 0) {
          const multiplier = settings.upsetMultiplierPerRound[roundIdx] ?? 0;
          detail.upsetBonusPoints += Math.floor(rankDiff / settings.upsetModulus) * multiplier;
        }
      }
    }
  }

  // Champion bonus: check if user picked the Final winner correctly
  let championBonus = 0;
  const finalMatchup = matchups.find((m) => m.round === 5);
  if (finalMatchup) {
    const actualChampion = results[finalMatchup.id];
    if (actualChampion && picks[finalMatchup.id] === actualChampion) {
      championBonus = settings.championBonus;
    }
  }

  const perRound: KnockoutRoundDetail[] = [];
  for (let i = 0; i < KNOCKOUT_ROUNDS.length; i++) {
    const detail = roundDetails.get(i)!;
    perRound.push({
      round: KNOCKOUT_ROUNDS[i],
      basePoints: detail.basePoints,
      upsetBonusPoints: detail.upsetBonusPoints,
      total: detail.basePoints + detail.upsetBonusPoints,
    });
  }

  const roundTotal = perRound.reduce((sum, r) => sum + r.total, 0);

  return {
    total: roundTotal + championBonus,
    perRound,
    championBonus,
  };
}

export interface TotalPredictionScore {
  groupStageScore: number;
  knockoutScore: number;
  totalScore: number;
  groupStageDetail: GroupStageScoreResult;
  knockoutDetail: KnockoutScoreResult | null;
}

export function scoreTotalPrediction(
  groupPredictions: GroupPrediction[],
  thirdPlacePicks: string[],
  knockoutPicks: Record<string, string>,
  groupStageResults: GroupStageResults | undefined,
  knockoutResults: KnockoutResults | undefined,
  knockoutMatchups: KnockoutMatchup[] | undefined,
  bracketData: BracketData,
  settings: ScoringSettings = DEFAULT_SCORING,
): TotalPredictionScore {
  const groupStageDetail = groupStageResults
    ? scoreGroupStage(groupPredictions, thirdPlacePicks, groupStageResults, bracketData, settings.groupStage)
    : { total: 0, perGroup: [] };

  let knockoutDetail: KnockoutScoreResult | null = null;
  if (knockoutResults && knockoutMatchups) {
    knockoutDetail = scoreKnockout(knockoutPicks, knockoutResults, knockoutMatchups, bracketData, settings.knockout);
  }

  return {
    groupStageScore: groupStageDetail.total,
    knockoutScore: knockoutDetail?.total ?? 0,
    totalScore: groupStageDetail.total + (knockoutDetail?.total ?? 0),
    groupStageDetail,
    knockoutDetail,
  };
}
