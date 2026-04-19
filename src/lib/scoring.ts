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

function didTeamAdvanceActual(
  teamName: string,
  actualPosition: number,
  advancingThirdPlace: string[],
): boolean {
  if (actualPosition <= 2) return true;
  if (actualPosition === 3) return advancingThirdPlace.includes(teamName);
  return false;
}

export function scoreGroupStage(
  predictions: GroupPrediction[],
  thirdPlacePicks: string[],
  results: GroupStageResults,
  bracketData: BracketData,
  settings: GroupStageScoringSettings = DEFAULT_SCORING.groupStage,
): GroupStageScoreResult {
  const perGroup: GroupScoreDetail[] = [];

  for (const result of results.groupResults) {
    const prediction = predictions.find((p) => p.groupName === result.groupName);
    if (!prediction) continue;

    let advanceCorrectPoints = 0;
    let exactPositionPoints = 0;
    let upsetBonusPoints = 0;
    let allAdvanceCorrect = true;
    let allPositionsCorrect = true;

    for (let i = 0; i < 4; i++) {
      const teamName = result.order[i];
      const actualPosition = i + 1;
      const predictedIndex = prediction.order.indexOf(teamName);
      if (predictedIndex === -1) continue;
      const predictedPosition = predictedIndex + 1;

      // Advance correct
      const predictedAdvance = didTeamAdvancePredicted(teamName, predictedPosition, thirdPlacePicks);
      const actualAdvance = didTeamAdvanceActual(teamName, actualPosition, results.advancingThirdPlace);
      if (predictedAdvance === actualAdvance) {
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

      // Upset bonus (prediction-gated, capped at prediction)
      const seed = getTeamSeed(bracketData, teamName);
      if (seed !== undefined && actualPosition <= predictedPosition) {
        const bonus = Math.max(0, seed - predictedPosition);
        upsetBonusPoints += bonus * settings.upsetBonusPerPlace;
      }
    }

    const advancementBonus = allAdvanceCorrect ? settings.advancementCorrectBonus : 0;
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

    // Upset bonus
    const loser = matchup.teamA === actualWinner ? matchup.teamB : matchup.teamA;
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
