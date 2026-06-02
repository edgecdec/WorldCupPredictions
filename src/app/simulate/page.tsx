'use client';
import { useState, useMemo, useEffect } from 'react';
import {
  Container, Typography, Box, LinearProgress, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Grid, Chip,
  Tabs, Tab, IconButton,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useAuth } from '@/hooks/useAuth';
import { useTournamentSim, GROUPS } from '@/hooks/useTournamentSim';
import type { PlayerEntry } from '@/hooks/useTournamentSim';
import { useSelectedGroup } from '@/hooks/useSelectedGroup';
import AuthForm from '@/components/auth/AuthForm';
import TeamFlag from '@/components/common/TeamFlag';
import ForecastBracket from '@/components/bracket/ForecastBracket';
import { PELE_RATINGS } from '@/lib/peleRatings';
import type { ScoringSettings, GroupPrediction } from '@/types';
import { DEFAULT_SCORING } from '@/types';
import { FormControl, InputLabel, Select, MenuItem } from '@mui/material';

const GROUP_NAMES = Object.keys(GROUPS);
const TAB_GROUPS = 0;
const TAB_BRACKET = 1;
const TAB_TEAM_OUTLOOK = 2;

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

interface TeamRoundRow {
  team: string;
  reachR32: number;
  reachR16: number;
  reachQF: number;
  reachSF: number;
  reachFinal: number;
  champion: number;
}

function computeTeamOutlook(
  bracketSlots: Array<{ slotId: string; teams: Array<{ team: string; count: number }> }>,
  advanceProbs: Array<{ team: string; pct: number }>,
  championProbs: Array<{ team: string; pct: number }>,
  numSims: number,
): TeamRoundRow[] {
  // Reach R32 = advance from group stage (top 2 + best 3rd)
  const r32Map = new Map(advanceProbs.map((t) => [t.team, t.pct]));
  const champMap = new Map(championProbs.map((t) => [t.team, t.pct]));

  // Reach R16 = won an R32 match → appears in any R32-N-W slot
  // Reach QF = won an R16 match → R16-N-W
  // Reach SF = won a QF match → QF-N-W
  // Reach Final = won a SF match → appears in FINAL-A or FINAL-B
  const reachR16: Record<string, number> = {};
  const reachQF: Record<string, number> = {};
  const reachSF: Record<string, number> = {};
  const reachFinal: Record<string, number> = {};

  for (const slot of bracketSlots) {
    if (slot.slotId.match(/^R32-\d+-W$/)) {
      for (const t of slot.teams) reachR16[t.team] = (reachR16[t.team] ?? 0) + t.count;
    } else if (slot.slotId.match(/^R16-\d+-W$/)) {
      for (const t of slot.teams) reachQF[t.team] = (reachQF[t.team] ?? 0) + t.count;
    } else if (slot.slotId.match(/^QF-\d+-W$/)) {
      for (const t of slot.teams) reachSF[t.team] = (reachSF[t.team] ?? 0) + t.count;
    } else if (slot.slotId === 'FINAL-A' || slot.slotId === 'FINAL-B') {
      for (const t of slot.teams) reachFinal[t.team] = (reachFinal[t.team] ?? 0) + t.count;
    }
  }

  const allTeams = new Set<string>();
  for (const t of advanceProbs) allTeams.add(t.team);
  Object.keys(reachR16).forEach((t) => allTeams.add(t));

  const rows: TeamRoundRow[] = [];
  for (const team of allTeams) {
    rows.push({
      team,
      reachR32: r32Map.get(team) ?? 0,
      reachR16: ((reachR16[team] ?? 0) / numSims) * 100,
      reachQF: ((reachQF[team] ?? 0) / numSims) * 100,
      reachSF: ((reachSF[team] ?? 0) / numSims) * 100,
      reachFinal: ((reachFinal[team] ?? 0) / numSims) * 100,
      champion: champMap.get(team) ?? 0,
    });
  }
  rows.sort((a, b) => b.champion - a.champion || b.reachFinal - a.reachFinal || b.reachSF - a.reachSF);
  return rows;
}

function TeamOutlookTable({ bracketSlots, advanceProbs, championProbs, numSims }: {
  bracketSlots: Array<{ slotId: string; teams: Array<{ team: string; count: number }> }>;
  advanceProbs: Array<{ team: string; pct: number }>;
  championProbs: Array<{ team: string; pct: number }>;
  numSims: number;
}) {
  const rows = useMemo(
    () => computeTeamOutlook(bracketSlots, advanceProbs, championProbs, numSims),
    [bracketSlots, advanceProbs, championProbs, numSims],
  );

  const fmt = (n: number) => n >= 0.05 ? n.toFixed(1) : '<0.1';
  const cellColor = (n: number) => {
    if (n >= 70) return 'success.main';
    if (n >= 40) return 'warning.main';
    if (n >= 10) return 'text.primary';
    return 'text.secondary';
  };

  return (
    <Paper sx={{ overflow: 'auto' }}>
      <Typography variant="body2" color="text.secondary" sx={{ p: 2, pb: 1 }}>
        For each team, the probability of reaching each tournament round across {numSims.toLocaleString()} simulations.
      </Typography>
      <TableContainer>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ py: 0.5 }}>Team</TableCell>
              <TableCell align="right" sx={{ py: 0.5 }}>R32</TableCell>
              <TableCell align="right" sx={{ py: 0.5 }}>R16</TableCell>
              <TableCell align="right" sx={{ py: 0.5 }}>QF</TableCell>
              <TableCell align="right" sx={{ py: 0.5 }}>SF</TableCell>
              <TableCell align="right" sx={{ py: 0.5 }}>Final</TableCell>
              <TableCell align="right" sx={{ py: 0.5, fontWeight: 700 }}>Champion</TableCell>
              <TableCell align="right" sx={{ py: 0.5, color: 'text.secondary' }}>PELE</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.team} hover>
                <TableCell sx={{ py: 0.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TeamFlag countryCode={getCountryCode(r.team) ?? ''} size={18} />
                    <Typography variant="body2">{r.team}</Typography>
                  </Box>
                </TableCell>
                <TableCell align="right" sx={{ py: 0.5, color: cellColor(r.reachR32) }}>{fmt(r.reachR32)}%</TableCell>
                <TableCell align="right" sx={{ py: 0.5, color: cellColor(r.reachR16) }}>{fmt(r.reachR16)}%</TableCell>
                <TableCell align="right" sx={{ py: 0.5, color: cellColor(r.reachQF) }}>{fmt(r.reachQF)}%</TableCell>
                <TableCell align="right" sx={{ py: 0.5, color: cellColor(r.reachSF) }}>{fmt(r.reachSF)}%</TableCell>
                <TableCell align="right" sx={{ py: 0.5, color: cellColor(r.reachFinal) }}>{fmt(r.reachFinal)}%</TableCell>
                <TableCell align="right" sx={{ py: 0.5, fontWeight: 700, color: cellColor(r.champion) }}>{fmt(r.champion)}%</TableCell>
                <TableCell align="right" sx={{ py: 0.5, color: 'text.secondary', fontSize: '0.75rem' }}>
                  {PELE_RATINGS[r.team]?.pele.toFixed(0)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
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
  const [groupId, setGroupId] = useSelectedGroup('everyone');
  const [userGroups, setUserGroups] = useState<Array<{ id: string; name: string }>>([]);

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
    fetch('/api/groups')
      .then((r) => r.json())
      .then((d) => {
        if (d.groups) setUserGroups(d.groups.map((g: { id: string; name: string }) => ({ id: g.id, name: g.name })));
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user || !groupId) return;
    fetch(`/api/simulate?group_id=${groupId}`)
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
  }, [user, groupId]);

  const { results, progress, running, numSims, rerun } = useTournamentSim(players, scoring);


  if (authLoading) return null;
  if (!user) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Typography variant="h4" gutterBottom>Tournament Forecast</Typography>
        <AuthForm />
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
            <Tab label="Team Outlook" />
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
                Hover over any team to see all teams that could end up in that slot and their probabilities.
              </Typography>
              <ForecastBracket
                bracketSlots={results.bracketSlots}
                numSims={numSims}
                countryCodeMap={Object.fromEntries(
                  Object.keys(PELE_RATINGS).map(t => [t, getCountryCode(t) ?? ''])
                )}
              />
            </Box>
          )}

          {activeTab === TAB_TEAM_OUTLOOK && (
            <TeamOutlookTable
              bracketSlots={results.bracketSlots}
              advanceProbs={results.advanceProbs}
              championProbs={results.championProbs}
              numSims={numSims}
            />
          )}

          {/* Expected Standings — admin only before tournament, all users after */}
          {results.playerScores && results.playerScores.length > 0 && (tournamentStarted || user.is_admin) && (
            <Paper sx={{ p: 2, mt: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5, flexWrap: 'wrap' }}>
                <Typography variant="subtitle1" fontWeight="bold">
                  Expected Standings
                </Typography>
                {userGroups.length > 1 && (
                  <FormControl size="small" sx={{ minWidth: 180 }}>
                    <InputLabel>Group</InputLabel>
                    <Select value={groupId} label="Group" onChange={(e) => setGroupId(e.target.value)}>
                      {userGroups.map((g) => (
                        <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              </Box>
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
