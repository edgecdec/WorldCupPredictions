'use client';
import { Box, Card, CardActionArea, CardContent, Typography, Chip, CircularProgress } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { LiveGame } from '@/types';
import TeamFlag from '@/components/common/TeamFlag';

const STATE_IN = 'in';
const STATE_POST = 'post';
const ESPN_MATCH_URL = 'https://www.espn.com/soccer/match/_/gameId';
const ESPN_SCOREBOARD_URL = 'https://www.espn.com/soccer/scoreboard/_/league/fifa.world';

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

function TeamRow({ name, score, isLive, countryCode }: { name: string; score: string; isLive: boolean; countryCode?: string }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5, gap: 0.5 }}>
      {countryCode && <TeamFlag countryCode={countryCode} size={16} />}
      <Typography variant="body2" noWrap sx={{ flex: 1, fontWeight: isLive ? 600 : 400 }}>
        {name}
      </Typography>
      <Typography variant="body2" fontWeight="bold" sx={{ ml: 1, minWidth: 20, textAlign: 'right' }}>
        {score}
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
                  <TeamRow name={game.home.name} score={game.home.score} isLive={isLive} countryCode={countryCodeMap[game.home.name]} />
                  <TeamRow name={game.away.name} score={game.away.score} isLive={isLive} countryCode={countryCodeMap[game.away.name]} />
                </CardContent>
              </CardActionArea>
            </Card>
          );
        })}
      </Box>
    </Box>
  );
}
