import {
  GroupPrediction,
  GroupStageResults,
  KnockoutResults,
  KnockoutMatchup,
} from '@/types';

const CONTRARIAN_THRESHOLD = 0.1;

interface ParsedPrediction {
  group_predictions: GroupPrediction[];
  third_place_picks: string[];
  knockout_picks: Record<string, string>;
}

export interface Indicators {
  perfectGroups: number;
  hotStreak: number;
  contrarianPicks: number;
}

export function calculatePerfectGroups(
  predictions: GroupPrediction[],
  results: GroupStageResults,
): number {
  let count = 0;
  for (const result of results.groupResults) {
    const pred = predictions.find((p) => p.groupName === result.groupName);
    if (!pred) continue;
    if (
      pred.order[0] === result.order[0] &&
      pred.order[1] === result.order[1] &&
      pred.order[2] === result.order[2] &&
      pred.order[3] === result.order[3]
    ) {
      count++;
    }
  }
  return count;
}

export function calculateHotStreak(
  picks: Record<string, string>,
  results: KnockoutResults,
  matchups: KnockoutMatchup[],
): number {
  // Sort matchups by round, then by ID for consistent ordering
  const sorted = [...matchups]
    .filter((m) => results[m.id] !== undefined)
    .sort((a, b) => {
      if (a.round !== b.round) return a.round - b.round;
      return a.id.localeCompare(b.id);
    });

  let maxStreak = 0;
  let current = 0;
  for (const m of sorted) {
    if (picks[m.id] === results[m.id]) {
      current++;
      maxStreak = Math.max(maxStreak, current);
    } else {
      current = 0;
    }
  }
  return maxStreak;
}

/**
 * Count contrarian picks that hit — predictions made by <10% of the group that turned out correct.
 * Group stage: predicting a team in a specific position that <10% also predicted.
 * Knockout: predicting a specific match winner that <10% also predicted.
 */
export function calculateContrarianPicks(
  prediction: ParsedPrediction,
  allPredictions: ParsedPrediction[],
  groupStageResults: GroupStageResults | undefined,
  knockoutResults: KnockoutResults | undefined,
  knockoutMatchups: KnockoutMatchup[] | undefined,
): number {
  const total = allPredictions.length;
  if (total === 0) return 0;
  let contrarianCount = 0;

  // Group stage contrarian picks
  if (groupStageResults) {
    for (const result of groupStageResults.groupResults) {
      const myPred = prediction.group_predictions.find((p) => p.groupName === result.groupName);
      if (!myPred) continue;

      for (let pos = 0; pos < 4; pos++) {
        const team = result.order[pos];
        const myPredPos = myPred.order.indexOf(team);
        if (myPredPos !== pos) continue; // user didn't get this right

        // Count how many others predicted this team in this position
        let sameCount = 0;
        for (const other of allPredictions) {
          const otherPred = other.group_predictions.find((p) => p.groupName === result.groupName);
          if (otherPred && otherPred.order[pos] === team) sameCount++;
        }
        if (sameCount / total < CONTRARIAN_THRESHOLD) contrarianCount++;
      }
    }
  }

  // Knockout contrarian picks
  if (knockoutResults && knockoutMatchups) {
    for (const matchup of knockoutMatchups) {
      const actualWinner = knockoutResults[matchup.id];
      if (!actualWinner) continue;
      if (prediction.knockout_picks[matchup.id] !== actualWinner) continue;

      let sameCount = 0;
      for (const other of allPredictions) {
        if (other.knockout_picks[matchup.id] === actualWinner) sameCount++;
      }
      if (sameCount / total < CONTRARIAN_THRESHOLD) contrarianCount++;
    }
  }

  return contrarianCount;
}

export function calculateIndicators(
  prediction: ParsedPrediction,
  allPredictions: ParsedPrediction[],
  groupStageResults: GroupStageResults | undefined,
  knockoutResults: KnockoutResults | undefined,
  knockoutMatchups: KnockoutMatchup[] | undefined,
): Indicators {
  const perfectGroups = groupStageResults
    ? calculatePerfectGroups(prediction.group_predictions, groupStageResults)
    : 0;

  const hotStreak = knockoutResults && knockoutMatchups
    ? calculateHotStreak(prediction.knockout_picks, knockoutResults, knockoutMatchups)
    : 0;

  const contrarianPicks = calculateContrarianPicks(
    prediction, allPredictions, groupStageResults, knockoutResults, knockoutMatchups,
  );

  return { perfectGroups, hotStreak, contrarianPicks };
}
