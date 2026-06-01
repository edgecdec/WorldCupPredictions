import { useEffect, useRef, useState, useCallback } from 'react';
import { PELE_RATINGS, AVG_GA } from '@/lib/peleRatings';

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

export interface TournamentSimResults {
  groupResults: Record<string, GroupPositionResult[]>;
  bracketSlots: BracketSlotResult[];
  championProbs: Array<{ team: string; pct: number }>;
  advanceProbs: Array<{ team: string; pct: number }>;
}

const NUM_SIMS = 10000;

export function useTournamentSim() {
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
    });
  }, []);

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
