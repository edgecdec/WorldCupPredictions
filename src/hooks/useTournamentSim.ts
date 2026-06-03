import { useEffect, useRef, useState, useCallback } from 'react';
import { PELE_RATINGS, AVG_GA } from '@/lib/peleRatings';
import { THIRD_PLACE_LOOKUP } from '@/lib/thirdPlaceLookup';
import { KNOCKOUT_HOST } from '@/lib/matchVenues';
import type { ScoringSettings, GroupPrediction } from '@/types';
import { DEFAULT_SCORING } from '@/types';

const FIFA_RANKINGS: Record<string, number> = {
  Spain: 1, Argentina: 2, France: 3, England: 4, Brazil: 5, Portugal: 6,
  Netherlands: 7, Belgium: 8, Germany: 9, Croatia: 10, Morocco: 11,
  Colombia: 13, USA: 14, Mexico: 15, Uruguay: 16, Switzerland: 17,
  Japan: 18, Senegal: 19, Iran: 20, 'South Korea': 22, Ecuador: 23,
  Austria: 24, Turkiye: 25, Australia: 26, Canada: 27, Norway: 29,
  Panama: 30, Paraguay: 39, Egypt: 34, Algeria: 35, Scotland: 36,
  Tunisia: 40, 'Ivory Coast': 42, Sweden: 43, Czechia: 44,
  Uzbekistan: 50, Qatar: 51, 'DR Congo': 56, Iraq: 58,
  'Saudi Arabia': 60, 'South Africa': 61, Jordan: 66,
  'Cape Verde': 68, 'Bosnia and Herzegovina': 71, Ghana: 72,
  Curacao: 82, Haiti: 84, 'New Zealand': 86,
};

const GROUPS: Record<string, string[]> = {
  A: ['Mexico', 'South Africa', 'South Korea', 'Czechia'],
  B: ['Canada', 'Bosnia and Herzegovina', 'Qatar', 'Switzerland'],
  C: ['Brazil', 'Morocco', 'Haiti', 'Scotland'],
  D: ['USA', 'Paraguay', 'Australia', 'Turkiye'],
  E: ['Germany', 'Curacao', 'Ivory Coast', 'Ecuador'],
  F: ['Netherlands', 'Japan', 'Sweden', 'Tunisia'],
  G: ['Belgium', 'Egypt', 'Iran', 'New Zealand'],
  H: ['Spain', 'Cape Verde', 'Saudi Arabia', 'Uruguay'],
  I: ['France', 'Senegal', 'Norway', 'Iraq'],
  J: ['Argentina', 'Algeria', 'Austria', 'Jordan'],
  K: ['Portugal', 'DR Congo', 'Uzbekistan', 'Colombia'],
  L: ['England', 'Croatia', 'Ghana', 'Panama'],
};

export { GROUPS };

// Pot/seed for all 48 teams (used for group stage upset bonus)
const TEAM_SEEDS: Record<string, number> = {
  Spain: 1, Argentina: 1, France: 1, England: 1, Brazil: 1, Portugal: 1,
  Netherlands: 1, Belgium: 1, Germany: 1, USA: 1, Mexico: 1, Canada: 1,
  Croatia: 2, Morocco: 2, Colombia: 2, Uruguay: 2, Switzerland: 2,
  Japan: 2, Senegal: 2, Ecuador: 2, Austria: 2, Australia: 2, 'South Korea': 2, Egypt: 2,
  Norway: 3, Panama: 3, Scotland: 3, Paraguay: 3, Tunisia: 3, 'Ivory Coast': 3,
  Uzbekistan: 3, Qatar: 3, 'Saudi Arabia': 3, Algeria: 3, Iran: 3, Ghana: 3, Sweden: 3,
  Jordan: 4, 'Cape Verde': 4, 'Bosnia and Herzegovina': 4, Turkiye: 4, Curacao: 4,
  Haiti: 4, 'New Zealand': 4, Iraq: 4, 'South Africa': 4, 'DR Congo': 4,
};

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
}

export interface TournamentSimResults {
  groupResults: Record<string, GroupPositionResult[]>;
  bracketSlots: BracketSlotResult[];
  championProbs: Array<{ team: string; pct: number }>;
  advanceProbs: Array<{ team: string; pct: number }>;
  playerScores?: PlayerScoreResult[];
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

export interface ActualResults {
  /** Completed group stage matches keyed by group name. */
  groupMatches?: Record<string, ActualMatch[]>;
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
) {
  const workerRef = useRef<Worker | null>(null);
  const [results, setResults] = useState<TournamentSimResults | null>(null);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);

  const run = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
    }

    setRunning(true);
    setProgress(0);
    setResults(null);

    const worker = new Worker(
      new URL('../lib/tournamentSimWorker.ts', import.meta.url),
    );
    workerRef.current = worker;

    worker.onmessage = (e) => {
      if (e.data.type === 'progress') {
        setProgress(e.data.progress);
      } else if (e.data.type === 'done') {
        setResults(e.data.results);
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
      finalGroupStandings: actualResults?.finalGroupStandings,
      finalAdvancing3rd: actualResults?.finalAdvancing3rd,
      actualKnockoutResults: actualResults?.knockoutWinners,
    });
  }, [players, scoringSettings, actualResults]);

  useEffect(() => {
    run();
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [run]);

  return { results, progress, running, numSims: NUM_SIMS, rerun: run };
}
