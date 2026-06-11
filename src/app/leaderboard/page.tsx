'use client';
import { Suspense, useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Container, Typography, Box, CircularProgress, FormControl, InputLabel,
  Select, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TableSortLabel, Paper, Chip, Accordion, AccordionSummary, AccordionDetails,
  Tooltip, Button, LinearProgress,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CasinoIcon from '@mui/icons-material/Casino';
import ChatIcon from '@mui/icons-material/Chat';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import CancelIcon from '@mui/icons-material/Cancel';
import { useAuth } from '@/hooks/useAuth';
import { useSelectedGroup } from '@/hooks/useSelectedGroup';
import { useTournamentSim } from '@/hooks/useTournamentSim';
import type { PlayerEntry } from '@/hooks/useTournamentSim';
import Link from 'next/link';
import UserLink from '@/components/common/UserLink';
import BracketLink from '@/components/common/BracketLink';
import AuthForm from '@/components/auth/AuthForm';
import ScoringBreakdownDialog from '@/components/common/ScoringBreakdownDialog';
import GroupChat from '@/components/common/GroupChat';
import BucketScoreTable from '@/components/common/BucketScoreTable';
import type {
  LeaderboardEntry, ScoringSettings, BracketData, TournamentResults, UserPrediction,
} from '@/types';
import type { TournamentPhase } from '@/lib/tournamentPhase';

interface GroupOption {
  id: string;
  name: string;
}

const TOTAL_GROUPS = 12;
const TOTAL_THIRD_PLACE = 8;
const TOTAL_KNOCKOUT = 32;

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
  const [selectedGroup, setSelectedGroup] = useSelectedGroup(initialGroupId || undefined);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [phase, setPhase] = useState<TournamentPhase>('pre-tournament');
  const [scoringSettings, setScoringSettings] = useState<ScoringSettings | null>(null);
  const [results, setResults] = useState<TournamentResults | null>(null);
  const [bracketData, setBracketData] = useState<BracketData | null>(null);
  const [loading, setLoading] = useState(false);
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
        setPhase(data.phase ?? 'pre-tournament');
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

  // Build PlayerEntry[] from leaderboard entries to feed the forecast worker.
  // Worker runs locally and computes per-user expected total/group/round scores.
  const playerEntries: PlayerEntry[] | undefined = useMemo(() => {
    if (!leaderboard.length || !leaderboard[0].prediction) return undefined;
    return leaderboard
      .filter((e) => e.prediction)
      .map((e) => ({
        key: `${e.username}|${e.bracket_name}`,
        group_predictions: e.prediction!.group_predictions,
        third_place_picks: e.prediction!.third_place_picks,
        knockout_picks: e.prediction!.knockout_picks,
      }));
  }, [leaderboard]);

  // Build actualResults shape from the loaded `results` data so the worker
  // locks in already-completed matches.
  const actualResults = useMemo(() => {
    if (!results) return undefined;
    const r = results as TournamentResults & { groupMatches?: Record<string, Array<{ teamA: string; teamB: string; scoreA: number; scoreB: number }>> };
    return {
      groupMatches: r.groupMatches,
      finalGroupStandings: r.groupStage
        ? Object.fromEntries(r.groupStage.groupResults.map((gr) => [gr.groupName, gr.order]))
        : undefined,
      finalAdvancing3rd: r.groupStage?.advancingThirdPlace,
      knockoutWinners: r.knockout,
    };
  }, [results]);

  const { results: simResults, running: simRunning, progress: simProgress, numSims: simNumSims, simsCompleted: simSimsCompleted } = useTournamentSim(playerEntries, scoringSettings ?? undefined, actualResults);

  // Map worker output to userKey-indexed lookups for BucketScoreTable.
  const expectedScoresByKey = useMemo(() => {
    const m: Record<string, number> = {};
    for (const ps of simResults?.playerScores ?? []) m[ps.key] = ps.avgScore;
    return m;
  }, [simResults]);
  const expectedGroupScoresByKey = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    for (const ps of simResults?.playerScores ?? []) m[ps.key] = ps.avgGroupScores;
    return m;
  }, [simResults]);
  const expectedRoundScoresByKey = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    for (const ps of simResults?.playerScores ?? []) m[ps.key] = ps.avgRoundScores;
    return m;
  }, [simResults]);
  const groupDistributionsByKey = useMemo(() => {
    const m: Record<string, Record<string, Record<number, number>>> = {};
    for (const ps of simResults?.playerScores ?? []) m[ps.key] = ps.groupScoreDistributions;
    return m;
  }, [simResults]);
  const roundDistributionsByKey = useMemo(() => {
    const m: Record<string, Record<string, Record<number, number>>> = {};
    for (const ps of simResults?.playerScores ?? []) m[ps.key] = ps.roundScoreDistributions;
    return m;
  }, [simResults]);
  const scoreDistributionsByKey = useMemo(() => {
    const m: Record<string, Record<number, number>> = {};
    for (const ps of simResults?.playerScores ?? []) m[ps.key] = ps.scoreDistribution;
    return m;
  }, [simResults]);

  // Pre-tournament completion table uses simple desc-by-completion order.
  const sorted = leaderboard.map((entry, i) => ({ ...entry, rank: i + 1 }));

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

  const isPreTournament = phase === 'pre-tournament';

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h4">Leaderboard</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {!isPreTournament && selectedGroup && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<CasinoIcon />}
              href={`/simulate?group=${selectedGroup}`}
            >
              What If?
            </Button>
          )}
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
      ) : isPreTournament ? (
        <CompletionTable entries={sorted} currentUsername={user.username} />
      ) : (
        <>
          {simRunning && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontStyle: 'italic' }}>
              {simSimsCompleted > 0
                ? `Refining expected scores… (${simProgress.toLocaleString()} of ${simNumSims.toLocaleString()} sims)`
                : `Computing expected scores…`}
            </Typography>
          )}
          <BucketScoreTable
            entries={leaderboard}
            currentUsername={user.username}
            expectedScoresByKey={expectedScoresByKey}
            expectedGroupScoresByKey={expectedGroupScoresByKey}
            expectedRoundScoresByKey={expectedRoundScoresByKey}
            groupDistributionsByKey={groupDistributionsByKey}
            roundDistributionsByKey={roundDistributionsByKey}
            scoreDistributionsByKey={scoreDistributionsByKey}
            onRowClick={setBreakdownEntry}
          />
        </>
      )}

      {selectedGroup && (
        <Accordion sx={{ mt: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <ChatIcon sx={{ mr: 1 }} />
            <Typography>Group Chat</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <GroupChat groupId={selectedGroup} currentUser={user.username} />
          </AccordionDetails>
        </Accordion>
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

function CompletionIcon({ filled, total }: { filled: number; total: number }) {
  if (filled >= total) return <CheckCircleIcon sx={{ color: 'success.main', fontSize: 18, verticalAlign: 'middle', mr: 0.5 }} />;
  if (filled > 0) return <WarningIcon sx={{ color: 'warning.main', fontSize: 18, verticalAlign: 'middle', mr: 0.5 }} />;
  return <CancelIcon sx={{ color: 'error.main', fontSize: 18, verticalAlign: 'middle', mr: 0.5 }} />;
}

interface RankedEntry extends LeaderboardEntry {
  rank: number;
}

function CompletionTable({ entries, currentUsername }: { entries: RankedEntry[]; currentUsername: string }) {
  return (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 'bold' }}>User</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }}>Bracket</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }}>Groups</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }}>3rd Place Picks</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }}>Knockout</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {entries.map((entry) => {
            const isCurrentUser = entry.username === currentUsername;
            const c = entry.completion ?? { groupsFilled: 0, thirdPlaceFilled: 0, knockoutFilled: 0 };
            const groupPct = (c.groupsFilled / TOTAL_GROUPS) * 100;
            const thirdPct = (c.thirdPlaceFilled / TOTAL_THIRD_PLACE) * 100;
            const knockoutPct = (c.knockoutFilled / TOTAL_KNOCKOUT) * 100;
            return (
              <TableRow
                key={`${entry.username}-${entry.bracket_name}`}
                sx={isCurrentUser ? { bgcolor: 'action.hover' } : undefined}
              >
                <TableCell>
                  <UserLink username={entry.username} isCurrentUser={isCurrentUser} />
                </TableCell>
                <TableCell>
                  <BracketLink username={entry.username} bracketName={entry.bracket_name} />
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CompletionIcon filled={c.groupsFilled} total={TOTAL_GROUPS} />
                    <Typography variant="body2">{c.groupsFilled}/{TOTAL_GROUPS}</Typography>
                    <LinearProgress
                      variant="determinate"
                      value={groupPct}
                      sx={{ flexGrow: 1, minWidth: 60, height: 6, borderRadius: 3 }}
                    />
                  </Box>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CompletionIcon filled={c.thirdPlaceFilled} total={TOTAL_THIRD_PLACE} />
                    <Typography variant="body2">{c.thirdPlaceFilled}/{TOTAL_THIRD_PLACE}</Typography>
                    <LinearProgress
                      variant="determinate"
                      value={thirdPct}
                      sx={{ flexGrow: 1, minWidth: 60, height: 6, borderRadius: 3 }}
                    />
                  </Box>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CompletionIcon filled={c.knockoutFilled} total={TOTAL_KNOCKOUT} />
                    <Typography variant="body2">{c.knockoutFilled}/{TOTAL_KNOCKOUT}</Typography>
                    <LinearProgress
                      variant="determinate"
                      value={knockoutPct}
                      sx={{ flexGrow: 1, minWidth: 60, height: 6, borderRadius: 3 }}
                    />
                  </Box>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

