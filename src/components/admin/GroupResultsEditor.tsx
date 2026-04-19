'use client';
import { useState, useMemo } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Chip, Alert,
  CircularProgress, IconButton, Stack, Grid,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import type { BracketData, GroupStageResults } from '@/types';

const POSITION_LABELS = ['1st', '2nd', '3rd', '4th'] as const;
const ADVANCING_THIRD_COUNT = 8;

interface GroupResultsEditorProps {
  bracketData: BracketData;
  existingResults?: GroupStageResults | null;
  onSaved: () => void;
}

function moveItem(arr: string[], from: number, to: number): string[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export default function GroupResultsEditor({ bracketData, existingResults, onSaved }: GroupResultsEditorProps) {
  const initialOrders = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const group of bracketData.groups) {
      const existing = existingResults?.groupResults.find((g) => g.groupName === group.name);
      map[group.name] = existing ? [...existing.order] : group.teams.map((t) => t.name);
    }
    return map;
  }, [bracketData, existingResults]);

  const [orders, setOrders] = useState<Record<string, string[]>>(initialOrders);
  const [advancingThird, setAdvancingThird] = useState<Set<string>>(
    () => new Set(existingResults?.advancingThirdPlace ?? []),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const thirdPlaceTeams = useMemo(
    () => bracketData.groups.map((g) => ({ group: g.name, team: orders[g.name]?.[2] ?? '' })),
    [bracketData, orders],
  );

  const handleMove = (groupName: string, index: number, direction: -1 | 1) => {
    const target = index + direction;
    const order = orders[groupName];
    if (!order || target < 0 || target >= order.length) return;
    setOrders((prev) => ({ ...prev, [groupName]: moveItem(prev[groupName], index, target) }));
    // If 3rd place team changed, remove old from advancing set
    const oldThird = order[2];
    const newOrder = moveItem(order, index, target);
    const newThird = newOrder[2];
    if (oldThird !== newThird) {
      setAdvancingThird((prev) => {
        const next = new Set(prev);
        next.delete(oldThird);
        return next;
      });
    }
  };

  const toggleThirdPlace = (team: string) => {
    setAdvancingThird((prev) => {
      const next = new Set(prev);
      if (next.has(team)) {
        next.delete(team);
      } else if (next.size < ADVANCING_THIRD_COUNT) {
        next.add(team);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    setError('');
    setSuccess('');
    if (advancingThird.size !== ADVANCING_THIRD_COUNT) {
      setError(`Select exactly ${ADVANCING_THIRD_COUNT} advancing third-place teams`);
      return;
    }
    setSubmitting(true);
    try {
      const groupResults = bracketData.groups.map((g) => ({
        groupName: g.name,
        order: orders[g.name] as [string, string, string, string],
      }));
      const res = await fetch('/api/admin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_group_results',
          groupResults,
          advancingThirdPlace: Array.from(advancingThird),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to save results');
      setSuccess('Group stage results saved! Knockout bracket generated.');
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const teamMap = useMemo(() => {
    const map = new Map<string, { pot: number; fifaRanking: number }>();
    for (const group of bracketData.groups) {
      for (const t of group.teams) map.set(t.name, { pot: t.pot, fifaRanking: t.fifaRanking });
    }
    return map;
  }, [bracketData]);

  return (
    <Card sx={{ mb: 4 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Group Stage Results
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Set the finishing order for each group, then select 8 advancing third-place teams.
        </Typography>

        <Grid container spacing={2} sx={{ mb: 3 }}>
          {bracketData.groups.map((group) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={group.name}>
              <Card variant="outlined">
                <CardContent sx={{ pb: 1, '&:last-child': { pb: 1 } }}>
                  <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                    Group {group.name}
                  </Typography>
                  <Stack spacing={0.5}>
                    {(orders[group.name] ?? []).map((name, i) => {
                      const info = teamMap.get(name);
                      return (
                        <Box
                          key={name}
                          sx={{
                            display: 'flex', alignItems: 'center', gap: 0.5,
                            py: 0.25, px: 0.5, borderRadius: 1, bgcolor: 'action.hover',
                          }}
                        >
                          <Typography variant="caption" sx={{ minWidth: 22, fontWeight: 'bold', color: 'text.secondary' }}>
                            {POSITION_LABELS[i]}
                          </Typography>
                          <Typography variant="body2" sx={{ flex: 1, fontSize: '0.8rem' }}>
                            {name}
                          </Typography>
                          {info && (
                            <Typography variant="caption" color="text.secondary">
                              #{info.fifaRanking}
                            </Typography>
                          )}
                          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                            <IconButton
                              size="small"
                              onClick={() => handleMove(group.name, i, -1)}
                              disabled={submitting || i === 0}
                              sx={{ p: 0 }}
                              aria-label={`Move ${name} up`}
                            >
                              <ArrowUpwardIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => handleMove(group.name, i, 1)}
                              disabled={submitting || i === 3}
                              sx={{ p: 0 }}
                              aria-label={`Move ${name} down`}
                            >
                              <ArrowDownwardIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Box>
                        </Box>
                      );
                    })}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
          Advancing Third-Place Teams ({advancingThird.size}/{ADVANCING_THIRD_COUNT})
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3 }}>
          {thirdPlaceTeams.map(({ group, team }) => (
            <Chip
              key={group}
              label={`${team} (${group})`}
              color={advancingThird.has(team) ? 'primary' : 'default'}
              variant={advancingThird.has(team) ? 'filled' : 'outlined'}
              onClick={() => toggleThirdPlace(team)}
              disabled={submitting}
            />
          ))}
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || advancingThird.size !== ADVANCING_THIRD_COUNT}
          startIcon={submitting ? <CircularProgress size={20} color="inherit" /> : null}
        >
          Save Group Results
        </Button>
      </CardContent>
    </Card>
  );
}
