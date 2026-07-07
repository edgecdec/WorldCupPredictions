import { useEffect, useRef, useState, useCallback } from 'react';
import { PELE_RATINGS, AVG_GA } from '@/lib/peleRatings';
import { THIRD_PLACE_LOOKUP } from '@/lib/thirdPlaceLookup';
import { KNOCKOUT_HOST } from '@/lib/matchVenues';
import { stableActualResultsKey } from '@/lib/simInputKey';
import { WORLD_CUP_2026_DATA, getTeamSeeds, getTeamRankings } from '@/lib/bracketData';
import type { ScoringSettings, GroupPrediction } from '@/types';
import { DEFAULT_SCORING } from '@/types';

// Team maps derived from the bracket data — single source of truth so
// TEAM_SEEDS / FIFA_RANKINGS can't drift from the tournament definition
// (that drift is what previously caused the ±1 discrepancies between
// actual and expected scoring for Czechia/Tunisia/Algeria/Austria/Panama).
// Note: server-side scoring reads directly from bracketData via getTeamSeed
// / getTeamRanking, so as long as these derive from the same source we're
// guaranteed to match.
const FIFA_RANKINGS: Record<string, number> = getTeamRankings(WORLD_CUP_2026_DATA);
const TEAM_SEEDS: Record<string, number> = getTeamSeeds(WORLD_CUP_2026_DATA);

const GROUPS: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const g of WORLD_CUP_2026_DATA.groups) {
    out[g.name] = g.teams.map((t) => t.name);
  }
  return out;
})();

export { GROUPS };

export interface GroupPositionResult {
  team: string;
  pos: number[];
  advance: number;
}

export interface BracketSlotResult {
  slotId: string;
  round: string;
  teams: Array<{ team: string; count: number }>;
}

export interface PlayerScoreResult {
  key: string;
  avgScore: number;
  avgRank: number;
  winPct: number;
  scoreDistribution: Record<number, number>;
  avgGroupScores: Record<string, number>;
  avgRoundScores: Record<string, number>;
  groupScoreDistributions: Record<string, Record<number, number>>;
  roundScoreDistributions: Record<string, Record<number, number>>;
  /** Per-scope rank/win/distribution stats — for the Expected Standings
   *  scope dropdown so users can see the table re-ranked by group-only
   *  or knockout-only score. */
  avgGroupTotal: number;
  avgGroupRank: number;
  groupWinPct: number;
  groupTotalDistribution: Record<number, number>;
  avgKoTotal: number;
  avgKoRank: number;
  koWinPct: number;
  koTotalDistribution: Record<number, number>;
}

export interface TournamentSimResults {
  groupResults: Record<string, GroupPositionResult[]>;
  bracketSlots: BracketSlotResult[];
  championProbs: Array<{ team: string; pct: number }>;
  advanceProbs: Array<{ team: string; pct: number }>;
  playerScores?: PlayerScoreResult[];
  /** matchId → outcome → userKey → expected total score given that outcome.
   *  matchId examples: 'group:A:Mexico-South Africa', 'ko:R32-1', 'ko:FINAL'.
   *  group outcomes: 'W' | 'D' | 'L' | exact like '1-0'.
   *  ko outcomes: winning team name. */
  conditionalScores?: Record<string, Record<string, Record<string, number>>>;
}

export interface PlayerEntry {
  key: string;
  group_predictions: GroupPrediction[];
  third_place_picks: string[];
  knockout_picks: Record<string, string>;
}

export interface ActualMatch {
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
}

export interface InProgressGroupMatch {
  teamA: string;
  teamB: string;
  /** Pre-sampled final scorelines from the live model — the worker draws one
   *  per simulation iteration to capture the joint distribution. */
  sampledScores: Array<[number, number]>;
  /** Optional: the live score + parsed minute the samples were drawn from.
   *  The worker ignores these; they exist so the dedupe key in hooks can
   *  detect "real" state changes (a goal, the clock advancing) without being
   *  fooled by random resampling on every parent recompute. */
  currentScoreA?: number;
  currentScoreB?: number;
  minutesPlayed?: number;
}

export interface InProgressKnockoutMatch {
  teamA: string;
  teamB: string;
  /** Pre-sampled winners from the live model — already incorporates current
   *  scoreline, minutes remaining, and ET/pens resolution. The worker draws
   *  one per sim iteration to preserve joint distribution with downstream
   *  rounds. */
  sampledWinners: string[];
  /** Identity fields for dedupe — exclude from worker payload concerns. */
  currentScoreA?: number;
  currentScoreB?: number;
  minutesPlayed?: number;
}

export interface ActualResults {
  /** Completed group stage matches keyed by group name. */
  groupMatches?: Record<string, ActualMatch[]>;
  /** In-progress group matches keyed by group name. */
  inProgressGroupMatches?: Record<string, InProgressGroupMatch[]>;
  /** In-progress knockout matches — flat list, lookup is by team pair in
   *  the worker. */
  inProgressKnockoutMatches?: InProgressKnockoutMatch[];
  /**
   * Final group stage standings (when the group stage is complete and locked).
   * If set, the simulation uses these orders directly instead of simulating
   * the group stage. Format: { groupName: [1st, 2nd, 3rd, 4th] }
   */
  finalGroupStandings?: Record<string, string[]>;
  /** The 8 advancing 3rd-place teams (when group stage is complete). */
  finalAdvancing3rd?: string[];
  /** Completed knockout match winners keyed by match ID (e.g. 'R32-1', 'FINAL', '3RD'). */
  knockoutWinners?: Record<string, string>;
}

const NUM_SIMS = 10000;

export function useTournamentSim(
  players?: PlayerEntry[],
  scoringSettings?: ScoringSettings,
  actualResults?: ActualResults,
  opts?: {
    /** True once lock_time_knockout has passed — knockout picks should now
     *  count toward projected scores. False (default) means pre-lock: the
     *  worker scores group-stage only per player so Exp Pts isn't inflated
     *  by knockout picks the user can still change. */
    scoreKnockoutPicks?: boolean;
  },
) {
  const workerRef = useRef<Worker | null>(null);
  const [results, setResults] = useState<TournamentSimResults | null>(null);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  // simsCompleted = the sim count the current `results` are computed against.
  // Counts/percentages need to divide by this, not NUM_SIMS, while partials
  // are streaming in. Falls back to NUM_SIMS once 'done' fires.
  const [simsCompleted, setSimsCompleted] = useState(0);

  const run = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
    }

    setRunning(true);
    setProgress(0);
    // Don't blank prior results — keep the previous expected scores visible
    // until the new run produces its first partial. Blanking causes every row
    // to fall back to its locked total (often 0) and the sort collapses
    // everyone to the bottom for a beat, jolting the leaderboard.

    const worker = new Worker(
      new URL('../lib/tournamentSimWorker.ts', import.meta.url),
    );
    workerRef.current = worker;

    worker.onmessage = (e) => {
      if (e.data.type === 'progress') {
        setProgress(e.data.progress);
      } else if (e.data.type === 'partial') {
        // Render with partial results (e.g. 1000-sim snapshot) so the UI can
        // show numbers fast. The worker keeps running and will follow up with
        // refined results at later checkpoints, ending with 'done'.
        setResults(e.data.results);
        if (typeof e.data.simsCompleted === 'number') setSimsCompleted(e.data.simsCompleted);
      } else if (e.data.type === 'done') {
        setResults(e.data.results);
        setSimsCompleted(e.data.simsCompleted ?? NUM_SIMS);
        setRunning(false);
        worker.terminate();
        workerRef.current = null;
      }
    };

    worker.postMessage({
      type: 'run',
      ratings: PELE_RATINGS,
      avgGA: AVG_GA,
      groups: GROUPS,
      numSims: NUM_SIMS,
      entries: players,
      scoring: scoringSettings ?? DEFAULT_SCORING,
      teamSeeds: TEAM_SEEDS,
      teamRankings: FIFA_RANKINGS,
      thirdPlaceLookup: THIRD_PLACE_LOOKUP,
      knockoutHosts: KNOCKOUT_HOST,
      actualGroupMatches: actualResults?.groupMatches,
      inProgressGroupMatches: actualResults?.inProgressGroupMatches,
      finalGroupStandings: actualResults?.finalGroupStandings,
      finalAdvancing3rd: actualResults?.finalAdvancing3rd,
      actualKnockoutResults: actualResults?.knockoutWinners,
      inProgressKnockoutMatches: actualResults?.inProgressKnockoutMatches,
      scoreKnockoutPicks: opts?.scoreKnockoutPicks ?? false,
    });
  }, [players, scoringSettings, actualResults, opts?.scoreKnockoutPicks]);

  // Dedupe relaunches on the *meaningful* state of the inputs.
  // Two reasons:
  //   1. liveScores polling produces a new actualResults reference every
  //      30s; without dedupe the worker restarts every 30s and never
  //      finishes (the cleanup terminates it mid-warmup).
  //   2. inProgressGroupMatches[*].sampledScores is freshly drawn via
  //      Math.random() on every actualResults recompute. A naive
  //      JSON.stringify of actualResults would differ on every render,
  //      causing the worker to restart whenever the page re-renders for
  //      ANY reason. End result: mid-game forecasts never produce output
  //      and the page falls back to pre-game percentages.
  // We strip sampledScores and rely on the live game's identity + score
  // + minute (which DO change meaningfully) to drive reruns.
  const inputKey = JSON.stringify({
    players, scoringSettings,
    // Strip sampledScores so a fresh random draw doesn't fire spurious
    // worker restarts every render. See stableActualResultsKey for detail.
    actualResults: stableActualResultsKey(actualResults),
    scoreKnockoutPicks: opts?.scoreKnockoutPicks ?? false,
  });
  useEffect(() => {
    run();
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputKey]);

  return { results, progress, running, numSims: NUM_SIMS, simsCompleted, rerun: run };
}
