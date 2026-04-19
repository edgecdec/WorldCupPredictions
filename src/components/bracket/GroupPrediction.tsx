'use client';
import { Card, CardContent, Typography, IconButton, Chip, Box, Stack, alpha } from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import type { Theme } from '@mui/material/styles';
import type { Team } from '@/types';

const POSITION_LABELS = ['1st', '2nd', '3rd', '4th'] as const;
const HIGHLIGHT_ALPHA = 0.12;

interface GroupPredictionProps {
  groupName: string;
  teams: Team[];
  order: string[];
  onChange: (groupName: string, newOrder: string[]) => void;
  disabled?: boolean;
  advancingThirdPlaceTeams?: string[];
}

function moveItem(arr: string[], from: number, to: number): string[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function getRowBgColor(position: number, teamName: string, advancingThird: string[], theme: Theme): string {
  if (position <= 1) return alpha(theme.palette.success.main, HIGHLIGHT_ALPHA);
  if (position === 2) {
    return advancingThird.includes(teamName)
      ? alpha(theme.palette.success.main, HIGHLIGHT_ALPHA)
      : alpha(theme.palette.warning.main, HIGHLIGHT_ALPHA);
  }
  return alpha(theme.palette.error.main, HIGHLIGHT_ALPHA);
}

export default function GroupPrediction({ groupName, teams, order, onChange, disabled, advancingThirdPlaceTeams = [] }: GroupPredictionProps) {
  const teamMap = new Map(teams.map((t) => [t.name, t]));

  const handleMove = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    onChange(groupName, moveItem(order, index, target));
  };

  return (
    <Card variant="outlined">
      <CardContent sx={{ pb: 1, '&:last-child': { pb: 1 } }}>
        <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
          Group {groupName}
        </Typography>
        <Stack spacing={0.5}>
          {order.map((name, i) => {
            const team = teamMap.get(name);
            if (!team) return null;
            return (
              <Box
                key={name}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  py: 0.5,
                  px: 1,
                  borderRadius: 1,
                  bgcolor: (theme: Theme) => getRowBgColor(i, name, advancingThirdPlaceTeams, theme),
                }}
              >
                <Typography variant="body2" sx={{ minWidth: 24, fontWeight: 'bold', color: 'text.secondary' }}>
                  {POSITION_LABELS[i]}
                </Typography>
                <Typography variant="body2" sx={{ flex: 1 }}>
                  {team.name}
                </Typography>
                <Chip label={`Pot ${team.pot}`} size="small" variant="outlined" />
                <Typography variant="caption" color="text.secondary" sx={{ minWidth: 20, textAlign: 'right' }}>
                  #{team.fifaRanking}
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', ml: 0.5 }}>
                  <IconButton
                    size="small"
                    onClick={() => handleMove(i, -1)}
                    disabled={disabled || i === 0}
                    sx={{ p: 0 }}
                    aria-label={`Move ${name} up`}
                  >
                    <ArrowUpwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => handleMove(i, 1)}
                    disabled={disabled || i === order.length - 1}
                    sx={{ p: 0 }}
                    aria-label={`Move ${name} down`}
                  >
                    <ArrowDownwardIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
            );
          })}
        </Stack>
      </CardContent>
    </Card>
  );
}
