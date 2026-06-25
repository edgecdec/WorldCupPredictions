'use client';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { PELE_RATINGS, AVG_GA } from '@/lib/peleRatings';
import { THIRD_PLACE_LOOKUP } from '@/lib/thirdPlaceLookup';
import { GROUPS, type ActualResults } from '@/hooks/useTournamentSim';
import { stableActualResultsKey } from '@/lib/simInputKey';

const NUM_SIMS = 10000;

export interface GroupOnlySimResults {
  /** Per R32 slot side ('R32-1-A' / 'R32-1-B' / ...) → team → fraction (0..1). */
  r32SlotDistributions: Record<string, Record<string, number>>;
  /** team → P(team advances | team finished 3rd in their group). 1.0 = clinched
   *  to advance (if 3rd); 0.0 = clinched-out. See worker docs for detail. */
  thirdAdvanceProb: Record<string, number>;
  /** team → number of sims where the team actually finished 3rd in their group. */
  thirdFinishCounts: Record<string, number>;
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

  // Dedupe worker runs by a key that captures the *meaningful* state of
  // the inputs — NOT the raw object identity. Two reasons:
  //   1. actualResults gets a new reference on every useLiveScores poll
  //      (30s) even when the payload didn't change. Without dedupe the
  //      worker restarts every 30s and never finishes (the cleanup
  //      terminates it mid-warmup).
  //   2. inProgressGroupMatches[*].sampledScores are freshly drawn via
  //      Math.random() each time actualResults is recomputed, so a naive
  //      JSON.stringify(actualResults) would always differ — same root
  //      cause as bug 1 but for the live-game samples specifically.
  //      Without this strip, mid-game forecasts would silently fall back
  //      to pre-game percentages because the worker never finishes.
  // Strip sampledScores and instead key on each in-progress game's
  // identity + current scoreline + parsed-minute. That captures every
  // change that actually affects the sim output.
  const inputKey = useMemo(() => stableActualResultsKey(actualResults), [actualResults]);
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
