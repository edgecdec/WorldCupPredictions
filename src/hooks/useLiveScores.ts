'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { LiveGame } from '@/types';

const POLL_INTERVAL_MS = 30_000;

interface UseLiveScoresResult {
  games: LiveGame[];
  loading: boolean;
}

export function useLiveScores(enabled: boolean): UseLiveScoresResult {
  const [games, setGames] = useState<LiveGame[]>([]);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchScores = useCallback(async () => {
    try {
      const res = await fetch('/api/scores');
      if (!res.ok) { setGames([]); return; }
      const data = await res.json();
      setGames(data.games ?? []);
    } catch {
      setGames([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    fetchScores();
    timerRef.current = setInterval(fetchScores, POLL_INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [enabled, fetchScores]);

  return { games, loading };
}
