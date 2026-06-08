'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { LiveGame } from '@/types';

const POLL_INTERVAL_MS = 30_000;

interface UseLiveScoresResult {
  games: LiveGame[];
  loading: boolean;
}

/** Format Date as ESPN's YYYYMMDD param (UTC). */
function toEspnDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * Fetch ESPN scores. When a date is given, fetches that specific day; otherwise
 * fetches the current scoreboard (today/live). Polls every 30s.
 */
export function useLiveScores(enabled: boolean, date?: Date): UseLiveScoresResult {
  const [games, setGames] = useState<LiveGame[]>([]);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dateParam = date ? toEspnDate(date) : null;

  const fetchScores = useCallback(async () => {
    try {
      const url = dateParam ? `/api/scores?date=${dateParam}` : '/api/scores';
      const res = await fetch(url);
      if (!res.ok) { setGames([]); return; }
      const data = await res.json();
      setGames(data.games ?? []);
    } catch {
      setGames([]);
    } finally {
      setLoading(false);
    }
  }, [dateParam]);

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    setLoading(true);
    fetchScores();
    timerRef.current = setInterval(fetchScores, POLL_INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [enabled, fetchScores]);

  return { games, loading };
}
