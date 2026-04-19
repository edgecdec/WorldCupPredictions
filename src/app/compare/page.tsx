'use client';
import { Suspense, useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Container, Typography, Box, CircularProgress, FormControl, InputLabel,
  Select, MenuItem, Chip, Paper, OutlinedInput, Card, CardContent, Stack,
} from '@mui/material';
import { useAuth } from '@/hooks/useAuth';
import AuthForm from '@/components/auth/AuthForm';
import PhaseGate from '@/components/common/PhaseGate';
import type {
  LeaderboardEntry, BracketData, TournamentResults, GroupPrediction, KnockoutMatchup,
} from '@/types';

interface GroupOption { id: string; name: string }

const MAX_COMPARE = 4;
const USER_COLORS = ['#42a5f5', '#ef5350', '#66bb6a', '#ffa726'] as const;

export default function ComparePage() {
  return (
    <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>}>
      <PhaseGate pathname="/compare">
        <CompareContent />
      </PhaseGate>
    </Suspense>
  );
}

function CompareContent() {
  const { user, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const initialGroupId = searchParams.get('group') ?? '';

  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [selectedGroup, setSelectedGroup] = useState(initialGroupId);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [bracketData, setBracketData] = useState<BracketData | null>(null);
  const [results, setResults] = useState<TournamentResults | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const loadGroups = useCallback(async () => {
    const res = await fetch('/api/groups');
    const data = await res.json();
    if (data.groups) {
      const opts: GroupOption[] = data.groups.map((g: { id: string; name: string }) => ({ id: g.id, name: g.name }));
      setGroups(opts);
      if (!selectedGroup && opts.length > 0) setSelectedGroup(opts[0].id);
    }
  }, [selectedGroup]);

  const loadData = useCallback(async (groupId: string) => {
    if (!groupId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/leaderboard?group_id=${groupId}`);
      const data = await res.json();
      if (data.leaderboard) {
        setEntries(data.leaderboard);
        setBracketData(data.bracket_data ?? null);
        setResults(data.results ?? null);
        setSelectedUsers([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user) loadGroups(); }, [user, loadGroups]);
  useEffect(() => { if (user && selectedGroup) loadData(selectedGroup); }, [user, selectedGroup, loadData]);

  const handleUserSelect = (val: string | string[]) => {
    const arr = typeof val === 'string' ? val.split(',') : val;
    if (arr.length <= MAX_COMPARE) setSelectedUsers(arr);
  };

  const selected = useMemo(
    () => entries.filter((e) => selectedUsers.includes(entryKey(e))),
    [entries, selectedUsers],
  );

  if (authLoading) return null;
  if (!user) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Typography variant="h4" gutterBottom>Compare Predictions</Typography>
        <AuthForm />
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h4">Compare Predictions</Typography>
        {groups.length > 0 && (
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Group</InputLabel>
            <Select value={selectedGroup} label="Group" onChange={(e) => setSelectedGroup(e.target.value)}>
              {groups.map((g) => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
            </Select>
          </FormControl>
        )}
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
      ) : entries.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            {groups.length === 0 ? 'Join a group to compare predictions.' : 'No predictions in this group yet.'}
          </Typography>
        </Paper>
      ) : (
        <>
          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel>Select Users (up to {MAX_COMPARE})</InputLabel>
            <Select
              multiple
              value={selectedUsers}
              onChange={(e) => handleUserSelect(e.target.value)}
              input={<OutlinedInput label={`Select Users (up to ${MAX_COMPARE})`} />}
              renderValue={(sel) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {sel.map((key, i) => {
                    const entry = entries.find((e) => entryKey(e) === key);
                    return (
                      <Chip
                        key={key}
                        label={entry ? `${entry.username} — ${entry.bracket_name}` : key}
                        size="small"
                        sx={{ bgcolor: USER_COLORS[i % USER_COLORS.length], color: '#fff' }}
                      />
                    );
                  })}
                </Box>
              )}
            >
              {entries.map((e) => {
                const key = entryKey(e);
                return (
                  <MenuItem key={key} value={key} disabled={!selectedUsers.includes(key) && selectedUsers.length >= MAX_COMPARE}>
                    {e.username} — {e.bracket_name} ({e.totalScore} pts)
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>

          {selected.length > 0 && (
            <UserLegend entries={selected} />
          )}

          {selected.length > 0 && bracketData && (
            <GroupCompare entries={selected} bracketData={bracketData} results={results} />
          )}

          {selected.length > 0 && results?.knockoutBracket && (
            <KnockoutCompare entries={selected} matchups={results.knockoutBracket} knockoutResults={results.knockout} />
          )}
        </>
      )}
    </Container>
  );
}

function entryKey(e: LeaderboardEntry): string {
  return `${e.username}::${e.bracket_name}`;
}

function UserLegend({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
      {entries.map((e, i) => (
        <Chip
          key={entryKey(e)}
          label={`${e.username} — ${e.bracket_name} (${e.totalScore} pts)`}
          sx={{ bgcolor: USER_COLORS[i % USER_COLORS.length], color: '#fff', fontWeight: 'bold' }}
        />
      ))}
    </Box>
  );
}

function GroupCompare({
  entries,
  bracketData,
  results,
}: {
  entries: LeaderboardEntry[];
  bracketData: BracketData;
  results: TournamentResults | null;
}) {
  if (!bracketData.groups) return null;

  const resultMap = new Map<string, string[]>();
  if (results?.groupStage?.groupResults) {
    for (const gr of results.groupStage.groupResults) {
      resultMap.set(gr.groupName, [...gr.order]);
    }
  }

  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="h5" gutterBottom>Group Stage</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
        {bracketData.groups.map((group) => (
          <Card key={group.name} variant="outlined">
            <CardContent sx={{ pb: 1, '&:last-child': { pb: 1 } }}>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                Group {group.name}
              </Typography>
              <CompareGroupTable
                groupName={group.name}
                teams={group.teams.map((t) => t.name)}
                entries={entries}
                actualOrder={resultMap.get(group.name)}
              />
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  );
}

function CompareGroupTable({
  groupName,
  teams,
  entries,
  actualOrder,
}: {
  groupName: string;
  teams: string[];
  entries: LeaderboardEntry[];
  actualOrder?: string[];
}) {
  const predictions = entries.map((e) => {
    const gp = e.prediction?.group_predictions?.find((g: GroupPrediction) => g.groupName === groupName);
    return gp?.order ?? teams;
  });

  const positions = ['1st', '2nd', '3rd', '4th'];

  return (
    <Stack spacing={0}>
      {/* Header row */}
      <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
        <Box sx={{ width: 32 }} />
        {actualOrder && <Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="caption" fontWeight="bold" noWrap>Actual</Typography></Box>}
        {entries.map((e, i) => (
          <Box key={entryKey(e)} sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" fontWeight="bold" noWrap sx={{ color: USER_COLORS[i % USER_COLORS.length] }}>
              {e.username}
            </Typography>
          </Box>
        ))}
      </Box>
      {/* Position rows */}
      {positions.map((pos, posIdx) => (
        <Box key={pos} sx={{ display: 'flex', gap: 0.5, py: 0.25, borderTop: 1, borderColor: 'divider' }}>
          <Box sx={{ width: 32, display: 'flex', alignItems: 'center' }}>
            <Typography variant="caption" fontWeight="bold" color="text.secondary">{pos}</Typography>
          </Box>
          {actualOrder && (
            <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>
              <Typography variant="caption" noWrap>{actualOrder[posIdx] ?? '—'}</Typography>
            </Box>
          )}
          {predictions.map((pred, userIdx) => {
            const teamName = pred[posIdx];
            const indicator = getIndicator(teamName, posIdx, actualOrder);
            return (
              <Box key={userIdx} sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.25 }}>
                <Typography variant="caption" noWrap sx={{ color: USER_COLORS[userIdx % USER_COLORS.length] }}>
                  {teamName}
                </Typography>
                {indicator && <Typography component="span" sx={{ fontSize: '0.6rem' }}>{indicator}</Typography>}
              </Box>
            );
          })}
        </Box>
      ))}
    </Stack>
  );
}

function getIndicator(team: string, predictedPos: number, actualOrder?: string[]): string {
  if (!actualOrder) return '';
  const actualPos = actualOrder.indexOf(team);
  if (actualPos === -1) return '';
  if (actualPos === predictedPos) return '✅';
  const predictedTop2 = predictedPos < 2;
  const actualTop2 = actualPos < 2;
  if (predictedTop2 === actualTop2) return '🟡';
  return '❌';
}

function KnockoutCompare({
  entries,
  matchups,
  knockoutResults,
}: {
  entries: LeaderboardEntry[];
  matchups: KnockoutMatchup[];
  knockoutResults?: Record<string, string>;
}) {
  const roundOrder = [0, 1, 2, 3, 4, 5];
  const roundLabels = ['Round of 32', 'Round of 16', 'Quarterfinals', 'Semifinals', '3rd Place', 'Final'];

  const byRound = useMemo(() => {
    const map = new Map<number, KnockoutMatchup[]>();
    for (const m of matchups) {
      const arr = map.get(m.round) ?? [];
      arr.push(m);
      map.set(m.round, arr);
    }
    return map;
  }, [matchups]);

  return (
    <Box>
      <Typography variant="h5" gutterBottom>Knockout Stage</Typography>
      {roundOrder.map((round) => {
        const roundMatchups = byRound.get(round);
        if (!roundMatchups?.length) return null;
        return (
          <Box key={round} sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>{roundLabels[round]}</Typography>
            <Stack spacing={1}>
              {roundMatchups.map((m) => (
                <KnockoutMatchupCompare
                  key={m.id}
                  matchup={m}
                  entries={entries}
                  result={knockoutResults?.[m.id]}
                />
              ))}
            </Stack>
          </Box>
        );
      })}
    </Box>
  );
}

function KnockoutMatchupCompare({
  matchup,
  entries,
  result,
}: {
  matchup: KnockoutMatchup;
  entries: LeaderboardEntry[];
  result?: string;
}) {
  if (!matchup.teamA && !matchup.teamB) return null;

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ minWidth: 200 }}>
          <Typography variant="body2" fontWeight="bold">
            {matchup.teamA ?? 'TBD'} vs {matchup.teamB ?? 'TBD'}
          </Typography>
          {result && (
            <Typography variant="caption" color="success.main">Winner: {result}</Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          {entries.map((e, i) => {
            const pick = e.prediction?.knockout_picks?.[matchup.id];
            const isCorrect = result && pick === result;
            const isWrong = result && pick && pick !== result;
            return (
              <Chip
                key={entryKey(e)}
                label={pick ?? '—'}
                size="small"
                sx={{
                  bgcolor: isCorrect
                    ? 'success.main'
                    : isWrong
                      ? 'error.main'
                      : USER_COLORS[i % USER_COLORS.length],
                  color: '#fff',
                  fontWeight: 'bold',
                  fontSize: '0.7rem',
                  opacity: pick ? 1 : 0.5,
                }}
              />
            );
          })}
        </Box>
      </Box>
    </Paper>
  );
}
