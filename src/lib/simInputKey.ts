import type { ActualResults } from '@/hooks/useTournamentSim';

/**
 * Deep-stringify actualResults but elide the random sampledScores arrays
 * on in-progress games.
 *
 * Why: sampledScores is freshly drawn via Math.random() on every
 * actualResults recompute. A naive JSON.stringify(actualResults) therefore
 * differs on every render, which defeats the worker hooks' dedupe and
 * causes the sim worker to restart on every re-render. The cleanup
 * terminates the in-flight worker mid-warmup so it never produces output —
 * mid-game forecasts then silently fall back to pre-game percentages.
 *
 * Identity we DO want to capture: completed matches, each in-progress
 * game's teams + score + parsed minute (those changes actually affect
 * what the sim produces), final group standings if locked, and the
 * advancing 3rd-place teams.
 */
export function stableActualResultsKey(actualResults: ActualResults | undefined): string {
  if (!actualResults) return 'undefined';
  const stripped: Record<string, unknown> = {
    groupMatches: actualResults.groupMatches,
    finalGroupStandings: actualResults.finalGroupStandings,
    finalAdvancing3rd: actualResults.finalAdvancing3rd,
  };
  if (actualResults.inProgressGroupMatches) {
    const m: Record<string, Array<{ teamA: string; teamB: string; scoreA?: number; scoreB?: number; minute?: number }>> = {};
    for (const [g, games] of Object.entries(actualResults.inProgressGroupMatches)) {
      m[g] = games.map((x) => ({
        teamA: x.teamA, teamB: x.teamB,
        scoreA: x.currentScoreA, scoreB: x.currentScoreB, minute: x.minutesPlayed,
      }));
    }
    stripped.inProgressGames = m;
  }
  return JSON.stringify(stripped);
}
