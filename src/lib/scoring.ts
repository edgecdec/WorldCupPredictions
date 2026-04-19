import {
  GroupPrediction,
  GroupStageResults,
  GroupStageScoringSettings,
  BracketData,
  DEFAULT_SCORING,
  ScoringSettings,
} from '@/types';
import { getTeamSeed } from '@/lib/bracketData';

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
