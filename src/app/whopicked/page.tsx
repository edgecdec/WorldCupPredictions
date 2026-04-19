'use client';
import { Suspense, useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Container, Typography, Box, CircularProgress, FormControl, InputLabel,
  Select, MenuItem, Paper, TextField, Chip, Card, CardContent, Stack,
  Accordion, AccordionSummary, AccordionDetails, Tooltip,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useAuth } from '@/hooks/useAuth';
import AuthForm from '@/components/auth/AuthForm';
import type {
  BracketData, TournamentResults, GroupPrediction, KnockoutMatchup,
  UserPrediction,
} from '@/types';
import { KNOCKOUT_ROUNDS } from '@/types';

interface GroupOption { id: string; name: string }

interface PredictionWithUser extends UserPrediction {
  username: string;
}

export default function WhoPickedPage() {
  return (
    <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>}>
      <WhoPickedContent />
    </Suspense>
  );
}

function WhoPickedContent() {
  const { user, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const initialGroupId = searchParams.get('group') ?? '';

  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [selectedGroup, setSelectedGroup] = useState(initialGroupId);
  const [predictions, setPredictions] = useState<PredictionWithUser[]>([]);
  const [bracketData, setBracketData] = useState<BracketData | null>(null);
  const [results, setResults] = useState<TournamentResults | null>(null);
  const [search, setSearch] = useState('');
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
      const [picksRes, lbRes] = await Promise.all([
        fetch(`/api/picks?group_id=${groupId}`),
        fetch(`/api/leaderboard?group_id=${groupId}`),
      ]);
      const picksData = await picksRes.json();
      const lbData = await lbRes.json();
      if (picksData.predictions) setPredictions(picksData.predictions);
      if (lbData.bracket_data) setBracketData(lbData.bracket_data);
      if (lbData.results) setResults(lbData.results);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user) loadGroups(); }, [user, loadGroups]);
  useEffect(() => { if (user && selectedGroup) loadData(selectedGroup); }, [user, selectedGroup, loadData]);

  if (authLoading) return null;
  if (!user) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Typography variant="h4" gutterBottom>Who Picked Whom</Typography>
        <AuthForm />
      </Container>
    );
  }

  const hasPredictions = predictions.length > 0;

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h4">🔍 Who Picked Whom</Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          {hasPredictions && (
            <>
              <TextField size="small" placeholder="Search team…" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 180 }} />
              <Chip label={`${predictions.length} bracket${predictions.length !== 1 ? 's' : ''}`} size="small" variant="outlined" />
            </>
          )}
          {groups.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Group</InputLabel>
              <Select value={selectedGroup} label="Group" onChange={(e) => setSelectedGroup(e.target.value)}>
                {groups.map((g) => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
              </Select>
            </FormControl>
          )}
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
      ) : !selectedGroup ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">Select a group to see who picked whom.</Typography>
        </Paper>
      ) : !hasPredictions ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            {groups.length === 0 ? 'Join a group first.' : 'No predictions in this group yet.'}
          </Typography>
        </Paper>
      ) : (
        <>
          {bracketData && (
            <GroupStageSection
              predictions={predictions}
              bracketData={bracketData}
              results={results}
              search={search}
            />
          )}
          {results?.knockoutBracket && (
            <KnockoutSection
              predictions={predictions}
              matchups={results.knockoutBracket}
              knockoutResults={results.knockout}
              search={search}
            />
          )}
        </>
      )}
    </Container>
  );
}

// --- Group Stage Section ---

function GroupStageSection({
  predictions, bracketData, results, search,
}: {
  predictions: PredictionWithUser[];
  bracketData: BracketData;
  results: TournamentResults | null;
  search: string;
}) {
  if (!bracketData.groups) return null;

  const resultMap = useMemo(() => {
    const m = new Map<string, string[]>();
    if (results?.groupStage?.groupResults) {
      for (const gr of results.groupStage.groupResults) {
        m.set(gr.groupName, [...gr.order]);
      }
    }
    return m;
  }, [results]);

  const filteredGroups = useMemo(() => {
    if (!search) return bracketData.groups;
    const s = search.toLowerCase();
    return bracketData.groups.filter((g) =>
      g.teams.some((t) => t.name.toLowerCase().includes(s))
    );
  }, [bracketData.groups, search]);

  if (filteredGroups.length === 0) return null;

  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="h5" gutterBottom>Group Stage</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        {filteredGroups.map((group) => (
          <GroupPickCard
            key={group.name}
            groupName={group.name}
            teams={group.teams.map((t) => t.name)}
            predictions={predictions}
            actualOrder={resultMap.get(group.name)}
          />
        ))}
      </Box>
    </Box>
  );
}

function GroupPickCard({
  groupName, teams, predictions, actualOrder,
}: {
  groupName: string;
  teams: string[];
  predictions: PredictionWithUser[];
  actualOrder?: string[];
}) {
  const positions = ['1st', '2nd', '3rd', '4th'];

  // Build: for each position, which users picked which team
  const positionPicks = useMemo(() => {
    return positions.map((_, posIdx) => {
      const teamCounts = new Map<string, string[]>();
      for (const p of predictions) {
        const gp = p.group_predictions?.find((g: GroupPrediction) => g.groupName === groupName);
        const team = gp?.order?.[posIdx] ?? null;
        if (team) {
          const users = teamCounts.get(team) ?? [];
          users.push(p.username);
          teamCounts.set(team, users);
        }
      }
      // Sort by count descending
      return [...teamCounts.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([team, users]) => ({ team, users, count: users.length }));
    });
  }, [predictions, groupName]);

  return (
    <Card variant="outlined">
      <CardContent sx={{ pb: 1, '&:last-child': { pb: 1 } }}>
        <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
          Group {groupName}
        </Typography>
        {positions.map((pos, posIdx) => {
          const actual = actualOrder?.[posIdx];
          return (
            <Box key={pos} sx={{ mb: 1 }}>
              <Typography variant="caption" fontWeight="bold" color="text.secondary">
                {pos}{actual ? ` — Actual: ${actual}` : ''}
              </Typography>
              <Stack spacing={0.5} sx={{ mt: 0.25 }}>
                {positionPicks[posIdx].map(({ team, users, count }) => {
                  const pct = Math.round((count / predictions.length) * 100);
                  const isCorrect = actual === team;
                  return (
                    <PickBar
                      key={team}
                      team={team}
                      users={users}
                      count={count}
                      total={predictions.length}
                      pct={pct}
                      isCorrect={actual ? isCorrect : undefined}
                    />
                  );
                })}
              </Stack>
            </Box>
          );
        })}
      </CardContent>
    </Card>
  );
}

function PickBar({
  team, users, count, total, pct, isCorrect,
}: {
  team: string;
  users: string[];
  count: number;
  total: number;
  pct: number;
  isCorrect?: boolean;
}) {
  const barColor = isCorrect === true
    ? 'success.main'
    : isCorrect === false
      ? 'error.main'
      : 'primary.main';

  return (
    <Box sx={{ position: 'relative', borderRadius: 1, overflow: 'hidden', bgcolor: 'action.hover', px: 1, py: 0.5 }}>
      <Box
        sx={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${(count / total) * 100}%`,
          bgcolor: barColor, opacity: 0.15,
        }}
      />
      <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="body2" fontWeight={600} sx={{ minWidth: 100, fontSize: '0.8rem' }}>
          {team}
        </Typography>
        <Chip label={`${count} (${pct}%)`} size="small" sx={{ height: 20, fontSize: '0.7rem' }} />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {users.map((u) => (
            <Tooltip key={u} title={u}>
              <Chip label={u} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
            </Tooltip>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

// --- Knockout Section ---

const ROUND_LABELS = ['Round of 32', 'Round of 16', 'Quarterfinals', 'Semifinals', '3rd Place', 'Final'];

function KnockoutSection({
  predictions, matchups, knockoutResults, search,
}: {
  predictions: PredictionWithUser[];
  matchups: KnockoutMatchup[];
  knockoutResults?: Record<string, string>;
  search: string;
}) {
  const byRound = useMemo(() => {
    const map = new Map<number, KnockoutMatchup[]>();
    for (const m of matchups) {
      const arr = map.get(m.round) ?? [];
      arr.push(m);
      map.set(m.round, arr);
    }
    return map;
  }, [matchups]);

  const roundOrder = [5, 4, 3, 2, 1, 0]; // Show Final first

  return (
    <Box>
      <Typography variant="h5" gutterBottom>Knockout Stage</Typography>
      {roundOrder.map((round) => {
        const roundMatchups = byRound.get(round);
        if (!roundMatchups?.length) return null;

        const filtered = search
          ? roundMatchups.filter((m) => {
              const s = search.toLowerCase();
              return (m.teamA?.toLowerCase().includes(s) || m.teamB?.toLowerCase().includes(s));
            })
          : roundMatchups;

        if (filtered.length === 0) return null;

        return (
          <Accordion key={round} defaultExpanded={round >= 3}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography fontWeight={700}>{ROUND_LABELS[round]}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1}>
                {filtered.map((m) => (
                  <KnockoutMatchupCard
                    key={m.id}
                    matchup={m}
                    predictions={predictions}
                    result={knockoutResults?.[m.id]}
                  />
                ))}
              </Stack>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
}

function KnockoutMatchupCard({
  matchup, predictions, result,
}: {
  matchup: KnockoutMatchup;
  predictions: PredictionWithUser[];
  result?: string;
}) {
  if (!matchup.teamA && !matchup.teamB) return null;

  // Build pick distribution
  const pickDist = useMemo(() => {
    const dist = new Map<string, string[]>();
    for (const p of predictions) {
      const pick = p.knockout_picks?.[matchup.id];
      if (pick) {
        const users = dist.get(pick) ?? [];
        users.push(p.username);
        dist.set(pick, users);
      }
    }
    return [...dist.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([team, users]) => ({ team, users, count: users.length }));
  }, [predictions, matchup.id]);

  const totalPicks = pickDist.reduce((sum, d) => sum + d.count, 0);

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="body2" fontWeight="bold">
          {matchup.teamA ?? 'TBD'} vs {matchup.teamB ?? 'TBD'}
        </Typography>
        {result && (
          <Chip label={`Winner: ${result}`} size="small" color="success" sx={{ fontSize: '0.7rem' }} />
        )}
      </Box>
      {pickDist.length === 0 ? (
        <Typography variant="caption" color="text.secondary">No picks yet</Typography>
      ) : (
        <Stack spacing={0.5}>
          {pickDist.map(({ team, users, count }) => {
            const pct = totalPicks > 0 ? Math.round((count / totalPicks) * 100) : 0;
            const isCorrect = result ? team === result : undefined;
            return (
              <PickBar
                key={team}
                team={team}
                users={users}
                count={count}
                total={totalPicks}
                pct={pct}
                isCorrect={isCorrect}
              />
            );
          })}
        </Stack>
      )}
    </Paper>
  );
}
