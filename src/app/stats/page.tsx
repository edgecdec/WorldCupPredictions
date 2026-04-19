'use client';
import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Container, Typography, Box, CircularProgress, FormControl, InputLabel,
  Select, MenuItem, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TableSortLabel, Card, CardContent, Stack, Chip,
} from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import PercentIcon from '@mui/icons-material/Percent';
import BalanceIcon from '@mui/icons-material/Balance';
import { useAuth } from '@/hooks/useAuth';
import AuthForm from '@/components/auth/AuthForm';
import type { StatsResponse } from '@/app/api/stats/route';

interface GroupOption { id: string; name: string }

export default function StatsPage() {
  return (
    <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>}>
      <StatsContent />
    </Suspense>
  );
}

function StatsContent() {
  const { user, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const initialGroupId = searchParams.get('group') ?? '';

  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [selectedGroup, setSelectedGroup] = useState(initialGroupId);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(false);

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

  const loadStats = useCallback(async (groupId: string) => {
    if (!groupId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/stats?group_id=${groupId}`);
      const data = await res.json();
      setStats(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadGroups();
  }, [user, loadGroups]);

  useEffect(() => {
    if (user && selectedGroup) loadStats(selectedGroup);
  }, [user, selectedGroup, loadStats]);

  if (authLoading) return null;
  if (!user) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Typography variant="h4" gutterBottom>Stats</Typography>
        <AuthForm />
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h4">Stats</Typography>
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
      ) : !stats ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">Select a group to view stats.</Typography>
        </Paper>
      ) : (
        <Stack spacing={3}>
          <ChampionCard champions={stats.popularChampions} />
          <ContrarianCard contrarian={stats.contrarianPicks} currentUser={user.username} />
          <AccuracyCard accuracy={stats.accuracy} currentUser={user.username} />
          <ChalkCard chalkScores={stats.chalkScores} currentUser={user.username} />
        </Stack>
      )}
    </Container>
  );
}

function ChampionCard({ champions }: { champions: StatsResponse['popularChampions'] }) {
  if (champions.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <EmojiEventsIcon color="primary" /> Most Popular Champion
          </Typography>
          <Typography color="text.secondary">No champion picks yet.</Typography>
        </CardContent>
      </Card>
    );
  }

  const total = champions.reduce((s, c) => s + c.count, 0);

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <EmojiEventsIcon color="primary" /> Most Popular Champion
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={1}>
          {champions.map((c) => (
            <Chip
              key={c.team}
              label={`${c.team} (${c.count}/${total})`}
              color={c === champions[0] ? 'primary' : 'default'}
              variant={c === champions[0] ? 'filled' : 'outlined'}
            />
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

function ContrarianCard({ contrarian, currentUser }: { contrarian: StatsResponse['contrarianPicks']; currentUser: string }) {
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const sorted = [...contrarian].sort((a, b) => sortDir === 'desc' ? b.uniquePicks - a.uniquePicks : a.uniquePicks - b.uniquePicks);

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <TrendingDownIcon color="primary" /> Most Contrarian Brackets
        </Typography>
        {contrarian.length === 0 ? (
          <Typography color="text.secondary">No predictions yet.</Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>User</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Bracket</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    <TableSortLabel
                      active
                      direction={sortDir}
                      onClick={() => setSortDir(sortDir === 'desc' ? 'asc' : 'desc')}
                    >
                      Unique Picks
                    </TableSortLabel>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sorted.map((c) => (
                  <TableRow key={`${c.username}-${c.bracket_name}`} sx={c.username === currentUser ? { bgcolor: 'action.hover' } : undefined}>
                    <TableCell>
                      {c.username}
                      {c.username === currentUser && <Chip label="You" size="small" sx={{ ml: 1 }} color="primary" variant="outlined" />}
                    </TableCell>
                    <TableCell>{c.bracket_name}</TableCell>
                    <TableCell align="right">{c.uniquePicks}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  );
}

function AccuracyCard({ accuracy, currentUser }: { accuracy: StatsResponse['accuracy']; currentUser: string }) {
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const sorted = [...accuracy].sort((a, b) => sortDir === 'desc' ? b.accuracyPct - a.accuracyPct : a.accuracyPct - b.accuracyPct);
  const hasResults = accuracy.some((a) => a.totalGroups > 0 || a.totalKnockout > 0);

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <PercentIcon color="primary" /> Accuracy
        </Typography>
        {!hasResults ? (
          <Typography color="text.secondary">No results entered yet — accuracy will appear once the tournament starts.</Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>User</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Bracket</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>Groups</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>Knockout</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    <TableSortLabel
                      active
                      direction={sortDir}
                      onClick={() => setSortDir(sortDir === 'desc' ? 'asc' : 'desc')}
                    >
                      Accuracy %
                    </TableSortLabel>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sorted.map((a) => (
                  <TableRow key={`${a.username}-${a.bracket_name}`} sx={a.username === currentUser ? { bgcolor: 'action.hover' } : undefined}>
                    <TableCell>
                      {a.username}
                      {a.username === currentUser && <Chip label="You" size="small" sx={{ ml: 1 }} color="primary" variant="outlined" />}
                    </TableCell>
                    <TableCell>{a.bracket_name}</TableCell>
                    <TableCell align="right">{a.correctGroups}/{a.totalGroups}</TableCell>
                    <TableCell align="right">{a.correctKnockout}/{a.totalKnockout}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>{a.accuracyPct}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  );
}

function ChalkCard({ chalkScores, currentUser }: { chalkScores: StatsResponse['chalkScores']; currentUser: string }) {
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const sorted = [...chalkScores].sort((a, b) => sortDir === 'asc' ? a.chalkScore - b.chalkScore : b.chalkScore - a.chalkScore);

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <BalanceIcon color="primary" /> Chalk vs Upset-Heavy
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Lower score = more chalk (favorites predicted higher). Higher score = more upsets predicted.
        </Typography>
        {chalkScores.length === 0 ? (
          <Typography color="text.secondary">No predictions yet.</Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>User</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Bracket</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    <TableSortLabel
                      active
                      direction={sortDir}
                      onClick={() => setSortDir(sortDir === 'desc' ? 'asc' : 'desc')}
                    >
                      Chalk Score
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>Style</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sorted.map((c, i) => {
                  const isChalk = i < sorted.length / 2;
                  return (
                    <TableRow key={`${c.username}-${c.bracket_name}`} sx={c.username === currentUser ? { bgcolor: 'action.hover' } : undefined}>
                      <TableCell>
                        {c.username}
                        {c.username === currentUser && <Chip label="You" size="small" sx={{ ml: 1 }} color="primary" variant="outlined" />}
                      </TableCell>
                      <TableCell>{c.bracket_name}</TableCell>
                      <TableCell align="right">{c.chalkScore}</TableCell>
                      <TableCell align="right">
                        <Chip
                          label={isChalk ? 'Chalk' : 'Upset-Heavy'}
                          size="small"
                          color={isChalk ? 'success' : 'warning'}
                          variant="outlined"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  );
}
