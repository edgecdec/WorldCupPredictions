'use client';
import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Container, Typography, Box, CircularProgress, FormControl, InputLabel,
  Select, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TableSortLabel, Paper, Chip,
} from '@mui/material';
import { useAuth } from '@/hooks/useAuth';
import AuthForm from '@/components/auth/AuthForm';
import ScoringBreakdownDialog from '@/components/common/ScoringBreakdownDialog';
import type {
  LeaderboardEntry, ScoringSettings, BracketData, TournamentResults, UserPrediction,
} from '@/types';

interface GroupOption {
  id: string;
  name: string;
}

type SortKey = 'rank' | 'username' | 'bracket_name' | 'groupStageScore' | 'knockoutScore' | 'totalScore' | 'tiebreaker';

const SORTABLE_COLUMNS: { key: SortKey; label: string; align: 'left' | 'right' }[] = [
  { key: 'rank', label: '#', align: 'left' },
  { key: 'username', label: 'User', align: 'left' },
  { key: 'bracket_name', label: 'Bracket', align: 'left' },
  { key: 'groupStageScore', label: 'Group', align: 'right' },
  { key: 'knockoutScore', label: 'Knockout', align: 'right' },
  { key: 'totalScore', label: 'Total', align: 'right' },
  { key: 'tiebreaker', label: 'Tiebreaker', align: 'right' },
];

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>}>
      <LeaderboardContent />
    </Suspense>
  );
}

function LeaderboardContent() {
  const { user, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const initialGroupId = searchParams.get('group') ?? '';

  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [selectedGroup, setSelectedGroup] = useState(initialGroupId);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [scoringSettings, setScoringSettings] = useState<ScoringSettings | null>(null);
  const [results, setResults] = useState<TournamentResults | null>(null);
  const [bracketData, setBracketData] = useState<BracketData | null>(null);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('totalScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [breakdownEntry, setBreakdownEntry] = useState<LeaderboardEntry | null>(null);

  const loadGroups = useCallback(async () => {
    const res = await fetch('/api/groups');
    const data = await res.json();
    if (data.groups) {
      const opts: GroupOption[] = data.groups.map((g: { id: string; name: string }) => ({ id: g.id, name: g.name }));
      setGroups(opts);
      if (!selectedGroup && opts.length > 0) {
        setSelectedGroup(opts[0].id);
      }
    }
  }, [selectedGroup]);

  const loadLeaderboard = useCallback(async (groupId: string) => {
    if (!groupId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/leaderboard?group_id=${groupId}`);
      const data = await res.json();
      if (data.leaderboard) {
        setLeaderboard(data.leaderboard);
        setScoringSettings(data.scoring_settings);
        setResults(data.results ?? null);
        setBracketData(data.bracket_data ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadGroups();
  }, [user, loadGroups]);

  useEffect(() => {
    if (user && selectedGroup) loadLeaderboard(selectedGroup);
  }, [user, selectedGroup, loadLeaderboard]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'username' || key === 'bracket_name' || key === 'rank' ? 'asc' : 'desc');
    }
  };

  const rankedLeaderboard = leaderboard.map((entry, i) => ({ ...entry, rank: i + 1 }));

  const sorted = [...rankedLeaderboard].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const valA = a[sortKey];
    const valB = b[sortKey];
    if (valA == null && valB == null) return 0;
    if (valA == null) return 1;
    if (valB == null) return -1;
    if (typeof valA === 'string' && typeof valB === 'string') {
      return valA.localeCompare(valB) * dir;
    }
    return ((valA as number) - (valB as number)) * dir;
  });

  const buildPrediction = (entry: LeaderboardEntry): UserPrediction | null => {
    if (!entry.prediction) return null;
    const p = entry.prediction;
    return {
      id: p.id,
      user_id: p.user_id,
      tournament_id: '',
      bracket_name: p.bracket_name,
      group_predictions: p.group_predictions,
      third_place_picks: p.third_place_picks,
      knockout_picks: p.knockout_picks,
      tiebreaker: p.tiebreaker,
      submitted_at: '',
    };
  };

  if (authLoading) return null;
  if (!user) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Typography variant="h4" gutterBottom>Leaderboard</Typography>
        <AuthForm />
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h4">Leaderboard</Typography>
        {groups.length > 0 && (
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Group</InputLabel>
            <Select value={selectedGroup} label="Group" onChange={(e) => setSelectedGroup(e.target.value)}>
              {groups.map((g) => (
                <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
      ) : groups.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">Join a group to see the leaderboard.</Typography>
        </Paper>
      ) : leaderboard.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">No predictions in this group yet.</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {SORTABLE_COLUMNS.map((col) => (
                  <TableCell key={col.key} align={col.align} sx={{ fontWeight: 'bold' }}>
                    <TableSortLabel
                      active={sortKey === col.key}
                      direction={sortKey === col.key ? sortDir : 'asc'}
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                    </TableSortLabel>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((entry) => {
                const isCurrentUser = entry.username === user.username;
                return (
                  <TableRow
                    key={`${entry.username}-${entry.bracket_name}`}
                    sx={isCurrentUser ? { bgcolor: 'action.hover' } : undefined}
                  >
                    <TableCell>{entry.rank}</TableCell>
                    <TableCell>
                      {entry.username}
                      {isCurrentUser && <Chip label="You" size="small" sx={{ ml: 1 }} color="primary" variant="outlined" />}
                    </TableCell>
                    <TableCell>{entry.bracket_name}</TableCell>
                    <TableCell
                      align="right"
                      sx={{ cursor: 'pointer', '&:hover': { color: 'primary.main' } }}
                      onClick={() => setBreakdownEntry(entry)}
                    >
                      {entry.groupStageScore}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ cursor: 'pointer', '&:hover': { color: 'primary.main' } }}
                      onClick={() => setBreakdownEntry(entry)}
                    >
                      {entry.knockoutScore}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ cursor: 'pointer', fontWeight: 'bold', '&:hover': { color: 'primary.main' } }}
                      onClick={() => setBreakdownEntry(entry)}
                    >
                      {entry.totalScore}
                    </TableCell>
                    <TableCell align="right">{entry.tiebreaker ?? '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {breakdownEntry && scoringSettings && bracketData && (() => {
        const pred = buildPrediction(breakdownEntry);
        if (!pred) return null;
        return (
          <ScoringBreakdownDialog
            open
            onClose={() => setBreakdownEntry(null)}
            prediction={pred}
            results={results ?? {}}
            settings={scoringSettings}
            bracketData={bracketData}
          />
        );
      })()}
    </Container>
  );
}
