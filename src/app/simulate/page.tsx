'use client';
import { useState, useMemo, useEffect } from 'react';
import {
  Container, Typography, Box, LinearProgress, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Tooltip, Grid, Chip,
  Tabs, Tab, IconButton, Alert,
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useAuth } from '@/hooks/useAuth';
import { useTournamentSim, GROUPS } from '@/hooks/useTournamentSim';
import type { BracketSlotResult, PlayerEntry } from '@/hooks/useTournamentSim';
import AuthForm from '@/components/auth/AuthForm';
import TeamFlag from '@/components/common/TeamFlag';
import { PELE_RATINGS } from '@/lib/peleRatings';
import type { ScoringSettings, GroupPrediction } from '@/types';
import { DEFAULT_SCORING } from '@/types';

const GROUP_NAMES = Object.keys(GROUPS);
const TAB_GROUPS = 0;
const TAB_BRACKET = 1;
const TAB_CHAMPION = 2;

function getCountryCode(team: string): string | undefined {
  const CODES: Record<string, string> = {
    Mexico: 'mx', 'South Africa': 'za', 'South Korea': 'kr', Czechia: 'cz',
    Canada: 'ca', 'Bosnia and Herzegovina': 'ba', Qatar: 'qa', Switzerland: 'ch',
    Brazil: 'br', Morocco: 'ma', Haiti: 'ht', Scotland: 'gb-sct',
    USA: 'us', Paraguay: 'py', Australia: 'au', Turkiye: 'tr',
    Germany: 'de', Curacao: 'cw', 'Ivory Coast': 'ci', Ecuador: 'ec',
    Netherlands: 'nl', Japan: 'jp', Sweden: 'se', Tunisia: 'tn',
    Belgium: 'be', Egypt: 'eg', Iran: 'ir', 'New Zealand': 'nz',
    Spain: 'es', 'Cape Verde': 'cv', 'Saudi Arabia': 'sa', Uruguay: 'uy',
    France: 'fr', Senegal: 'sn', Norway: 'no', Iraq: 'iq',
    Argentina: 'ar', Algeria: 'dz', Austria: 'at', Jordan: 'jo',
    Portugal: 'pt', 'DR Congo': 'cd', Uzbekistan: 'uz', Colombia: 'co',
    England: 'gb-eng', Croatia: 'hr', Ghana: 'gh', Panama: 'pa',
  };
  return CODES[team];
}

function pct(count: number, total: number): string {
  return `${Math.round((count / total) * 100)}%`;
}

function pctNum(count: number, total: number): number {
  return Math.round((count / total) * 100);
}

function SlotTooltip({ slot, numSims }: { slot: BracketSlotResult; numSims: number }) {
  const top = slot.teams.slice(0, 10);
  return (
    <Box sx={{ p: 0.5 }}>
      {top.map((t) => (
        <Box key={t.team} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.25 }}>
          <TeamFlag countryCode={getCountryCode(t.team) ?? ''} size={14} />
          <Typography variant="caption" sx={{ flex: 1 }}>{t.team}</Typography>
          <Typography variant="caption" fontWeight="bold">{pct(t.count, numSims)}</Typography>
        </Box>
      ))}
      {slot.teams.length > 10 && (
        <Typography variant="caption" color="text.secondary">+{slot.teams.length - 10} more</Typography>
      )}
    </Box>
  );
}

function BracketSlot({ slot, numSims }: { slot: BracketSlotResult | undefined; numSims: number }) {
  if (!slot || slot.teams.length === 0) {
    return <Box sx={{ p: 1, border: 1, borderColor: 'divider', borderRadius: 1, minWidth: 140, opacity: 0.5 }}>
      <Typography variant="caption" color="text.secondary">TBD</Typography>
    </Box>;
  }
  const top = slot.teams[0];
  const percentage = pctNum(top.count, numSims);
  return (
    <Tooltip title={<SlotTooltip slot={slot} numSims={numSims} />} arrow placement="top">
      <Box sx={{
        p: 0.75, border: 1, borderColor: 'divider', borderRadius: 1, minWidth: 140,
        cursor: 'pointer', '&:hover': { bgcolor: 'action.hover', borderColor: 'primary.main' },
        display: 'flex', alignItems: 'center', gap: 0.75,
      }}>
        <TeamFlag countryCode={getCountryCode(top.team) ?? ''} size={18} />
        <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }} noWrap>{top.team}</Typography>
        <Chip label={`${percentage}%`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
      </Box>
    </Tooltip>
  );
}

interface SimApiEntry {
  username: string;
  bracket_name: string;
  group_predictions: GroupPrediction[];
  third_place_picks: string[];
  knockout_picks: Record<string, string>;
}

export default function SimulatePage() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState(TAB_GROUPS);
  const [tournamentStarted, setTournamentStarted] = useState(false);
  const [players, setPlayers] = useState<PlayerEntry[] | undefined>(undefined);
  const [scoring, setScoring] = useState<ScoringSettings>(DEFAULT_SCORING);

  useEffect(() => {
    fetch('/api/tournaments')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.tournament?.lock_time_groups) {
          setTournamentStarted(new Date() >= new Date(d.tournament.lock_time_groups));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch('/api/simulate?group_id=everyone')
      .then((r) => r.json())
      .then((d) => {
        if (d.entries) {
          const mapped: PlayerEntry[] = (d.entries as SimApiEntry[])
            .filter((e) => e.group_predictions.length > 0)
            .map((e) => ({
              key: `${e.username}|${e.bracket_name}`,
              group_predictions: e.group_predictions,
              third_place_picks: e.third_place_picks,
              knockout_picks: e.knockout_picks,
            }));
          setPlayers(mapped.length > 0 ? mapped : undefined);
        }
        if (d.scoring) setScoring(d.scoring);
      })
      .catch(() => {});
  }, [user]);

  const { results, progress, running, numSims, rerun } = useTournamentSim(players, scoring);

  const slotMap = useMemo(() => {
    if (!results) return new Map<string, BracketSlotResult>();
    const map = new Map<string, BracketSlotResult>();
    for (const slot of results.bracketSlots) {
      map.set(slot.slotId, slot);
    }
    return map;
  }, [results]);

  if (authLoading) return null;
  if (!user) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Typography variant="h4" gutterBottom>Tournament Forecast</Typography>
        <AuthForm />
      </Container>
    );
  }

  if (!tournamentStarted && !user.is_admin) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Alert icon={<LockIcon />} severity="info" sx={{ mt: 2 }}>
          The tournament forecast will be available once the group stage begins on June 11.
          Check back then to see simulation-powered probabilities for every team and match!
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 2, mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="h5">🔮 Tournament Forecast</Typography>
        <Chip
          label="Powered by PELE"
          size="small"
          variant="outlined"
          sx={{ fontSize: '0.7rem' }}
        />
        <IconButton size="small" onClick={rerun} disabled={running}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {running
          ? `Simulating ${numSims.toLocaleString()} tournaments...`
          : `Based on ${numSims.toLocaleString()} simulated tournaments using Nate Silver's PELE ratings.`}
      </Typography>

      {running && (
        <LinearProgress variant="determinate" value={(progress / numSims) * 100} sx={{ mb: 2, height: 6, borderRadius: 3 }} />
      )}

      {results && (
        <>
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
          >
            <Tab label="Group Stage" />
            <Tab label="Knockout Bracket" />
            <Tab label="Champion Odds" />
          </Tabs>

          {activeTab === TAB_GROUPS && (
            <Grid container spacing={2}>
              {GROUP_NAMES.map((g) => {
                const groupData = results.groupResults[g];
                if (!groupData) return null;
                const sorted = [...groupData].sort((a, b) => b.advance - a.advance);
                return (
                  <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={g}>
                    <Paper sx={{ p: 1.5 }}>
                      <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 0.5 }}>Group {g}</Typography>
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ py: 0.25, px: 0.5 }}>Team</TableCell>
                              <TableCell align="center" sx={{ py: 0.25, px: 0.5 }}>1st</TableCell>
                              <TableCell align="center" sx={{ py: 0.25, px: 0.5 }}>2nd</TableCell>
                              <TableCell align="center" sx={{ py: 0.25, px: 0.5 }}>3rd</TableCell>
                              <TableCell align="center" sx={{ py: 0.25, px: 0.5 }}>4th</TableCell>
                              <TableCell align="center" sx={{ py: 0.25, px: 0.5, fontWeight: 700 }}>Adv</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {sorted.map((t) => (
                              <TableRow key={t.team}>
                                <TableCell sx={{ py: 0.25, px: 0.5 }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <TeamFlag countryCode={getCountryCode(t.team) ?? ''} size={16} />
                                    <Typography variant="body2" noWrap sx={{ fontSize: '0.75rem', maxWidth: 100 }}>{t.team}</Typography>
                                  </Box>
                                </TableCell>
                                <TableCell align="center" sx={{ py: 0.25, px: 0.5, fontSize: '0.7rem' }}>{pct(t.pos[0], numSims)}</TableCell>
                                <TableCell align="center" sx={{ py: 0.25, px: 0.5, fontSize: '0.7rem' }}>{pct(t.pos[1], numSims)}</TableCell>
                                <TableCell align="center" sx={{ py: 0.25, px: 0.5, fontSize: '0.7rem' }}>{pct(t.pos[2], numSims)}</TableCell>
                                <TableCell align="center" sx={{ py: 0.25, px: 0.5, fontSize: '0.7rem' }}>{pct(t.pos[3], numSims)}</TableCell>
                                <TableCell align="center" sx={{ py: 0.25, px: 0.5, fontSize: '0.75rem', fontWeight: 700, color: pctNum(t.advance, numSims) >= 70 ? 'success.main' : pctNum(t.advance, numSims) >= 40 ? 'warning.main' : 'error.main' }}>
                                  {pct(t.advance, numSims)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Paper>
                  </Grid>
                );
              })}
            </Grid>
          )}

          {activeTab === TAB_BRACKET && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Hover over any slot to see the full list of teams and their probabilities.
              </Typography>
              {['R32', 'R16', 'QF', 'SF', 'FINAL'].map((round) => {
                const roundSlots = results.bracketSlots
                  .filter((s) => s.slotId.startsWith(round) && s.slotId.endsWith('-W'))
                  .sort((a, b) => {
                    const numA = parseInt(a.slotId.split('-')[1]) || 0;
                    const numB = parseInt(b.slotId.split('-')[1]) || 0;
                    return numA - numB;
                  });
                if (roundSlots.length === 0) return null;
                const label = round === 'R32' ? 'Round of 32' : round === 'R16' ? 'Round of 16' : round === 'QF' ? 'Quarterfinals' : round === 'SF' ? 'Semifinals' : 'Final';
                return (
                  <Box key={round} sx={{ mb: 3 }}>
                    <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>{label}</Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {roundSlots.map((slot) => (
                        <BracketSlot key={slot.slotId} slot={slot} numSims={numSims} />
                      ))}
                    </Box>
                  </Box>
                );
              })}
              {/* 3rd place */}
              {(() => {
                const thirdSlot = results.bracketSlots.find(s => s.slotId === '3RD-W');
                if (!thirdSlot) return null;
                return (
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>3rd Place Match</Typography>
                    <BracketSlot slot={thirdSlot} numSims={numSims} />
                  </Box>
                );
              })()}
            </Box>
          )}

          {activeTab === TAB_CHAMPION && (
            <Box sx={{ maxWidth: 600 }}>
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ py: 0.5 }}>#</TableCell>
                      <TableCell sx={{ py: 0.5 }}>Team</TableCell>
                      <TableCell align="right" sx={{ py: 0.5 }}>Win %</TableCell>
                      <TableCell align="right" sx={{ py: 0.5 }}>PELE</TableCell>
                      <TableCell sx={{ py: 0.5, width: '40%' }}></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {results.championProbs.slice(0, 30).map((t, i) => (
                      <TableRow key={t.team}>
                        <TableCell sx={{ py: 0.5 }}>{i + 1}</TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TeamFlag countryCode={getCountryCode(t.team) ?? ''} size={20} />
                            <Typography variant="body2">{t.team}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="right" sx={{ py: 0.5, fontWeight: 700 }}>{t.pct}%</TableCell>
                        <TableCell align="right" sx={{ py: 0.5, color: 'text.secondary', fontSize: '0.8rem' }}>
                          {PELE_RATINGS[t.team]?.pele.toFixed(0)}
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          <Box sx={{ width: '100%', bgcolor: 'action.hover', borderRadius: 1, height: 8 }}>
                            <Box sx={{ width: `${Math.min(t.pct * 5, 100)}%`, bgcolor: 'primary.main', borderRadius: 1, height: '100%' }} />
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          {/* Expected Standings */}
          {results.playerScores && results.playerScores.length > 0 && (
            <Paper sx={{ p: 2, mt: 3 }}>
              <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
                Expected Standings
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Based on {numSims.toLocaleString()} simulated tournaments, here is how each player&apos;s picks are expected to perform.
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ py: 0.5, px: 1 }}>#</TableCell>
                      <TableCell sx={{ py: 0.5, px: 1 }}>Player</TableCell>
                      <TableCell align="right" sx={{ py: 0.5, px: 1 }}>Avg Score</TableCell>
                      <TableCell align="right" sx={{ py: 0.5, px: 1 }}>Avg Rank</TableCell>
                      <TableCell align="right" sx={{ py: 0.5, px: 1 }}>Win %</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {results.playerScores.map((p, i) => {
                      const [username, bracketName] = p.key.split('|');
                      const isCurrentUser = username === user?.username;
                      return (
                        <TableRow key={p.key} sx={isCurrentUser ? { bgcolor: 'action.selected' } : undefined}>
                          <TableCell sx={{ py: 0.5, px: 1 }}>{i + 1}</TableCell>
                          <TableCell sx={{ py: 0.5, px: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: isCurrentUser ? 700 : 400 }}>
                              {username}{bracketName ? ` — ${bracketName}` : ''}
                              {isCurrentUser && <Chip label="You" size="small" sx={{ ml: 0.5, height: 18, fontSize: '0.65rem' }} />}
                            </Typography>
                          </TableCell>
                          <TableCell align="right" sx={{ py: 0.5, px: 1, fontWeight: 700 }}>{p.avgScore.toFixed(1)}</TableCell>
                          <TableCell align="right" sx={{ py: 0.5, px: 1 }}>{p.avgRank.toFixed(1)}</TableCell>
                          <TableCell align="right" sx={{ py: 0.5, px: 1, color: p.winPct > 0 ? 'success.main' : 'text.secondary', fontWeight: p.winPct > 0 ? 700 : 400 }}>
                            {p.winPct > 0 ? `${p.winPct}%` : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}
        </>
      )}
    </Container>
  );
}
