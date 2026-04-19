'use client';
import { useState, useEffect } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, CircularProgress, Chip,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import CloseIcon from '@mui/icons-material/Close';
import type { GroupTable } from '@/lib/espnSync';
import TeamFlag from '@/components/common/TeamFlag';

interface GroupStandingsProps {
  groupOrders: Record<string, string[]>;
  countryCodeMap?: Record<string, string>;
}

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
  // Same half: both top-2 or both bottom-2
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
  const [tables, setTables] = useState<GroupTable[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/scores?type=standings');
        if (!res.ok) return;
        const data = await res.json();
        setTables(data.standings ?? []);
      } catch { /* noop */ }
      finally { setLoading(false); }
    }
    load();
  }, []);

  if (loading) {
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
                    return (
                      <TableRow key={s.espnId}>
                        <TableCell sx={{ px: 0.5 }}>{i + 1}</TableCell>
                        <TableCell sx={{ px: 0.5, whiteSpace: 'nowrap' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {countryCodeMap[s.team] && <TeamFlag countryCode={countryCodeMap[s.team]} size={16} />}
                            {s.team}
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
