'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { PELE_RATINGS, AVG_GA } from '@/lib/peleRatings';
import { THIRD_PLACE_LOOKUP } from '@/lib/thirdPlaceLookup';
import { GROUPS, type ActualResults } from '@/hooks/useTournamentSim';

const NUM_SIMS = 10000;

export interface GroupOnlySimResults {
  /** Per R32 slot side ('R32-1-A' / 'R32-1-B' / ...) → team → fraction (0..1). */
  r32SlotDistributions: Record<string, Record<string, number>>;
}

/**
 * Run a fast "group stage only" Monte Carlo: respects completed +
 * in-progress matches, simulates the remaining group games, deterministically
 * maps each iteration's standings to the 32 R32 slot teams via FIFA seeding,
 * and reports per-slot team probability distributions.
 *
 * Does NOT simulate knockout matches — for the knockout picker, we only need
 * who's likely to BE in each R32 slot, not who wins downstream games.
 *
 * Emits partial results every 1000 sims like useTournamentSim so the UI can
 * render fast and refine.
 */
export function useGroupOnlySim(actualResults?: ActualResults) {
  const workerRef = useRef<Worker | null>(null);
  const [results, setResults] = useState<GroupOnlySimResults | null>(null);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [simsCompleted, setSimsCompleted] = useState(0);

  const run = useCallback(() => {
    if (workerRef.current) workerRef.current.terminate();
    setRunning(true);
    setProgress(0);

    const worker = new Worker(
      new URL('../lib/tournamentSimWorker.ts', import.meta.url),
    );
    workerRef.current = worker;

    worker.onmessage = (e) => {
      if (e.data.type === 'progress') {
        setProgress(e.data.progress);
      } else if (e.data.type === 'partial') {
        if (e.data.groupOnlyResults) setResults(e.data.groupOnlyResults);
        if (typeof e.data.simsCompleted === 'number') setSimsCompleted(e.data.simsCompleted);
      } else if (e.data.type === 'done') {
        if (e.data.groupOnlyResults) setResults(e.data.groupOnlyResults);
        setSimsCompleted(e.data.simsCompleted ?? NUM_SIMS);
        setRunning(false);
        worker.terminate();
        workerRef.current = null;
      }
    };

    worker.postMessage({
      type: 'run',
      mode: 'groupOnly',
      ratings: PELE_RATINGS,
      avgGA: AVG_GA,
      groups: GROUPS,
      numSims: NUM_SIMS,
      thirdPlaceLookup: THIRD_PLACE_LOOKUP,
      actualGroupMatches: actualResults?.groupMatches,
      inProgressGroupMatches: actualResults?.inProgressGroupMatches,
      finalGroupStandings: actualResults?.finalGroupStandings,
      finalAdvancing3rd: actualResults?.finalAdvancing3rd,
    });
  }, [actualResults]);

  // actualResults gets a new object reference on every useLiveScores poll
  // (30s) even when the underlying payload didn't change. Re-running the
  // worker on every poll wastes ~1s of CPU and — more importantly — kills
  // the in-flight worker mid-run, which can leave the bracket empty if the
  // poll fires before the worker emits its first partial.
  //
  // Dedupe by deep-equality (JSON.stringify) of the inputs that actually
  // matter, NOT by `actualResults` reference. Trigger the effect on the
  // stable key; the effect body then kicks off run() and the cleanup
  // terminates the worker on unmount. This avoids the prior bug where the
  // cleanup ran when actualResults's reference changed (terminating the
  // worker) but the early-return then skipped registering a new cleanup,
  // and skipped re-running run().
  const inputKey = JSON.stringify({ actualResults });
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
