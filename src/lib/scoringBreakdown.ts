import {
  UserPrediction, GroupStageResults, KnockoutResults, KnockoutMatchup,
  BracketData, GroupStageScoringSettings, KnockoutScoringSettings,
} from '@/types';
import { getTeamSeed, getTeamRanking } from '@/lib/bracketData';

export interface GroupTeamDetail {
  groupName: string;
  teamName: string;
  predictedPosition: number;
  actualPosition: number;
  advanceCorrect: boolean;
  advanceCorrectPts: number;
  exactPosition: boolean;
  exactPositionPts: number;
  upsetBonusPts: number;
}

export interface KnockoutMatchDetail {
  matchupId: string;
  round: number;
  teamA: string | null;
  teamB: string | null;
  userPick: string | null;
  winner: string | null;
  correct: boolean;
  basePoints: number;
  upsetBonus: number;
}

function didAdvancePredicted(teamName: string, pos: number, thirdPicks: string[]): boolean {
  if (pos <= 2) return true;
  if (pos === 3) return thirdPicks.includes(teamName);
  return false;
}

function didAdvanceActual(teamName: string, pos: number, advancing: string[]): boolean {
  if (pos <= 2) return true;
  if (pos === 3) return advancing.includes(teamName);
  return false;
}

export function getGroupTeamBreakdown(
  prediction: UserPrediction,
  results: GroupStageResults,
  bracketData: BracketData,
  settings: GroupStageScoringSettings,
): GroupTeamDetail[] {
  const details: GroupTeamDetail[] = [];

  for (const result of results.groupResults) {
    const pred = prediction.group_predictions.find((p) => p.groupName === result.groupName);
    if (!pred) continue;

    for (let i = 0; i < 4; i++) {
      const teamName = result.order[i];
      const actualPos = i + 1;
      const predIdx = pred.order.indexOf(teamName);
      if (predIdx === -1) continue;
      const predPos = predIdx + 1;

      const predAdv = didAdvancePredicted(teamName, predPos, prediction.third_place_picks);
      const actAdv = didAdvanceActual(teamName, actualPos, results.advancingThirdPlace);
      const advCorrect = predAdv === actAdv;
      const exactPos = predPos === actualPos;

      let upsetPts = 0;
      const seed = getTeamSeed(bracketData, teamName);
      if (seed !== undefined && actualPos <= predPos) {
        upsetPts = Math.max(0, seed - predPos) * settings.upsetBonusPerPlace;
      }

      details.push({
        groupName: result.groupName,
        teamName,
        predictedPosition: predPos,
        actualPosition: actualPos,
        advanceCorrect: advCorrect,
        advanceCorrectPts: advCorrect ? settings.advanceCorrect : 0,
        exactPosition: exactPos,
        exactPositionPts: exactPos ? settings.exactPosition : 0,
        upsetBonusPts: upsetPts,
      });
    }
  }

  return details;
}

export function getKnockoutMatchBreakdown(
  prediction: UserPrediction,
  results: KnockoutResults,
  matchups: KnockoutMatchup[],
  bracketData: BracketData,
  settings: KnockoutScoringSettings,
): KnockoutMatchDetail[] {
  return matchups.map((m) => {
    const userPick = prediction.knockout_picks[m.id] ?? null;
    const winner = results[m.id] ?? null;
    const correct = !!winner && userPick === winner;

    let basePoints = 0;
    let upsetBonus = 0;

    if (correct) {
      basePoints = settings.pointsPerRound[m.round] ?? 0;

      const loser = m.teamA === winner ? m.teamB : m.teamA;
      if (loser) {
        const winnerRank = getTeamRanking(bracketData, winner);
        const loserRank = getTeamRanking(bracketData, loser);
        if (winnerRank !== undefined && loserRank !== undefined) {
          const diff = winnerRank - loserRank;
          if (diff > 0) {
            const mult = settings.upsetMultiplierPerRound[m.round] ?? 0;
            upsetBonus = Math.floor(diff / settings.upsetModulus) * mult;
          }
        }
      }
    }

    return {
      matchupId: m.id,
      round: m.round,
      teamA: m.teamA,
      teamB: m.teamB,
      userPick,
      winner,
      correct,
      basePoints,
      upsetBonus,
    };
  });
}
