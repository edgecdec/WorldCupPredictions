'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Box, Card, CardActionArea, CardContent, Typography, Chip, CircularProgress, IconButton, Popover } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PlaceIcon from '@mui/icons-material/Place';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import type { LiveGame } from '@/types';
import TeamFlag from '@/components/common/TeamFlag';
import type { BracketSlotResult } from '@/hooks/useTournamentSim';
import { computeMatchOdds, computeLiveOdds, sampleLiveScores, type MatchOdds } from '@/lib/matchOdds';
import { parseEspnClock } from '@/lib/parseEspnClock';

const STATE_IN = 'in';
const STATE_POST = 'post';
const ESPN_MATCH_URL = 'https://www.espn.com/soccer/match/_/gameId';
const ESPN_SCOREBOARD_URL = 'https://www.espn.com/soccer/scoreboard/_/league/fifa.world';
const TOP_SCORELINES = 6;
const SAMPLES_FOR_HOVER = 2000;

// Clock parsing moved to lib/parseEspnClock for sharing.

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

/** Friendly day heading using Pacific time so day-by-day pagination matches
 *  the ESPN-side date the hook uses. */
function formatDateHeading(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    timeZone: 'America/Los_Angeles',
  });
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

/**
 * Try to parse one of ESPN's TBD-team placeholder strings into the FIFA slot
 * ID our forecast tracks. Returns e.g. 'R32-5-W' for "Round of 32 5 Winner",
 * '1A' for "Group A 1st Place", etc. Returns null if the name isn't a TBD.
 */
function parseTbdSlot(name: string): string | null {
  if (!name) return null;
  let m: RegExpMatchArray | null;

  // "Round of 32 5 Winner" → R32-5-W
  m = name.match(/^Round of 32 (\d+) Winner$/i);
  if (m) return `R32-${m[1]}-W`;

  // "Round of 16 3 Winner" → R16-3-W
  m = name.match(/^Round of 16 (\d+) Winner$/i);
  if (m) return `R16-${m[1]}-W`;

  // "Quarterfinal 2 Winner" → QF-2-W
  m = name.match(/^Quarterfinal (\d+) Winner$/i);
  if (m) return `QF-${m[1]}-W`;

  // "Semifinal 1 Winner" → SF-1-W
  m = name.match(/^Semifinal (\d+) Winner$/i);
  if (m) return `SF-${m[1]}-W`;

  // "Group A 1st Place" → 1A   "Group H 2nd Place" → 2H
  m = name.match(/^Group ([A-L]) (1st|2nd|3rd) Place$/i);
  if (m) {
    const pos = m[2].toLowerCase().startsWith('1') ? '1'
      : m[2].toLowerCase().startsWith('2') ? '2' : '3';
    return `${pos}${m[1].toUpperCase()}`;
  }

  return null;
}

/**
 * For a slot like "R32-5-W", return the bracketSlot result. For group placement
 * like "1A", we don't have a direct slot — return null and we'll show a generic
 * advancement hint instead.
 */
function findSlotResult(slotId: string, slots: BracketSlotResult[]): BracketSlotResult | null {
  return slots.find((s) => s.slotId === slotId) ?? null;
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

const TBD_TOP_TEAMS = 6;

/**
 * Row for a team that hasn't been determined yet — shows the placeholder name
 * (e.g. "R32-5 Winner") and a hover popover listing the most likely teams.
 * Probabilities come from the forecast's bracket-slot tallies.
 */
function TbdTeamRow({
  placeholder,
  slotResult,
  numSims,
  countryCodeMap,
}: {
  placeholder: string;
  slotResult: BracketSlotResult | null;
  numSims: number;
  countryCodeMap: Record<string, string>;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const hasData = !!slotResult && slotResult.teams.length > 0;

  return (
    <Box
      onMouseEnter={hasData ? (e) => setAnchor(e.currentTarget) : undefined}
      onMouseLeave={() => setAnchor(null)}
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        py: 0.25,
        gap: 0.5,
        cursor: hasData ? 'help' : 'default',
      }}
    >
      <HelpOutlineIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
      <Typography
        variant="caption"
        noWrap
        sx={{
          flex: 1,
          color: 'text.secondary',
          fontStyle: 'italic',
          fontSize: '0.7rem',
          textDecoration: hasData ? 'underline dotted' : 'none',
          textUnderlineOffset: '2px',
        }}
      >
        {placeholder}
      </Typography>
      <Popover
        open={Boolean(anchor) && hasData}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        disableRestoreFocus
        sx={{ pointerEvents: 'none' }}
        slotProps={{ paper: { sx: { p: 1, minWidth: 180 } } }}
      >
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5, textTransform: 'uppercase', fontSize: '0.6rem' }}>
          Most likely teams
        </Typography>
        {slotResult?.teams.slice(0, TBD_TOP_TEAMS).map((t) => {
          const pct = (t.count / numSims) * 100;
          return (
            <Box key={t.team} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.2 }}>
              {countryCodeMap[t.team] && <TeamFlag countryCode={countryCodeMap[t.team]} size={12} />}
              <Typography variant="caption" sx={{ flex: 1, fontSize: '0.72rem' }}>{t.team}</Typography>
              <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.72rem' }}>
                {pct.toFixed(0)}%
              </Typography>
            </Box>
          );
        })}
        {slotResult && slotResult.teams.length > TBD_TOP_TEAMS && (
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6rem', display: 'block', mt: 0.25 }}>
            +{slotResult.teams.length - TBD_TOP_TEAMS} more
          </Typography>
        )}
      </Popover>
    </Box>
  );
}

interface GameCardProps {
  game: LiveGame;
  countryCodeMap: Record<string, string>;
  bracketSlots?: BracketSlotResult[];
  numSims?: number;
  /** Current user's bracket key ('username|bracket_name') for impact panel. */
  currentUserKey?: string;
  /** Current user's pre-match expected total score (subtract to get delta). */
  userExpectedScore?: number;
  /** matchId → outcome → userKey → expected total. From the forecast worker. */
  conditionalScores?: Record<string, Record<string, Record<string, number>>>;
  /** Current group stage for this match if known (e.g. 'A'..'L'). Used to
   *  build the conditional matchId 'group:A:Mexico-South Africa'. */
  groupName?: string;
}

/** Try to derive the conditional matchId for this game. */
function deriveConditionalMatchId(game: LiveGame, groupName: string | undefined): string | null {
  if (!groupName) return null;
  // Group stage: 'group:<groupName>:<home>-<away>'. The order follows the bracket
  // layout so we just use whatever order the worker stored.
  return `group:${groupName}:${game.home.name}-${game.away.name}`;
}

/**
 * Per-outcome impact panel — shows how each W/D/L would affect the user's
 * expected total score, computed from the forecast's conditionalScores.
 */
function ImpactPanel({
  game, countryCodeMap, currentUserKey, userExpectedScore, conditionalScores, groupName, odds,
}: {
  game: LiveGame;
  countryCodeMap: Record<string, string>;
  currentUserKey?: string;
  userExpectedScore?: number;
  conditionalScores?: Record<string, Record<string, Record<string, number>>>;
  groupName?: string;
  /** Pre-match (or live, partway through) match odds — gates each cell so we
   *  hide deltas for outcomes too rare to estimate reliably (<3%). */
  odds?: MatchOdds | null;
}) {
  if (!currentUserKey || userExpectedScore == null || !conditionalScores) return null;
  const matchId = deriveConditionalMatchId(game, groupName);
  if (!matchId) return null;
  const byOutcome = conditionalScores[matchId];
  if (!byOutcome) return null;

  const expW = byOutcome.W?.[currentUserKey];
  const expD = byOutcome.D?.[currentUserKey];
  const expL = byOutcome.L?.[currentUserKey];

  // Hide deltas for outcomes <3% likely — fewer sims hit those buckets so the
  // expected score is noisy and not meaningful to surface.
  const MIN_OUTCOME_PROB = 0.03;
  const showW = !odds || odds.winA >= MIN_OUTCOME_PROB;
  const showD = !odds || odds.draw >= MIN_OUTCOME_PROB;
  const showL = !odds || odds.winB >= MIN_OUTCOME_PROB;

  const fmt = (val?: number, show = true) => {
    if (!show) return '—';
    if (val == null) return '—';
    const delta = val - userExpectedScore;
    const sign = delta >= 0 ? '+' : '';
    return `${sign}${delta.toFixed(1)}`;
  };
  const color = (val?: number, show = true) => {
    if (!show || val == null) return 'text.secondary';
    const d = val - userExpectedScore;
    if (Math.abs(d) < 0.05) return 'text.secondary';
    return d > 0 ? 'success.main' : 'error.main';
  };

  const homeCC = countryCodeMap[game.home.name];
  const awayCC = countryCodeMap[game.away.name];

  return (
    <Box sx={{ mt: 0.5, pt: 0.5, borderTop: 1, borderColor: 'divider' }}>
      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontSize: '0.6rem', textTransform: 'uppercase', fontWeight: 700 }}>
        Impact on your Exp Pts
      </Typography>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', mt: 0.25 }}>
        <Box sx={{ flex: 1, textAlign: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.3, mb: 0.1 }}>
            {homeCC && <TeamFlag countryCode={homeCC} size={12} />}
            <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.secondary', fontWeight: 700 }}>W</Typography>
          </Box>
          <Typography variant="caption" sx={{ fontSize: '0.7rem', fontWeight: 700, color: color(expW, showW) }}>{fmt(expW, showW)}</Typography>
        </Box>
        <Box sx={{ flex: 1, textAlign: 'center' }}>
          <Typography variant="caption" sx={{ display: 'block', fontSize: '0.6rem', color: 'text.secondary', fontWeight: 700, mb: 0.1 }}>Draw</Typography>
          <Typography variant="caption" sx={{ fontSize: '0.7rem', fontWeight: 700, color: color(expD, showD) }}>{fmt(expD, showD)}</Typography>
        </Box>
        <Box sx={{ flex: 1, textAlign: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.3, mb: 0.1 }}>
            {awayCC && <TeamFlag countryCode={awayCC} size={12} />}
            <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.secondary', fontWeight: 700 }}>W</Typography>
          </Box>
          <Typography variant="caption" sx={{ fontSize: '0.7rem', fontWeight: 700, color: color(expL, showL) }}>{fmt(expL, showL)}</Typography>
        </Box>
      </Box>
    </Box>
  );
}

function GameCard({ game, countryCodeMap, bracketSlots, numSims, currentUserKey, userExpectedScore, conditionalScores, groupName }: GameCardProps) {
  const isLive = game.state === STATE_IN;
  const isFinal = game.state === STATE_POST;
  const stage = game.stage ?? 'group';
  const minutesPlayed = isLive ? parseEspnClock(game.clock, game.period) : null;
  const scoreA = parseInt(game.home.score, 10) || 0;
  const scoreB = parseInt(game.away.score, 10) || 0;

  // TBD detection: ESPN gives placeholder names like "Round of 32 5 Winner"
  // until real teams are known. We map those to forecast slot IDs.
  const homeSlotId = parseTbdSlot(game.home.name);
  const awaySlotId = parseTbdSlot(game.away.name);
  const homeIsTbd = homeSlotId !== null;
  const awayIsTbd = awaySlotId !== null;
  const anyTbd = homeIsTbd || awayIsTbd;

  // Real-team odds only make sense when both sides are known.
  const odds = useMemo<MatchOdds | null>(() => {
    if (anyTbd) return null;
    if (isLive) {
      if (minutesPlayed === null) return null;
      return computeLiveOdds(game.home.name, game.away.name, scoreA, scoreB, minutesPlayed, { stage });
    }
    if (!isFinal) {
      return computeMatchOdds(game.home.name, game.away.name, { stage });
    }
    return null;
  }, [anyTbd, isLive, isFinal, minutesPlayed, scoreA, scoreB, game.home.name, game.away.name, stage]);

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
            {/* Live games show the running clock; finals show 'Final'; scheduled
                games show only the kickoff time (the status chip would just
                duplicate the date/time string). */}
            {isLive || isFinal ? (
              <Chip
                label={statusLabel(game)}
                color={statusColor(game.state)}
                size="small"
                variant={isLive ? 'filled' : 'outlined'}
                sx={{ height: 18, fontSize: '0.6rem' }}
              />
            ) : (
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
                {formatKickoff(game.date)}
              </Typography>
            )}
            <OpenInNewIcon sx={{ fontSize: 12, color: 'text.secondary' }} />
          </Box>
          {homeIsTbd ? (
            <TbdTeamRow
              placeholder={game.home.name}
              slotResult={bracketSlots && homeSlotId ? findSlotResult(homeSlotId, bracketSlots) : null}
              numSims={numSims ?? 0}
              countryCodeMap={countryCodeMap}
            />
          ) : (
            <TeamRow name={game.home.name} score={game.home.score} isLive={isLive} countryCode={countryCodeMap[game.home.name]} winPct={odds?.winA} />
          )}
          {awayIsTbd ? (
            <TbdTeamRow
              placeholder={game.away.name}
              slotResult={bracketSlots && awaySlotId ? findSlotResult(awaySlotId, bracketSlots) : null}
              numSims={numSims ?? 0}
              countryCodeMap={countryCodeMap}
            />
          ) : (
            <TeamRow name={game.away.name} score={game.away.score} isLive={isLive} countryCode={countryCodeMap[game.away.name]} winPct={odds?.winB} />
          )}
          {odds && showDraw && <DrawRow drawPct={odds.draw} />}
          {game.venue && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, mt: 0.5, color: 'text.secondary' }}>
              <PlaceIcon sx={{ fontSize: 11 }} />
              <Typography variant="caption" noWrap sx={{ fontSize: '0.62rem' }}>
                {game.venue}
              </Typography>
            </Box>
          )}
          {/* Once the match is final, the W/D/L distribution is no longer
              meaningful — the actual result is known. Hide until the DB sync
              picks up the FT score and the worker re-runs with it locked. */}
          {!isFinal && (
            <ImpactPanel
              game={game}
              countryCodeMap={countryCodeMap}
              currentUserKey={currentUserKey}
              userExpectedScore={userExpectedScore}
              conditionalScores={conditionalScores}
              groupName={groupName}
              odds={odds}
            />
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
          disableAutoFocus
          disableEnforceFocus
          disableScrollLock
          sx={{ pointerEvents: 'none' }}
        >
          <Box sx={{ p: 1, minWidth: 220, pointerEvents: 'auto' }}>
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: 'text.secondary', mb: 0.5, textTransform: 'uppercase', fontSize: '0.6rem' }}>
              Most likely final scores
            </Typography>
            {scorelineFreqs?.map((f) => {
              const exactKey = `${f.scoreA}-${f.scoreB}`;
              const matchId = deriveConditionalMatchId(game, groupName);
              const expForScoreline = matchId && currentUserKey
                ? conditionalScores?.[matchId]?.[exactKey]?.[currentUserKey]
                : undefined;
              // Hide deltas for scorelines below 3% sample frequency — too few
              // sims hit those buckets to estimate the conditional score reliably.
              const scorelineProb = f.count / SAMPLES_FOR_HOVER;
              const showDelta = expForScoreline != null && userExpectedScore != null && scorelineProb >= 0.03;
              const delta = showDelta ? (expForScoreline as number) - (userExpectedScore as number) : 0;
              const deltaSign = delta >= 0 ? '+' : '';
              const deltaColor = !showDelta ? 'text.secondary'
                : Math.abs(delta) < 0.05 ? 'text.secondary'
                : delta > 0 ? 'success.main' : 'error.main';
              return (
                <Box key={exactKey} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.2, gap: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                    {countryCodeMap[game.home.name] && <TeamFlag countryCode={countryCodeMap[game.home.name]} size={14} />}
                    <Typography variant="caption" sx={{ fontSize: '0.72rem', minWidth: 14, textAlign: 'center' }}>{f.scoreA}</Typography>
                    <Typography variant="caption" sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>—</Typography>
                    <Typography variant="caption" sx={{ fontSize: '0.72rem', minWidth: 14, textAlign: 'center' }}>{f.scoreB}</Typography>
                    {countryCodeMap[game.away.name] && <TeamFlag countryCode={countryCodeMap[game.away.name]} size={14} />}
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    {showDelta && (
                      <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.7rem', color: deltaColor, minWidth: 36, textAlign: 'right' }}>
                        {deltaSign}{delta.toFixed(1)}
                      </Typography>
                    )}
                    <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.72rem', color: 'text.secondary', minWidth: 32, textAlign: 'right' }}>
                      {fmtPct(f.count / SAMPLES_FOR_HOVER)}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
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
  /** Forecast bracket slot tallies — used to render team probabilities for TBD
   *  cards. Optional: TBD cards still render their placeholder name without it. */
  bracketSlots?: BracketSlotResult[];
  numSims?: number;
  /** Current user's bracket key. Triggers per-card impact panel. */
  currentUserKey?: string;
  /** Current user's pre-match expected total score. */
  userExpectedScore?: number;
  /** matchId → outcome → userKey → expected total. */
  conditionalScores?: Record<string, Record<string, Record<string, number>>>;
  /** Map from team name to group name (for deriving conditional matchIds). */
  teamToGroup?: Record<string, string>;
}

export default function LiveScores({ games, loading, countryCodeMap = {}, date, onDateChange, bracketSlots, numSims, currentUserKey, userExpectedScore, conditionalScores, teamToGroup }: LiveScoresProps) {
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
          {sorted.map((game) => {
            const groupName = teamToGroup?.[game.home.name];
            return (
              <GameCard
                key={game.id}
                game={game}
                countryCodeMap={countryCodeMap}
                bracketSlots={bracketSlots}
                numSims={numSims}
                currentUserKey={currentUserKey}
                userExpectedScore={userExpectedScore}
                conditionalScores={conditionalScores}
                groupName={groupName}
              />
            );
          })}
        </Box>
      )}
    </Box>
  );
}
