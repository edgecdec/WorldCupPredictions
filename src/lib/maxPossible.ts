import {
  BracketData,
  GroupPrediction,
  GroupStageScoringSettings,
  KnockoutScoringSettings,
  KnockoutMatchup,
  KnockoutResults,
  GroupStageResults,
  ScoringSettings,
  DEFAULT_SCORING,
  KNOCKOUT_ROUNDS,
} from '@/types';
import { getTeamSeed } from '@/lib/bracketData';

const MATCHES_PER_ROUND = [16, 8, 4, 2, 1, 1];

function maxGroupStagePoints(
  predictions: GroupPrediction[],
  thirdPlacePicks: string[],
  bracketData: BracketData,
  settings: GroupStageScoringSettings,
): number {
  let total = 0;
  for (const pred of predictions) {
    // Best case: all 4 positions exactly correct
    let groupPts = 0;
    for (let i = 0; i < 4; i++) {
      const teamName = pred.order[i];
      groupPts += settings.advanceCorrect;
      groupPts += settings.exactPosition;
      const seed = getTeamSeed(bracketData, teamName);
      if (seed !== undefined) {
        const predictedPos = i + 1;
        groupPts += Math.max(0, seed - predictedPos) * settings.upsetBonusPerPlace;
      }
    }
    groupPts += settings.advancementCorrectBonus;
    groupPts += settings.perfectOrderBonus;
    total += groupPts;
  }
  return total;
}

function maxKnockoutPoints(settings: KnockoutScoringSettings): number {
  let total = 0;
  for (let i = 0; i < KNOCKOUT_ROUNDS.length; i++) {
    total += MATCHES_PER_ROUND[i] * settings.pointsPerRound[i];
  }
  total += settings.championBonus;
  return total;
}

function isPickStillAlive(
  matchupId: string,
  pickedTeam: string,
  results: KnockoutResults,
  matchups: KnockoutMatchup[],
): boolean {
  // Check all resolved matchups that feed into this one.
  // If the picked team has already been eliminated in a prior round, return false.
  // Walk backwards: find the matchup, check if the team could still appear there.
  const matchup = matchups.find((m) => m.id === matchupId);
  if (!matchup) return false;

  // If this matchup already has a result, the pick is "alive" only if it was correct
  if (results[matchupId]) return results[matchupId] === pickedTeam;

  // If teams are set for this matchup, check if picked team is one of them
  if (matchup.teamA && matchup.teamB) {
    return matchup.teamA === pickedTeam || matchup.teamB === pickedTeam;
  }

  // Teams not yet determined — check if the team is still alive in feeder matchups
  // The team is alive if it hasn't been eliminated in any resolved matchup
  return !hasBeenEliminated(pickedTeam, results, matchups);
}

function hasBeenEliminated(
  team: string,
  results: KnockoutResults,
  matchups: KnockoutMatchup[],
): boolean {
  for (const m of matchups) {
    const winner = results[m.id];
    if (!winner) continue;
    // Team was in this matchup and lost
    if ((m.teamA === team || m.teamB === team) && winner !== team) {
      return true;
    }
  }
  return false;
}

export interface MaxPossibleResult {
  maxTotal: number;
  championEliminated: boolean;
}

export function calculateMaxPossible(
  predictions: GroupPrediction[],
  thirdPlacePicks: string[],
  knockoutPicks: Record<string, string>,
  groupStageResults: GroupStageResults | undefined,
  knockoutResults: KnockoutResults | undefined,
  knockoutMatchups: KnockoutMatchup[] | undefined,
  bracketData: BracketData,
  currentGroupScore: number,
  currentKnockoutScore: number,
  settings: ScoringSettings = DEFAULT_SCORING,
): MaxPossibleResult {
  const hasGroupResults = groupStageResults && groupStageResults.groupResults.length > 0;
  const hasKnockout = knockoutResults && knockoutMatchups && knockoutMatchups.length > 0;

  // Champion eliminated check
  const finalMatchup = knockoutMatchups?.find((m) => m.round === 5);
  const championPick = finalMatchup ? knockoutPicks[finalMatchup.id] : undefined;
  const championEliminated = !!(
    championPick &&
    hasKnockout &&
    hasBeenEliminated(championPick, knockoutResults, knockoutMatchups)
  );

  if (!hasGroupResults) {
    // Pre-tournament or group stage in progress: max = theoretical max of everything
    const maxGroup = maxGroupStagePoints(predictions, thirdPlacePicks, bracketData, settings.groupStage);
    const maxKO = maxKnockoutPoints(settings.knockout);
    return { maxTotal: maxGroup + maxKO, championEliminated };
  }

  // Group stage done — group score is locked
  if (!hasKnockout) {
    // Knockout not started yet — max knockout is theoretical max
    const maxKO = maxKnockoutPoints(settings.knockout);
    return { maxTotal: currentGroupScore + maxKO, championEliminated };
  }

  // Knockout in progress — compute remaining possible knockout points
  let remainingKO = 0;
  for (const matchup of knockoutMatchups) {
    if (knockoutResults[matchup.id]) continue; // already resolved, points already counted
    const pick = knockoutPicks[matchup.id];
    if (!pick) continue; // no pick for this matchup
    if (!isPickStillAlive(matchup.id, pick, knockoutResults, knockoutMatchups)) continue;

    const roundIdx = matchup.round;
    remainingKO += settings.knockout.pointsPerRound[roundIdx] ?? 0;
    // Max upset bonus: assume biggest possible upset
    // We can't know the opponent yet for unresolved matchups, so use a generous estimate
    // For simplicity, just add base points (upset bonus is speculative)
  }

  // Champion bonus if champion pick is still alive
  if (championPick && !championEliminated && !knockoutResults[finalMatchup!.id]) {
    remainingKO += settings.knockout.championBonus;
  }

  return {
    maxTotal: currentGroupScore + currentKnockoutScore + remainingKO,
    championEliminated,
  };
}
