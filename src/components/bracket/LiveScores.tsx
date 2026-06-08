'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Box, Card, CardActionArea, CardContent, Typography, Chip, CircularProgress, IconButton, Popover } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PlaceIcon from '@mui/icons-material/Place';
import type { LiveGame } from '@/types';
import TeamFlag from '@/components/common/TeamFlag';
import { computeMatchOdds, computeLiveOdds, sampleLiveScores, type MatchOdds } from '@/lib/matchOdds';

const STATE_IN = 'in';
const STATE_POST = 'post';
const ESPN_MATCH_URL = 'https://www.espn.com/soccer/match/_/gameId';
const ESPN_SCOREBOARD_URL = 'https://www.espn.com/soccer/scoreboard/_/league/fifa.world';
const TOP_SCORELINES = 6;
const SAMPLES_FOR_HOVER = 2000;

/** Parse ESPN's clock string ("45'", "67:23", "HT", "FT") into minutes. */
function parseMinutesPlayed(clock: string, period: number): number | null {
  const c = (clock || '').trim();
  if (!c) return null;
  const m = c.match(/^(\d+)(?:\+(\d+))?'?$/);
  if (m) return parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) : 0);
  const m2 = c.match(/^(\d+):(\d+)$/);
  if (m2) return parseInt(m2[1], 10);
  if (/^ht$/i.test(c)) return 45;
  if (/^ft$/i.test(c)) return 90;
  if (period === 1) return 1;
  if (period === 2) return 46;
  return null;
}

function fmtPct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

function statusColor(state: string): 'success' | 'default' | 'error' {
  if (state === STATE_IN) return 'success';
  if (state === STATE_POST) return 'default';
  return 'default';
}

function statusLabel(game: LiveGame): string {
  if (game.state === STATE_IN) return game.detail || 'Live';
  if (game.state === STATE_POST) return 'Final';
  return game.detail || 'Scheduled';
}

function getEspnUrl(gameId: string): string {
  return gameId ? `${ESPN_MATCH_URL}/${gameId}` : ESPN_SCOREBOARD_URL;
}

/** YYYYMMDD format used by ESPN's date param. */
function toEspnDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function formatDateHeading(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/** Format the kickoff time (local) — "3:00 PM" — for upcoming/scheduled games. */
function formatKickoff(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

interface ScorelineFreq {
  scoreA: number;
  scoreB: number;
  count: number;
}

/** Compute the top-N scorelines from a sample list, sorted by frequency desc. */
function topScorelines(samples: Array<[number, number]>, n: number): ScorelineFreq[] {
  const map = new Map<string, ScorelineFreq>();
  for (const [a, b] of samples) {
    const k = `${a}-${b}`;
    const ex = map.get(k);
    if (ex) ex.count++;
    else map.set(k, { scoreA: a, scoreB: b, count: 1 });
  }
  return [...map.values()].sort((x, y) => y.count - x.count).slice(0, n);
}

function TeamRow({ name, score, isLive, countryCode, winPct }: { name: string; score: string; isLive: boolean; countryCode?: string; winPct?: number }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.25, gap: 0.5 }}>
      {countryCode && <TeamFlag countryCode={countryCode} size={14} />}
      <Typography variant="caption" noWrap sx={{ flex: 1, fontWeight: isLive ? 600 : 400, fontSize: '0.78rem' }}>
        {name}
      </Typography>
      {winPct !== undefined && (
        <Typography variant="caption" sx={{ color: 'text.secondary', minWidth: 28, textAlign: 'right', fontSize: '0.7rem' }}>
          {fmtPct(winPct)}
        </Typography>
      )}
      <Typography variant="body2" fontWeight="bold" sx={{ ml: 0.5, minWidth: 16, textAlign: 'right', fontSize: '0.85rem' }}>
        {score}
      </Typography>
    </Box>
  );
}

function DrawRow({ drawPct }: { drawPct: number }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', py: 0.1, gap: 0.5 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic', fontSize: '0.65rem' }}>
        Draw
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary', minWidth: 28, textAlign: 'right', fontSize: '0.65rem' }}>
        {fmtPct(drawPct)}
      </Typography>
    </Box>
  );
}

interface GameCardProps {
  game: LiveGame;
  countryCodeMap: Record<string, string>;
}

function GameCard({ game, countryCodeMap }: GameCardProps) {
  const isLive = game.state === STATE_IN;
  const isFinal = game.state === STATE_POST;
  const stage = game.stage ?? 'group';
  const minutesPlayed = isLive ? parseMinutesPlayed(game.clock, game.period) : null;
  const scoreA = parseInt(game.home.score, 10) || 0;
  const scoreB = parseInt(game.away.score, 10) || 0;

  const odds = useMemo<MatchOdds | null>(() => {
    if (isLive) {
      if (minutesPlayed === null) return null;
      return computeLiveOdds(game.home.name, game.away.name, scoreA, scoreB, minutesPlayed, { stage });
    }
    if (!isFinal) {
      return computeMatchOdds(game.home.name, game.away.name, { stage });
    }
    return null;
  }, [isLive, isFinal, minutesPlayed, scoreA, scoreB, game.home.name, game.away.name, stage]);

  const showDraw = odds && stage === 'group';

  // Lazily compute scoreline distribution only for live games, only on hover.
  const [hoverEl, setHoverEl] = useState<HTMLElement | null>(null);
  const scorelineFreqs = useMemo<ScorelineFreq[] | null>(() => {
    if (!isLive || !hoverEl || minutesPlayed === null) return null;
    const samples = sampleLiveScores(game.home.name, game.away.name, scoreA, scoreB, minutesPlayed, SAMPLES_FOR_HOVER, { stage });
    if (!samples) return null;
    return topScorelines(samples, TOP_SCORELINES);
  }, [isLive, hoverEl, minutesPlayed, scoreA, scoreB, game.home.name, game.away.name, stage]);

  const handleEnter = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (isLive) setHoverEl(e.currentTarget);
  }, [isLive]);
  const handleLeave = useCallback(() => setHoverEl(null), []);

  return (
    <Card
      variant="outlined"
      sx={{
        borderColor: isLive ? 'success.main' : 'divider',
        borderWidth: isLive ? 2 : 1,
        width: '100%',
      }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <CardActionArea
        component="a"
        href={getEspnUrl(game.id)}
        target="_blank"
        rel="noopener noreferrer"
      >
        <CardContent sx={{ py: 0.75, px: 1.25, '&:last-child': { pb: 0.75 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.25, gap: 0.5 }}>
            <Chip
              label={statusLabel(game)}
              color={statusColor(game.state)}
              size="small"
              variant={isLive ? 'filled' : 'outlined'}
              sx={{ height: 18, fontSize: '0.6rem' }}
            />
            {!isLive && !isFinal && (
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
                {formatKickoff(game.date)}
              </Typography>
            )}
            <OpenInNewIcon sx={{ fontSize: 12, color: 'text.secondary' }} />
          </Box>
          <TeamRow name={game.home.name} score={game.home.score} isLive={isLive} countryCode={countryCodeMap[game.home.name]} winPct={odds?.winA} />
          <TeamRow name={game.away.name} score={game.away.score} isLive={isLive} countryCode={countryCodeMap[game.away.name]} winPct={odds?.winB} />
          {odds && showDraw && <DrawRow drawPct={odds.draw} />}
          {game.venue && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, mt: 0.5, color: 'text.secondary' }}>
              <PlaceIcon sx={{ fontSize: 11 }} />
              <Typography variant="caption" noWrap sx={{ fontSize: '0.62rem' }}>
                {game.venue}
              </Typography>
            </Box>
          )}
        </CardContent>
      </CardActionArea>
      {isLive && (
        <Popover
          open={Boolean(hoverEl) && Boolean(scorelineFreqs?.length)}
          anchorEl={hoverEl}
          onClose={handleLeave}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          transformOrigin={{ vertical: 'top', horizontal: 'center' }}
          disableRestoreFocus
          sx={{ pointerEvents: 'none' }}
        >
          <Box sx={{ p: 1, minWidth: 180, pointerEvents: 'auto' }}>
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: 'text.secondary', mb: 0.5, textTransform: 'uppercase', fontSize: '0.6rem' }}>
              Most likely final scores
            </Typography>
            {scorelineFreqs?.map((f) => (
              <Box key={`${f.scoreA}-${f.scoreB}`} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.2, gap: 1 }}>
                <Typography variant="caption" sx={{ fontSize: '0.72rem' }}>
                  {f.scoreA}-{f.scoreB}
                </Typography>
                <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.72rem' }}>
                  {fmtPct(f.count / SAMPLES_FOR_HOVER)}
                </Typography>
              </Box>
            ))}
          </Box>
        </Popover>
      )}
    </Card>
  );
}

interface LiveScoresProps {
  games: LiveGame[];
  loading: boolean;
  countryCodeMap?: Record<string, string>;
  /** Day-by-day controls: when set, the parent owns date state and we render
   *  prev/next buttons. */
  date?: Date;
  onDateChange?: (d: Date) => void;
}

export default function LiveScores({ games, loading, countryCodeMap = {}, date, onDateChange }: LiveScoresProps) {
  const live = games.filter((g) => g.state === STATE_IN);
  const recent = games.filter((g) => g.state === STATE_POST);
  const upcoming = games.filter((g) => g.state !== STATE_IN && g.state !== STATE_POST);
  const sorted = [...live, ...recent, ...upcoming];

  const showNav = Boolean(date && onDateChange);
  const handlePrev = useCallback(() => {
    if (!date || !onDateChange) return;
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() - 1);
    onDateChange(d);
  }, [date, onDateChange]);
  const handleNext = useCallback(() => {
    if (!date || !onDateChange) return;
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + 1);
    onDateChange(d);
  }, [date, onDateChange]);

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '1rem' }}>
          🏟️ Match Scores
          {live.length > 0 && (
            <Chip label={`${live.length} Live`} color="success" size="small" />
          )}
        </Typography>
        {showNav && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}>
            <IconButton size="small" onClick={handlePrev} aria-label="Previous day"><ChevronLeftIcon /></IconButton>
            <Typography variant="body2" sx={{ minWidth: 200, textAlign: 'center', fontWeight: 500 }}>
              {date ? formatDateHeading(date) : ''}
            </Typography>
            <IconButton size="small" onClick={handleNext} aria-label="Next day"><ChevronRightIcon /></IconButton>
          </Box>
        )}
      </Box>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={20} />
        </Box>
      ) : sorted.length === 0 ? (
        <Typography variant="body2" sx={{ color: 'text.secondary', py: 1 }}>
          No matches on this date.
        </Typography>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 1,
          }}
        >
          {sorted.map((game) => (
            <GameCard key={game.id} game={game} countryCodeMap={countryCodeMap} />
          ))}
        </Box>
      )}
    </Box>
  );
}
