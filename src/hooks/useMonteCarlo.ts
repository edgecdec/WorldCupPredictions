import { useEffect, useRef, useState, useCallback } from 'react';
import type { KnockoutMatchup, BracketData, KnockoutScoringSettings } from '@/types';

export interface MCResult {
  key: string;
  avgScore: number;
  avgPlace: number;
  winPct: number;
}

interface MCEntry {
  key: string;
  picks: Record<string, string>;
}

export function useMonteCarlo(
  entries: MCEntry[],
  results: Record<string, string>,
  hypo: Record<string, string>,
  matchups: KnockoutMatchup[],
  bracketData: BracketData | null,
  scoring: KnockoutScoringSettings | undefined,
) {
  const [mcResults, setMcResults] = useState<MCResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(() => {
    if (!entries.length || !matchups.length || !bracketData || !scoring) return;
    workerRef.current?.terminate();
    setRunning(true);
    setProgress(0);

    // Build team rankings lookup
    const teamRankings: Record<string, number> = {};
    for (const group of bracketData.groups) {
      for (const team of group.teams) {
        teamRankings[team.name] = team.fifaRanking;
      }
    }

    const worker = new Worker(new URL('../lib/monteCarloWorker.ts', import.meta.url));
    workerRef.current = worker;
    worker.onmessage = (e) => {
      if (e.data.results) setMcResults(e.data.results);
      setProgress(e.data.progress ?? 0);
      if (e.data.type === 'done') setRunning(false);
    };
    worker.postMessage({
      entries: entries.map((e) => ({ key: e.key, picks: e.picks })),
      results,
      hypo,
      matchups: matchups.map((m) => ({ id: m.id, round: m.round, teamA: m.teamA, teamB: m.teamB })),
      teamRankings,
      scoring,
      totalSims: 1000,
    });
  }, [entries, results, hypo, matchups, bracketData, scoring]);

  // Debounce 500ms on hypo changes
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(run, 500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [run]);

  useEffect(() => () => workerRef.current?.terminate(), []);

  return { mcResults, progress, running };
}
