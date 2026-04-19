'use client';
import { Suspense, useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Container, Typography, Box, CircularProgress, FormControl, InputLabel,
  Select, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Paper, Chip, Drawer, IconButton, Button, useMediaQuery, useTheme,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import LeaderboardIcon from '@mui/icons-material/Leaderboard';
import CloseIcon from '@mui/icons-material/Close';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import LinearProgress from '@mui/material/LinearProgress';
import CasinoIcon from '@mui/icons-material/Casino';
import KnockoutBracket from '@/components/bracket/KnockoutBracket';
import MobileBracket from '@/components/bracket/MobileBracket';
import { useAuth } from '@/hooks/useAuth';
import { useSelectedGroup } from '@/hooks/useSelectedGroup';
import AuthForm from '@/components/auth/AuthForm';
import { scoreTotalPrediction } from '@/lib/scoring';
import { cascadeClear } from '@/lib/bracketUtils';
import { useMonteCarlo } from '@/hooks/useMonteCarlo';
import type {
  BracketData, ScoringSettings, KnockoutMatchup, GroupPrediction,
  GroupStageResults, KnockoutResults, TournamentResults,
} from '@/types';

interface SimEntry {
  username: string;
  bracket_name: string;
  group_predictions: GroupPrediction[];
  third_place_picks: string[];
  knockout_picks: Record<string, string>;
  tiebreaker: number | null;
}

interface GroupOption {
  id: string;
  name: string;
}

interface RankedEntry {
  username: string;
  bracket_name: string;
  score: number;
  key: string;
}

function scoreEntry(
  entry: SimEntry,
  groupStageResults: GroupStageResults | undefined,
  knockoutResults: KnockoutResults | undefined,
  knockoutMatchups: KnockoutMatchup[] | undefined,
  bracketData: BracketData,
  settings: ScoringSettings,
): number {
  const result = scoreTotalPrediction(
    entry.group_predictions,
    entry.third_place_picks,
    entry.knockout_picks,
    groupStageResults,
    knockoutResults,
    knockoutMatchups,
    bracketData,
    settings,
  );
  return result.totalScore;
}

function mergeKnockoutResults(
  actual: KnockoutResults | undefined,
  hypo: Record<string, string>,
): KnockoutResults {
  return { ...actual, ...hypo };
}

export default function SimulatePage() {
  return (
    <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>}>
      <SimulateContent />
    </Suspense>
  );
}

function SimulateContent() {
  const searchParams = useSearchParams();
  const initialGroupId = searchParams.get('group') ?? '';
  const { user, loading: authLoading } = useAuth();
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [groupId, setGroupId] = useSelectedGroup(initialGroupId || undefined);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Sim data from API
  const [bracketData, setBracketData] = useState<BracketData | null>(null);
  const [results, setResults] = useState<TournamentResults | null>(null);
  const [settings, setSettings] = useState<ScoringSettings | null>(null);
  const [entries, setEntries] = useState<SimEntry[]>([]);

  // Hypothetical knockout picks
  const [hypo, setHypo] = useState<Record<string, string>>({});

  const theme = useTheme();
  const isWide = useMediaQuery(theme.breakpoints.up('lg'));
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const matchups: KnockoutMatchup[] = results?.knockoutBracket ?? [];
  const actualKnockout = results?.knockout;

  useEffect(() => {
    if (!user) return;
    fetch('/api/groups')
      .then((r) => r.json())
      .then((d) => {
        if (d.groups) {
          const opts = d.groups.map((g: { id: string; name: string }) => ({ id: g.id, name: g.name }));
          setGroups(opts);
          if (!groupId && opts.length > 0) setGroupId(opts[0].id);
        }
      });
  }, [user]);

  useEffect(() => {
    if (!groupId) return;
    setLoading(true);
    setHypo({});
    fetch(`/api/simulate?group_id=${groupId}`)
      .then((r) => r.json())
      .then((d) => {
        setBracketData(d.bracket_data ?? null);
        setResults(d.results ?? null);
        setSettings(d.scoring ?? null);
        setEntries(d.entries ?? []);
      })
      .finally(() => setLoading(false));
  }, [groupId]);

  // Build matchups with hypothetical winners propagated
  const simMatchups = useMemo(() => {
    if (!matchups.length) return [];
    const mergedResults = mergeKnockoutResults(actualKnockout, hypo);
    return matchups.map((m) => ({
      ...m,
      teamA: mergedResults[`${m.id}_teamA`] ?? m.teamA,
      teamB: mergedResults[`${m.id}_teamB`] ?? m.teamB,
    }));
  }, [matchups, actualKnockout, hypo]);

  // Merged results for display: actual + hypothetical
  const mergedKnockout = useMemo(
    () => mergeKnockoutResults(actualKnockout, hypo),
    [actualKnockout, hypo],
  );

  const handlePick = useCallback(
    (matchupId: string, team: string) => {
      // Don't override actual results
      if (actualKnockout?.[matchupId]) return;
      setHypo((prev) => {
        // Toggle off if same pick
        if (prev[matchupId] === team) {
          const next = { ...prev };
          delete next[matchupId];
          // Also cascade-clear downstream
          const downstream = cascadeClear(next, matchupId, matchups);
          // Remove any hypo picks that depended on this
          return downstream;
        }
        const cleared = cascadeClear(prev, matchupId, matchups);
        return { ...cleared, [matchupId]: team };
      });
    },
    [matchups, actualKnockout],
  );

  // Score with actual results only (baseline)
  const baseRanked: RankedEntry[] = useMemo(() => {
    if (!bracketData || !settings) return [];
    return entries
      .map((e) => ({
        username: e.username,
        bracket_name: e.bracket_name,
        key: `${e.username}|${e.bracket_name}`,
        score: scoreEntry(e, results?.groupStage, actualKnockout, matchups.length ? matchups : undefined, bracketData, settings),
      }))
      .sort((a, b) => b.score - a.score);
  }, [entries, results, actualKnockout, matchups, bracketData, settings]);

  // Score with merged results (actual + hypothetical)
  const simRanked: RankedEntry[] = useMemo(() => {
    if (!bracketData || !settings) return [];
    return entries
      .map((e) => ({
        username: e.username,
        bracket_name: e.bracket_name,
        key: `${e.username}|${e.bracket_name}`,
        score: scoreEntry(e, results?.groupStage, mergedKnockout, matchups.length ? matchups : undefined, bracketData, settings),
      }))
      .sort((a, b) => b.score - a.score);
  }, [entries, results, mergedKnockout, matchups, bracketData, settings]);

  const rankChange = useCallback(
    (key: string) => {
      const baseIdx = baseRanked.findIndex((e) => e.key === key);
      const simIdx = simRanked.findIndex((e) => e.key === key);
      if (baseIdx < 0 || simIdx < 0) return 0;
      return baseIdx - simIdx;
    },
    [baseRanked, simRanked],
  );

  const scoreDelta = useCallback(
    (key: string) => {
      const base = baseRanked.find((e) => e.key === key);
      const sim = simRanked.find((e) => e.key === key);
      if (!base || !sim) return 0;
      return sim.score - base.score;
    },
    [baseRanked, simRanked],
  );

  const hypoCount = Object.keys(hypo).length;

  const countryCodeMap: Record<string, string> = {};
  if (bracketData?.groups) {
    for (const g of bracketData.groups) {
      for (const t of g.teams) {
        if (t.countryCode) countryCodeMap[t.name] = t.countryCode;
      }
    }
  }

  // Monte Carlo entries for the hook
  const mcEntries = useMemo(
    () => entries.map((e) => ({
      key: `${e.username}|${e.bracket_name}`,
      picks: e.knockout_picks,
    })),
    [entries],
  );

  const { mcResults, progress: mcProgress, running: mcRunning } = useMonteCarlo(
    mcEntries,
    actualKnockout ?? {},
    hypo,
    matchups,
    bracketData,
    settings?.knockout,
  );

  if (authLoading) return null;
  if (!user) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Typography variant="h4" gutterBottom>What-If Simulator</Typography>
        <AuthForm />
      </Container>
    );
  }

  const leaderboardPanel = (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Leaderboard
          {hypoCount > 0 && (
            <Chip label={`${hypoCount} hypothetical`} size="small" color="warning" variant="outlined" sx={{ ml: 1 }} />
          )}
        </Typography>
        {hypoCount > 0 && (
          <Button size="small" variant="outlined" startIcon={<RestartAltIcon />} onClick={() => setHypo({})}>
            Reset
          </Button>
        )}
      </Box>
      {simRanked.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No predictions in this group.</Typography>
      ) : (
        <TableContainer component={Paper} sx={{ maxHeight: 500, overflow: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ py: 0.5, px: 1 }}>#</TableCell>
                <TableCell sx={{ py: 0.5, px: 1 }}>Player</TableCell>
                <TableCell align="right" sx={{ py: 0.5, px: 1 }}>Score</TableCell>
                <TableCell align="center" sx={{ py: 0.5, px: 1 }}>Δ</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {simRanked.map((e, i) => {
                const delta = rankChange(e.key);
                const sd = scoreDelta(e.key);
                const isCurrentUser = e.username === user.username;
                const rank = i === 0 || e.score !== simRanked[i - 1].score
                  ? i + 1
                  : simRanked.findIndex((s) => s.score === e.score) + 1;
                const tied = simRanked.filter((s) => s.score === e.score).length > 1;
                return (
                  <TableRow key={e.key} sx={isCurrentUser ? { bgcolor: 'action.selected' } : undefined}>
                    <TableCell sx={{ py: 0.25, px: 1 }}>{tied ? `T-${rank}` : rank}</TableCell>
                    <TableCell sx={{ py: 0.25, px: 1 }}>
                      <Typography variant="body2" noWrap sx={{ fontSize: '0.75rem', maxWidth: 120 }}>
                        {e.username}{e.bracket_name ? ` — ${e.bracket_name}` : ''}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ py: 0.25, px: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{e.score}</Typography>
                        {sd !== 0 && (
                          <Typography
                            variant="caption"
                            sx={{ color: sd > 0 ? 'success.main' : 'error.main', fontWeight: 600, fontSize: '0.65rem' }}
                          >
                            {sd > 0 ? `+${sd}` : sd}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="center" sx={{ py: 0.25, px: 1 }}>
                      {delta > 0 && (
                        <Chip
                          icon={<ArrowUpwardIcon sx={{ fontSize: 14 }} />}
                          label={`+${delta}`}
                          size="small"
                          color="success"
                          variant="outlined"
                          sx={{ height: 20, '& .MuiChip-label': { px: 0.5, fontSize: '0.7rem' } }}
                        />
                      )}
                      {delta < 0 && (
                        <Chip
                          icon={<ArrowDownwardIcon sx={{ fontSize: 14 }} />}
                          label={`${delta}`}
                          size="small"
                          color="error"
                          variant="outlined"
                          sx={{ height: 20, '& .MuiChip-label': { px: 0.5, fontSize: '0.7rem' } }}
                        />
                      )}
                      {delta === 0 && <Typography variant="caption" color="text.secondary">—</Typography>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );

  const monteCarloPanel = (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <CasinoIcon sx={{ fontSize: 18 }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Monte Carlo (1,000 sims)
        </Typography>
        {mcRunning && (
          <Chip label={`${mcProgress}/1000`} size="small" variant="outlined" sx={{ ml: 'auto' }} />
        )}
      </Box>
      {mcRunning && <LinearProgress variant="determinate" value={(mcProgress / 1000) * 100} sx={{ mb: 1 }} />}
      {mcResults.length > 0 && (
        <TableContainer component={Paper} sx={{ maxHeight: 400, overflow: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ py: 0.5, px: 1 }}>#</TableCell>
                <TableCell sx={{ py: 0.5, px: 1 }}>Player</TableCell>
                <TableCell align="right" sx={{ py: 0.5, px: 1 }}>Win %</TableCell>
                <TableCell align="right" sx={{ py: 0.5, px: 1 }}>Avg Place</TableCell>
                <TableCell align="right" sx={{ py: 0.5, px: 1 }}>Avg Score</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {mcResults.map((r, i) => {
                const isCurrentUser = r.key.startsWith(`${user.username}|`);
                return (
                  <TableRow key={r.key} sx={isCurrentUser ? { bgcolor: 'action.selected' } : undefined}>
                    <TableCell sx={{ py: 0.25, px: 1 }}>{i + 1}</TableCell>
                    <TableCell sx={{ py: 0.25, px: 1 }}>
                      <Typography variant="body2" noWrap sx={{ fontSize: '0.75rem', maxWidth: 120 }}>
                        {r.key.replace('|', ' — ').replace(/ — $/, '')}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ py: 0.25, px: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{r.winPct}%</Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ py: 0.25, px: 1 }}>{r.avgPlace}</TableCell>
                    <TableCell align="right" sx={{ py: 0.25, px: 1 }}>{r.avgScore}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {!mcRunning && mcResults.length === 0 && matchups.length > 0 && (
        <Typography variant="body2" color="text.secondary">
          Simulation will start automatically when predictions are loaded.
        </Typography>
      )}
    </Box>
  );

  return (
    <Container maxWidth={false} sx={{ mt: 2, px: 2, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Box>
          <Typography variant="h5" gutterBottom>🔮 What-If Simulator</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Click teams in undecided games to set hypothetical winners. The leaderboard updates live.
          </Typography>
        </Box>
        {!isWide && simRanked.length > 0 && (
          <IconButton onClick={() => setDrawerOpen(true)} color="primary">
            <LeaderboardIcon />
          </IconButton>
        )}
      </Box>

      <FormControl size="small" sx={{ minWidth: 250, mb: 2 }}>
        <InputLabel>Select Group</InputLabel>
        <Select value={groupId} label="Select Group" onChange={(e) => setGroupId(e.target.value)}>
          {groups.map((g) => (
            <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
      ) : matchups.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            The knockout bracket is not available yet. Group stage results must be entered first.
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {/* Legend */}
            <Box sx={{ display: 'flex', gap: 2, mb: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 12, height: 12, bgcolor: 'rgba(76,175,80,0.3)', border: '1px solid #4caf50', borderRadius: 0.5 }} />
                <Typography variant="caption">Actual result</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 12, height: 12, bgcolor: 'rgba(66,165,245,0.3)', border: '1px solid #42a5f5', borderRadius: 0.5 }} />
                <Typography variant="caption">Hypothetical</Typography>
              </Box>
              {hypoCount > 0 && (
                <Button size="small" variant="outlined" startIcon={<RestartAltIcon />} onClick={() => setHypo({})} sx={{ ml: 'auto' }}>
                  Reset All
                </Button>
              )}
            </Box>

            {isMobile ? (
              <MobileBracket
                matchups={matchups}
                picks={mergedKnockout}
                onPick={handlePick}
                results={actualKnockout}
                countryCodeMap={countryCodeMap}
              />
            ) : (
              <KnockoutBracket
                matchups={matchups}
                picks={mergedKnockout}
                onPick={handlePick}
                results={actualKnockout}
                countryCodeMap={countryCodeMap}
              />
            )}
          </Box>

          {/* Sidebar leaderboard on wide screens */}
          {isWide && (
            <Box sx={{ width: 340, flexShrink: 0 }}>
              {leaderboardPanel}
              {monteCarloPanel}
            </Box>
          )}
        </Box>
      )}

      {/* Drawer leaderboard on narrow screens */}
      <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Box sx={{ width: 320, p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="h6">Leaderboard</Typography>
            <IconButton onClick={() => setDrawerOpen(false)}><CloseIcon /></IconButton>
          </Box>
          {leaderboardPanel}
          {monteCarloPanel}
        </Box>
      </Drawer>
    </Container>
  );
}
