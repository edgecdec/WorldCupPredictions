'use client';
import { useState, useRef, useCallback } from 'react';
import { Card, CardContent, Typography, IconButton, Chip, Box, Stack, alpha } from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import type { Theme } from '@mui/material/styles';
import type { Team } from '@/types';

const POSITION_LABELS = ['1st', '2nd', '3rd', '4th'] as const;
const HIGHLIGHT_ALPHA = 0.12;
const DROP_INDICATOR_HEIGHT = 2;

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
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const touchState = useRef<{ startY: number; index: number; moved: boolean } | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    if (disabled) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    setDragIndex(index);
  }, [disabled]);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(index);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    const fromIndex = Number(e.dataTransfer.getData('text/plain'));
    if (!isNaN(fromIndex) && fromIndex !== toIndex) {
      onChange(groupName, moveItem(order, fromIndex, toIndex));
    }
    setDragIndex(null);
    setDropTarget(null);
  }, [groupName, order, onChange]);

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDropTarget(null);
  }, []);

  const handleTouchStart = useCallback((index: number, e: React.TouchEvent) => {
    if (disabled) return;
    touchState.current = { startY: e.touches[0].clientY, index, moved: false };
  }, [disabled]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchState.current) return;
    const dy = e.touches[0].clientY - touchState.current.startY;
    const rowHeight = 44;
    const steps = Math.round(dy / rowHeight);
    if (steps !== 0) {
      const from = touchState.current.index;
      const to = Math.max(0, Math.min(order.length - 1, from + steps));
      if (to !== from) {
        touchState.current = { startY: e.touches[0].clientY, index: to, moved: true };
        onChange(groupName, moveItem(order, from, to));
      }
    }
  }, [groupName, order, onChange]);

  const handleTouchEnd = useCallback(() => {
    touchState.current = null;
  }, []);

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
            const isDragging = dragIndex === i;
            const isDropTarget = dropTarget === i && dragIndex !== null && dragIndex !== i;
            return (
              <Box
                key={name}
                draggable={!disabled}
                onDragStart={(e) => handleDragStart(e, i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={(e) => handleDrop(e, i)}
                onDragEnd={handleDragEnd}
                onTouchStart={(e) => handleTouchStart(i, e)}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  py: 0.5,
                  px: 1,
                  borderRadius: 1,
                  bgcolor: (theme: Theme) => getRowBgColor(i, name, advancingThirdPlaceTeams, theme),
                  opacity: isDragging ? 0.4 : 1,
                  borderTop: isDropTarget ? (theme: Theme) => `${DROP_INDICATOR_HEIGHT}px solid ${theme.palette.primary.main}` : 'none',
                  cursor: disabled ? 'default' : 'grab',
                  transition: 'opacity 0.15s, border-top 0.15s',
                  touchAction: disabled ? 'auto' : 'none',
                }}
              >
                {!disabled && (
                  <DragIndicatorIcon fontSize="small" sx={{ color: 'text.secondary', cursor: 'grab', flexShrink: 0 }} />
                )}
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
