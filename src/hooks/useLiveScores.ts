'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { LiveGame } from '@/types';

const POLL_INTERVAL_MS = 30_000;

interface UseLiveScoresResult {
  games: LiveGame[];
  loading: boolean;
}

/**
 * Format a Date as ESPN's YYYYMMDD param using the **Pacific time** day. Most
 * users are US-based so a "matchday" should follow PT — e.g. a 9pm PT game
 * (which is 4am UTC the next day) belongs to today's PT date, not tomorrow's
 * UTC date. en-CA gives us ISO-style YYYY-MM-DD which we strip dashes from.
 */
function toEspnDate(d: Date): string {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
  return ymd.replace(/-/g, '');
}

/**
 * Anchor for "today" in Pacific time, as a Date pointing at noon UTC on the
 * PT calendar day. Noon UTC is a DST-safe anchor — it resolves to the same PT
 * date regardless of whether PT is currently UTC-7 (PDT, summer) or UTC-8
 * (PST, winter). Day-by-day pickers add/subtract 24h from this anchor.
 */
export function todayInPacific(): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return new Date(`${ymd}T12:00:00Z`);
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
