/**
 * Parse ESPN's clock string into elapsed minutes.
 *
 * ESPN sends a variety of formats; this parser handles all the ones we've
 * observed in the wild and a few sensible variants:
 *
 *   "45'", "67'"             → regulation minute
 *   "45+3'", "45'+3'"        → 1H stoppage (48). The apostrophe can appear
 *                              after the regulation minute, after the
 *                              stoppage minute, or both. We strip them all
 *                              before matching so any combination parses.
 *   "90+6'", "90'+6'"        → 2H stoppage (96)
 *   "HT", "Halftime"          → 45
 *   "FT", "Fulltime"          → 90
 *   "67:23" (rare)            → 67 (minute part)
 *
 * Anything unrecognized falls back to a period-based mid-half estimate so
 * the live game still feeds the sim instead of being dropped. (Dropping
 * was the prior bug: an unrecognized clock format would return null, the
 * caller would skip the game, and the sim would silently fall back to
 * pre-game forecasts — visible to users as the live state being ignored.)
 *
 * Returns null only when both the clock string and period are absent /
 * non-meaningful.
 */
export function parseEspnClock(clock: string, period: number): number | null {
  const raw = (clock || '').trim();
  const c = raw.replace(/'/g, '').toLowerCase();
  // Mid-half estimate when clock is missing — better than dropping the game.
  if (!c) return period === 1 ? 23 : period === 2 ? 68 : null;
  const m = c.match(/^(\d+)(?:\+(\d+))?$/);
  if (m) return parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) : 0);
  const m2 = c.match(/^(\d+):(\d+)$/);
  if (m2) return parseInt(m2[1], 10);
  if (/^h(t|alf-?time|alf time)$/.test(c)) return 45;
  if (/^f(t|ull-?time|ull time)$/.test(c)) return 90;
  if (period === 1) return 23;
  if (period === 2) return 68;
  return null;
}
