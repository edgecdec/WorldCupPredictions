'use client';
import { Suspense, useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Container, Typography, Box, CircularProgress, FormControl, InputLabel,
  Select, MenuItem, Paper, TextField, Chip, Card, CardContent, Stack,
  Accordion, AccordionSummary, AccordionDetails, Tooltip, Popover,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useAuth } from '@/hooks/useAuth';
import { useSelectedGroup } from '@/hooks/useSelectedGroup';
import AuthForm from '@/components/auth/AuthForm';
import PhaseGate from '@/components/common/PhaseGate';
import type {
  BracketData, TournamentResults, GroupPrediction, KnockoutMatchup,
  UserPrediction,
} from '@/types';

interface GroupOption { id: string; name: string }

interface PredictionWithUser extends UserPrediction {
  username: string;
}

export default function WhoPickedPage() {
  return (
    <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>}>
      <PhaseGate pathname="/whopicked">
        <WhoPickedContent />
      </PhaseGate>
    </Suspense>
  );
}

function WhoPickedContent() {
  const { user, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const initialGroupId = searchParams.get('group') ?? '';

  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [selectedGroup, setSelectedGroup] = useSelectedGroup(initialGroupId || undefined);
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

/**
 * For one group: tally per (team, position) how many users predicted that team
 * to finish in that slot, plus an "advance" count = picked 1st OR 2nd OR (picked 3rd
 * AND included in their third_place_picks).
 */
function buildGroupPickMatrix(
  groupName: string,
  teams: string[],
  predictions: PredictionWithUser[],
): Map<string, { pos: string[][]; advance: string[] }> {
  // team -> { pos: [users-who-picked-1st, ...4th], advance: users-who-have-them-advancing }
  const matrix = new Map<string, { pos: string[][]; advance: string[] }>();
  for (const team of teams) {
    matrix.set(team, { pos: [[], [], [], []], advance: [] });
  }
  for (const p of predictions) {
    const gp = p.group_predictions?.find((g: GroupPrediction) => g.groupName === groupName);
    if (!gp?.order) continue;
    for (let i = 0; i < 4; i++) {
      const team = gp.order[i];
      const entry = matrix.get(team);
      if (!entry) continue;
      entry.pos[i].push(p.username);
      const advances = i <= 1 || (i === 2 && (p.third_place_picks ?? []).includes(team));
      if (advances) entry.advance.push(p.username);
    }
  }
  return matrix;
}

function GroupPickCard({
  groupName, teams, predictions, actualOrder,
}: {
  groupName: string;
  teams: string[];
  predictions: PredictionWithUser[];
  actualOrder?: string[];
}) {
  const matrix = useMemo(
    () => buildGroupPickMatrix(groupName, teams, predictions),
    [groupName, teams, predictions],
  );
  const total = predictions.length;
  // Sort teams by descending advance %, mirroring the forecast table.
  const sortedTeams = useMemo(() => {
    return [...teams].sort((a, b) => {
      const advA = matrix.get(a)?.advance.length ?? 0;
      const advB = matrix.get(b)?.advance.length ?? 0;
      return advB - advA;
    });
  }, [teams, matrix]);

  return (
    <Card variant="outlined">
      <CardContent sx={{ pb: 1, '&:last-child': { pb: 1 } }}>
        <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
          Group {groupName}
          {actualOrder && (
            <Typography variant="caption" component="span" color="text.secondary" sx={{ ml: 1, fontWeight: 400 }}>
              (Actual: {actualOrder.join(' > ')})
            </Typography>
          )}
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ py: 0.25, px: 0.5, fontSize: '0.7rem' }}>Team</TableCell>
                <TableCell align="center" sx={{ py: 0.25, px: 0.25, fontSize: '0.7rem' }}>1st</TableCell>
                <TableCell align="center" sx={{ py: 0.25, px: 0.25, fontSize: '0.7rem' }}>2nd</TableCell>
                <TableCell align="center" sx={{ py: 0.25, px: 0.25, fontSize: '0.7rem' }}>3rd</TableCell>
                <TableCell align="center" sx={{ py: 0.25, px: 0.25, fontSize: '0.7rem' }}>4th</TableCell>
                <TableCell align="center" sx={{ py: 0.25, px: 0.25, fontSize: '0.75rem', fontWeight: 700 }}>Adv</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedTeams.map((team) => {
                const entry = matrix.get(team);
                if (!entry) return null;
                const actualPos = actualOrder?.indexOf(team);
                return (
                  <TableRow key={team}>
                    <TableCell sx={{ py: 0.25, px: 0.5, fontSize: '0.75rem', fontWeight: 600 }}>
                      {team}
                    </TableCell>
                    {entry.pos.map((users, posIdx) => (
                      <PickPctCell
                        key={posIdx}
                        users={users}
                        total={total}
                        label={`${team} — ${['1st','2nd','3rd','4th'][posIdx]}`}
                        isActual={actualPos === posIdx}
                      />
                    ))}
                    <PickPctCell
                      users={entry.advance}
                      total={total}
                      label={`${team} — Advances`}
                      isActual={actualPos !== undefined && actualPos <= 2}
                      bold
                    />
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
}

/**
 * Cell showing "% of users with this pick", with a hover popover listing
 * exactly which users.
 */
function PickPctCell({
  users, total, label, isActual, bold,
}: {
  users: string[];
  total: number;
  label: string;
  isActual?: boolean;
  bold?: boolean;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const count = users.length;
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const hasUsers = count > 0;

  return (
    <TableCell
      align="center"
      sx={{
        py: 0.25, px: 0.25,
        fontSize: bold ? '0.75rem' : '0.7rem',
        fontWeight: bold ? 700 : undefined,
        cursor: hasUsers ? 'pointer' : 'default',
        bgcolor: isActual ? 'success.main' : undefined,
        color: isActual ? 'success.contrastText' : (
          bold ? (pct >= 70 ? 'success.main' : pct >= 40 ? 'warning.main' : 'error.main') : undefined
        ),
        '&:hover': hasUsers ? { bgcolor: isActual ? 'success.dark' : 'action.hover' } : undefined,
      }}
      onMouseEnter={hasUsers ? (e) => setAnchor(e.currentTarget) : undefined}
      onMouseLeave={() => setAnchor(null)}
    >
      {pct}%
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        disableRestoreFocus
        sx={{ pointerEvents: 'none' }}
        slotProps={{ paper: { sx: { p: 1, maxWidth: 260 } } }}
      >
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5, textTransform: 'uppercase', fontSize: '0.6rem' }}>
          {label} — {count}/{total}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.4 }}>
          {users.map((u) => (
            <Chip key={u} label={u} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
          ))}
        </Box>
      </Popover>
    </TableCell>
  );
}

/** Knockout matchup pick bar — kept the bar style here since it's per-match (not table). */
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
