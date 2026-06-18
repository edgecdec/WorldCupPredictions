'use client';
import { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, CircularProgress, Chip, Tooltip,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import CloseIcon from '@mui/icons-material/Close';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import type { GroupTable } from '@/lib/espnSync';
import type { BracketData, LiveGame } from '@/types';
import TeamFlag from '@/components/common/TeamFlag';
import { computeLiveStandings } from '@/lib/liveStandings';

interface GroupStandingsProps {
  groupOrders: Record<string, string[]>;
  countryCodeMap?: Record<string, string>;
}

interface TournamentResp {
  ok: boolean;
  tournament?: {
    bracket_data: BracketData;
    results_data: {
      groupMatches?: Record<string, Array<{ teamA: string; teamB: string; scoreA: number; scoreB: number }>>;
    } | null;
  } | null;
}

interface ScoresResp {
  ok: boolean;
  games?: LiveGame[];
}

const POLL_MS = 30_000;

type MatchStatus = 'exact' | 'half' | 'wrong';

function getMatchStatus(
  teamName: string,
  livePos: number,
  predictedOrder: string[] | undefined,
): MatchStatus {
  if (!predictedOrder) return 'wrong';
  const predIdx = predictedOrder.indexOf(teamName);
  if (predIdx === -1) return 'wrong';
  if (predIdx === livePos) return 'exact';
  const liveHalf = livePos < 2 ? 'top' : 'bottom';
  const predHalf = predIdx < 2 ? 'top' : 'bottom';
  return liveHalf === predHalf ? 'half' : 'wrong';
}

function StatusIcon({ status }: { status: MatchStatus }) {
  if (status === 'exact') return <CheckCircleIcon fontSize="small" color="success" />;
  if (status === 'half') return <SwapVertIcon fontSize="small" color="warning" />;
  return <CloseIcon fontSize="small" color="error" />;
}

export default function GroupStandings({ groupOrders, countryCodeMap = {} }: GroupStandingsProps) {
  const [bracketData, setBracketData] = useState<BracketData | null>(null);
  const [completed, setCompleted] = useState<Record<string, Array<{ teamA: string; teamB: string; scoreA: number; scoreB: number }>>>({});
  const [liveGames, setLiveGames] = useState<LiveGame[]>([]);
  const [loading, setLoading] = useState(true);

  // Pre-compute team → group lookup once we have bracket data — used to
  // bucket in-progress games under their group.
  const teamToGroup = useMemo(() => {
    const m: Record<string, string> = {};
    for (const g of bracketData?.groups ?? []) {
      for (const t of g.teams) m[t.name] = g.name;
    }
    return m;
  }, [bracketData]);

  // Load tournament (one-shot — bracket + completed matches) and live scores
  // (poll). Standings are then computed from these two sources, which keeps
  // ordering consistent with the rest of the app and includes in-progress
  // goals that ESPN's /standings doesn't surface live.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/tournaments').then((r) => r.json() as Promise<TournamentResp>).then((d) => {
      if (cancelled) return;
      if (d.tournament) {
        setBracketData(d.tournament.bracket_data);
        setCompleted(d.tournament.results_data?.groupMatches ?? {});
      }
    }).catch(() => { /* noop */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadScores = async () => {
      try {
        const res = await fetch('/api/scores');
        if (!res.ok) return;
        const d = (await res.json()) as ScoresResp;
        if (!cancelled) setLiveGames(d.games ?? []);
      } catch { /* noop */ }
      finally { if (!cancelled) setLoading(false); }
    };
    loadScores();
    const t = setInterval(loadScores, POLL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const tables = useMemo<GroupTable[]>(() => {
    if (!bracketData) return [];
    const inProgress: Record<string, Array<{ teamA: string; teamB: string; scoreA: number; scoreB: number }>> = {};
    for (const g of liveGames) {
      if (g.state !== 'in') continue;
      if ((g.stage ?? 'group') !== 'group') continue;
      const gn = teamToGroup[g.home?.name];
      if (!gn || teamToGroup[g.away?.name] !== gn) continue;
      // Avoid double-counting if the DB already has this match recorded
      // (sync runs on a debounce so there can be brief overlap).
      const completedForGroup = completed[gn] ?? [];
      const dup = completedForGroup.some(
        (m) => (m.teamA === g.home.name && m.teamB === g.away.name) ||
               (m.teamA === g.away.name && m.teamB === g.home.name),
      );
      if (dup) continue;
      const sA = parseInt(g.home.score, 10) || 0;
      const sB = parseInt(g.away.score, 10) || 0;
      (inProgress[gn] ??= []).push({ teamA: g.home.name, teamB: g.away.name, scoreA: sA, scoreB: sB });
    }
    return computeLiveStandings(bracketData, completed, inProgress);
  }, [bracketData, completed, liveGames, teamToGroup]);

  // Set of teams currently in a live match — used to flag rows.
  const liveTeams = useMemo(() => {
    const s = new Set<string>();
    for (const g of liveGames) {
      if (g.state !== 'in') continue;
      if ((g.stage ?? 'group') !== 'group') continue;
      if (g.home?.name) s.add(g.home.name);
      if (g.away?.name) s.add(g.away.name);
    }
    return s;
  }, [liveGames]);

  if (loading || !bracketData) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (!tables.length) {
    return (
      <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
        No standings available yet.
      </Typography>
    );
  }

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
        gap: 2,
      }}
    >
      {tables.map((gt) => {
        const predicted = groupOrders[gt.groupName];
        return (
          <Paper key={gt.groupName} variant="outlined" sx={{ p: 1.5 }}>
            <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 0.5 }}>
              Group {gt.groupName}
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ px: 0.5, width: 28 }}>#</TableCell>
                    <TableCell sx={{ px: 0.5 }}>Team</TableCell>
                    <TableCell align="center" sx={{ px: 0.5 }}>Pts</TableCell>
                    <TableCell align="center" sx={{ px: 0.5 }}>W</TableCell>
                    <TableCell align="center" sx={{ px: 0.5 }}>D</TableCell>
                    <TableCell align="center" sx={{ px: 0.5 }}>L</TableCell>
                    <TableCell align="center" sx={{ px: 0.5 }}>GD</TableCell>
                    <TableCell align="center" sx={{ px: 0.5, width: 36 }}>Pick</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {gt.standings.map((s, i) => {
                    const status = getMatchStatus(s.team, i, predicted);
                    const isLive = liveTeams.has(s.team);
                    return (
                      <TableRow key={`${gt.groupName}-${s.team}`}>
                        <TableCell sx={{ px: 0.5 }}>{i + 1}</TableCell>
                        <TableCell sx={{ px: 0.5, whiteSpace: 'nowrap' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {countryCodeMap[s.team] && <TeamFlag countryCode={countryCodeMap[s.team]} size={16} />}
                            {s.team}
                            {isLive && (
                              <Tooltip title="Currently playing — score includes in-progress goals">
                                <FiberManualRecordIcon sx={{ color: 'success.main', fontSize: 10 }} />
                              </Tooltip>
                            )}
                            {predicted && (
                              <Chip
                                label={predicted.indexOf(s.team) + 1 || '?'}
                                size="small"
                                sx={{ ml: 0.5, height: 18, fontSize: '0.7rem' }}
                                variant="outlined"
                              />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell align="center" sx={{ px: 0.5, fontWeight: 'bold' }}>{s.points}</TableCell>
                        <TableCell align="center" sx={{ px: 0.5 }}>{s.wins}</TableCell>
                        <TableCell align="center" sx={{ px: 0.5 }}>{s.draws}</TableCell>
                        <TableCell align="center" sx={{ px: 0.5 }}>{s.losses}</TableCell>
                        <TableCell align="center" sx={{ px: 0.5 }}>{s.goalDifference > 0 ? `+${s.goalDifference}` : s.goalDifference}</TableCell>
                        <TableCell align="center" sx={{ px: 0.5 }}><StatusIcon status={status} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        );
      })}
    </Box>
  );
}
