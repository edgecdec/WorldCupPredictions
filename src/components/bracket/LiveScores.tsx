'use client';
import { Box, Card, CardActionArea, CardContent, Typography, Chip, CircularProgress } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { LiveGame } from '@/types';
import TeamFlag from '@/components/common/TeamFlag';
import { computeMatchOdds, type MatchOdds } from '@/lib/matchOdds';

const STATE_IN = 'in';
const STATE_POST = 'post';
const ESPN_MATCH_URL = 'https://www.espn.com/soccer/match/_/gameId';
const ESPN_SCOREBOARD_URL = 'https://www.espn.com/soccer/scoreboard/_/league/fifa.world';

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

function TeamRow({ name, score, isLive, countryCode, winPct }: { name: string; score: string; isLive: boolean; countryCode?: string; winPct?: number }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5, gap: 0.5 }}>
      {countryCode && <TeamFlag countryCode={countryCode} size={16} />}
      <Typography variant="body2" noWrap sx={{ flex: 1, fontWeight: isLive ? 600 : 400 }}>
        {name}
      </Typography>
      {winPct !== undefined && (
        <Typography variant="caption" sx={{ color: 'text.secondary', minWidth: 30, textAlign: 'right' }}>
          {fmtPct(winPct)}
        </Typography>
      )}
      <Typography variant="body2" fontWeight="bold" sx={{ ml: 1, minWidth: 20, textAlign: 'right' }}>
        {score}
      </Typography>
    </Box>
  );
}

function DrawRow({ drawPct }: { drawPct: number }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', py: 0.25, gap: 0.5 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
        Draw
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary', minWidth: 30, textAlign: 'right' }}>
        {fmtPct(drawPct)}
      </Typography>
    </Box>
  );
}

interface LiveScoresProps {
  games: LiveGame[];
  loading: boolean;
  countryCodeMap?: Record<string, string>;
}

export default function LiveScores({ games, loading, countryCodeMap = {} }: LiveScoresProps) {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (games.length === 0) return null;

  const live = games.filter((g) => g.state === STATE_IN);
  const recent = games.filter((g) => g.state === STATE_POST);
  const upcoming = games.filter((g) => g.state !== STATE_IN && g.state !== STATE_POST);
  const sorted = [...live, ...recent, ...upcoming];

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        🏟️ Match Scores
        {live.length > 0 && (
          <Chip label={`${live.length} Live`} color="success" size="small" />
        )}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
          gap: 1.5,
        }}
      >
        {sorted.map((game) => {
          const isLive = game.state === STATE_IN;
          const isFinal = game.state === STATE_POST;
          // Pre-match odds — only shown for scheduled games. (Live in-progress
          // odds need a minute-aware model; we don't have that yet.)
          let odds: MatchOdds | null = null;
          // Stage comes from ESPN's headline (group A/B/...) so it's correct
          // even in the rare case where two same-group teams meet again in
          // the knockouts. Default to 'group' when ESPN gives no hint.
          const stage = game.stage ?? 'group';
          if (!isLive && !isFinal) {
            odds = computeMatchOdds(game.home.name, game.away.name, { stage });
          }
          const showDraw = odds && stage === 'group';
          return (
            <Card
              key={game.id}
              variant="outlined"
              sx={{
                borderColor: isLive ? 'success.main' : 'divider',
                borderWidth: isLive ? 2 : 1,
              }}
            >
              <CardActionArea
                component="a"
                href={getEspnUrl(game.id)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <CardContent sx={{ py: 1, px: 2, '&:last-child': { pb: 1 } }}>
                  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mb: 0.5, gap: 0.5 }}>
                    <Chip
                      label={statusLabel(game)}
                      color={statusColor(game.state)}
                      size="small"
                      variant={isLive ? 'filled' : 'outlined'}
                    />
                    <OpenInNewIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                  </Box>
                  <TeamRow name={game.home.name} score={game.home.score} isLive={isLive} countryCode={countryCodeMap[game.home.name]} winPct={odds?.winA} />
                  <TeamRow name={game.away.name} score={game.away.score} isLive={isLive} countryCode={countryCodeMap[game.away.name]} winPct={odds?.winB} />
                  {odds && showDraw && <DrawRow drawPct={odds.draw} />}
                </CardContent>
              </CardActionArea>
            </Card>
          );
        })}
      </Box>
    </Box>
  );
}
