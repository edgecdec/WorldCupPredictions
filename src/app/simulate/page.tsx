'use client';
import { useState, useMemo, useEffect } from 'react';
import {
  Container, Typography, Box, LinearProgress, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TableSortLabel, Grid, Chip,
  Tabs, Tab, IconButton, Tooltip, Popover,
} from '@mui/material';
import ScoreHistogram from '@/components/common/ScoreHistogram';
import UserLink from '@/components/common/UserLink';
import BracketLink from '@/components/common/BracketLink';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useTournamentSim, GROUPS } from '@/hooks/useTournamentSim';
import type { PlayerEntry, ActualResults, InProgressGroupMatch } from '@/hooks/useTournamentSim';
import { sampleLiveScores } from '@/lib/matchOdds';
import { parseEspnClock } from '@/lib/parseEspnClock';
import { useSelectedGroup } from '@/hooks/useSelectedGroup';
import AuthForm from '@/components/auth/AuthForm';
import TeamFlag from '@/components/common/TeamFlag';
import ForecastBracket from '@/components/bracket/ForecastBracket';
import LiveScores from '@/components/bracket/LiveScores';
import { useLiveScores, todayInPacific } from '@/hooks/useLiveScores';
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

// parseEspnClock moved to lib/parseEspnClock for sharing across pages.

function pctNum(count: number, total: number): number {
  return Math.round((count / total) * 100);
}

const TEAM_ABBREV: Record<string, string> = {
  'Bosnia and Herzegovina': 'Bosnia & H.',
  'South Africa': 'S. Africa',
  'South Korea': 'S. Korea',
  'Saudi Arabia': 'Saudi A.',
  'New Zealand': 'New Zealand',
  'Ivory Coast': 'Ivory Coast',
  'DR Congo': 'DR Congo',
  'Cape Verde': 'Cape Verde',
  Netherlands: 'Netherlands',
};

function abbreviateTeam(name: string): string {
  return TEAM_ABBREV[name] ?? name;
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

type OutlookSortKey = 'team' | 'reachR32' | 'reachR16' | 'reachQF' | 'reachSF' | 'reachFinal' | 'champion' | 'pele';

const OUTLOOK_COLUMNS: Array<{ key: OutlookSortKey; label: string; align: 'left' | 'right'; bold?: boolean; muted?: boolean }> = [
  { key: 'team', label: 'Team', align: 'left' },
  { key: 'reachR32', label: 'R32', align: 'right' },
  { key: 'reachR16', label: 'R16', align: 'right' },
  { key: 'reachQF', label: 'QF', align: 'right' },
  { key: 'reachSF', label: 'SF', align: 'right' },
  { key: 'reachFinal', label: 'Final', align: 'right' },
  { key: 'champion', label: 'Champion', align: 'right', bold: true },
  { key: 'pele', label: 'PELE', align: 'right', muted: true },
];

function TeamOutlookTable({ bracketSlots, advanceProbs, championProbs, numSims }: {
  bracketSlots: Array<{ slotId: string; teams: Array<{ team: string; count: number }> }>;
  advanceProbs: Array<{ team: string; pct: number }>;
  championProbs: Array<{ team: string; pct: number }>;
  numSims: number;
}) {
  const [sortKey, setSortKey] = useState<OutlookSortKey>('champion');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: OutlookSortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'team' ? 'asc' : 'desc');
    }
  };

  const rows = useMemo(() => {
    const all = computeTeamOutlook(bracketSlots, advanceProbs, championProbs, numSims);
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...all].sort((a, b) => {
      if (sortKey === 'team') return a.team.localeCompare(b.team) * dir;
      if (sortKey === 'pele') return ((PELE_RATINGS[a.team]?.pele ?? 0) - (PELE_RATINGS[b.team]?.pele ?? 0)) * dir;
      return (a[sortKey] - b[sortKey]) * dir;
    });
  }, [bracketSlots, advanceProbs, championProbs, numSims, sortKey, sortDir]);

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
              {OUTLOOK_COLUMNS.map((col) => (
                <TableCell
                  key={col.key}
                  align={col.align}
                  sx={{ py: 0.5, fontWeight: col.bold ? 700 : undefined, color: col.muted ? 'text.secondary' : undefined }}
                >
                  <TableSortLabel
                    active={sortKey === col.key}
                    direction={sortKey === col.key ? sortDir : 'desc'}
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                  </TableSortLabel>
                </TableCell>
              ))}
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

type GroupSortKey = 'team' | 'pos0' | 'pos1' | 'pos2' | 'pos3' | 'advance';

const GROUP_COLUMNS: Array<{ key: GroupSortKey; label: string; align: 'left' | 'center'; bold?: boolean }> = [
  { key: 'team', label: 'Team', align: 'left' },
  { key: 'pos0', label: '1st', align: 'center' },
  { key: 'pos1', label: '2nd', align: 'center' },
  { key: 'pos2', label: '3rd', align: 'center' },
  { key: 'pos3', label: '4th', align: 'center' },
  { key: 'advance', label: 'Adv', align: 'center', bold: true },
];

function GroupForecastTable({ groupData, numSims }: {
  groupData: Array<{ team: string; pos: number[]; advance: number }>;
  numSims: number;
}) {
  const [sortKey, setSortKey] = useState<GroupSortKey>('advance');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: GroupSortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'team' ? 'asc' : 'desc');
    }
  };

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...groupData].sort((a, b) => {
      if (sortKey === 'team') return a.team.localeCompare(b.team) * dir;
      if (sortKey === 'advance') return (a.advance - b.advance) * dir;
      const idx = parseInt(sortKey.slice(3));
      return (a.pos[idx] - b.pos[idx]) * dir;
    });
  }, [groupData, sortKey, sortDir]);

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            {GROUP_COLUMNS.map((col) => (
              <TableCell
                key={col.key}
                align={col.align}
                sx={{ py: 0.25, px: 0.5, fontWeight: col.bold ? 700 : undefined }}
              >
                <TableSortLabel
                  active={sortKey === col.key}
                  direction={sortKey === col.key ? sortDir : 'desc'}
                  onClick={() => handleSort(col.key)}
                  sx={{ '& .MuiTableSortLabel-icon': { fontSize: '0.8rem' } }}
                >
                  {col.label}
                </TableSortLabel>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {sorted.map((t) => (
            <TableRow key={t.team}>
              <TableCell sx={{ py: 0.25, px: 0.5, maxWidth: 0, width: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                  <TeamFlag countryCode={getCountryCode(t.team) ?? ''} size={16} />
                  <Tooltip title={t.team} disableHoverListener={t.team.length <= 14}>
                    <Typography variant="body2" noWrap sx={{ fontSize: '0.7rem', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {abbreviateTeam(t.team)}
                    </Typography>
                  </Tooltip>
                </Box>
              </TableCell>
              <TableCell align="center" sx={{ py: 0.25, px: 0.25, fontSize: '0.7rem' }}>{pct(t.pos[0], numSims)}</TableCell>
              <TableCell align="center" sx={{ py: 0.25, px: 0.25, fontSize: '0.7rem' }}>{pct(t.pos[1], numSims)}</TableCell>
              <TableCell align="center" sx={{ py: 0.25, px: 0.25, fontSize: '0.7rem' }}>{pct(t.pos[2], numSims)}</TableCell>
              <TableCell align="center" sx={{ py: 0.25, px: 0.25, fontSize: '0.7rem' }}>{pct(t.pos[3], numSims)}</TableCell>
              <TableCell align="center" sx={{ py: 0.25, px: 0.25, fontSize: '0.75rem', fontWeight: 700, color: pctNum(t.advance, numSims) >= 70 ? 'success.main' : pctNum(t.advance, numSims) >= 40 ? 'warning.main' : 'error.main' }}>
                {pct(t.advance, numSims)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/** Hoverable avg-score cell that pops up a score distribution histogram. */
function AvgScoreCell({
  avgScore,
  scoreDistribution,
  playerLabel,
}: {
  avgScore: number;
  scoreDistribution: Record<number, number>;
  playerLabel: string;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const hasData = Object.keys(scoreDistribution).length > 0;

  return (
    <TableCell align="right" sx={{ py: 0.5, px: 1, fontWeight: 700 }}>
      <Box
        component="span"
        onMouseEnter={hasData ? (e) => setAnchor(e.currentTarget) : undefined}
        onMouseLeave={() => setAnchor(null)}
        sx={{
          cursor: hasData ? 'help' : 'default',
          textDecoration: hasData ? 'underline dotted' : 'none',
          textUnderlineOffset: '3px',
        }}
      >
        {avgScore.toFixed(1)}
      </Box>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        disableRestoreFocus
        sx={{ pointerEvents: 'none' }}
        slotProps={{ paper: { sx: { p: 1.5 } } }}
      >
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5, textTransform: 'uppercase', fontSize: '0.65rem' }}>
          {playerLabel} — score distribution
        </Typography>
        <ScoreHistogram distribution={scoreDistribution} avgScore={avgScore} />
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5, fontSize: '0.65rem' }}>
          Each bar = % of simulations with that exact score.
        </Typography>
      </Popover>
    </TableCell>
  );
}

type StandingsSortKey = 'rank' | 'player' | 'avgScore' | 'avgRank' | 'winPct';

function ExpectedStandingsTable({ playerScores, currentUsername, leadOnly }: {
  playerScores: Array<{ key: string; avgScore: number; avgRank: number; winPct: number; scoreDistribution: Record<number, number> }>;
  currentUsername: string;
  leadOnly: boolean;
}) {
  const winLabel = leadOnly ? 'Lead %' : 'Win %';
  const STANDINGS_COLUMNS: Array<{ key: StandingsSortKey; label: string; align: 'left' | 'right' }> = [
    { key: 'rank', label: '#', align: 'left' },
    { key: 'player', label: 'Player', align: 'left' },
    { key: 'avgScore', label: 'Avg Score', align: 'right' },
    { key: 'avgRank', label: 'Avg Rank', align: 'right' },
    { key: 'winPct', label: winLabel, align: 'right' },
  ];
  const [sortKey, setSortKey] = useState<StandingsSortKey>('avgScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: StandingsSortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      const ascDefault = key === 'rank' || key === 'player' || key === 'avgRank';
      setSortDir(ascDefault ? 'asc' : 'desc');
    }
  };

  // Default ranking by avgScore desc — used for the # column
  const ranked = useMemo(
    () => [...playerScores].sort((a, b) => b.avgScore - a.avgScore),
    [playerScores],
  );
  const rankByKey = useMemo(() => {
    const m = new Map<string, number>();
    ranked.forEach((p, i) => m.set(p.key, i + 1));
    return m;
  }, [ranked]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...playerScores].sort((a, b) => {
      if (sortKey === 'rank') return ((rankByKey.get(a.key) ?? 0) - (rankByKey.get(b.key) ?? 0)) * dir;
      if (sortKey === 'player') return a.key.localeCompare(b.key) * dir;
      return (a[sortKey] - b[sortKey]) * dir;
    });
  }, [playerScores, sortKey, sortDir, rankByKey]);

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            {STANDINGS_COLUMNS.map((col) => (
              <TableCell key={col.key} align={col.align} sx={{ py: 0.5, px: 1 }}>
                <TableSortLabel
                  active={sortKey === col.key}
                  direction={sortKey === col.key ? sortDir : 'desc'}
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}
                </TableSortLabel>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {sorted.map((p) => {
            const [username, bracketName] = p.key.split('|');
            const isCurrentUser = username === currentUsername;
            const rank = rankByKey.get(p.key);
            return (
              <TableRow key={p.key} sx={isCurrentUser ? { bgcolor: 'action.selected' } : undefined}>
                <TableCell sx={{ py: 0.5, px: 1 }}>{rank}</TableCell>
                <TableCell sx={{ py: 0.5, px: 1, fontSize: '0.875rem' }}>
                  <UserLink username={username} isCurrentUser={isCurrentUser} bold={isCurrentUser} />
                  {bracketName && (
                    <>
                      {' — '}
                      <BracketLink username={username} bracketName={bracketName} />
                    </>
                  )}
                </TableCell>
                <AvgScoreCell
                  avgScore={p.avgScore}
                  scoreDistribution={p.scoreDistribution}
                  playerLabel={`${username}${bracketName ? ` — ${bracketName}` : ''}`}
                />
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
  const [standingsRevealed, setStandingsRevealed] = useState(false);
  const [players, setPlayers] = useState<PlayerEntry[] | undefined>(undefined);
  const [scoring, setScoring] = useState<ScoringSettings>(DEFAULT_SCORING);
  const [groupId, setGroupId] = useSelectedGroup('everyone');
  const [userGroups, setUserGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [actualResults, setActualResults] = useState<ActualResults | undefined>(undefined);
  // True once lock_time_knockout has passed. Until then, the worker scores
  // group-stage only per user (knockout picks aren't yet locked in).
  const [knockoutsLocked, setKnockoutsLocked] = useState(false);

  useEffect(() => {
    // Pre-compute team → group for in-progress matches.
    const teamToGroup: Record<string, string> = {};
    for (const [g, teams] of Object.entries(GROUPS)) {
      for (const t of teams) teamToGroup[t] = g;
    }

    const fetchAll = async () => {
      try {
        // Fire both fetches in parallel — completed match data and live scores.
        const [tRes, sRes] = await Promise.all([
          fetch('/api/tournaments').then((r) => r.json()),
          fetch('/api/scores').then((r) => r.json()).catch(() => ({ ok: false })),
        ]);
        if (!tRes.ok || !tRes.tournament) return;
        const t = tRes.tournament;
        if (t.lock_time_groups) {
          setTournamentStarted(new Date() >= new Date(t.lock_time_groups));
        }
        if (t.lock_time_knockout) {
          setKnockoutsLocked(new Date() >= new Date(t.lock_time_knockout));
        }
        const rd = t.results_data;
        const ar: ActualResults = {};
        // ONLY treat groupStage as final standings if all 12 groups are
        // present. A partial groupStage (some groups complete, others still
        // in flight) was previously triggering this branch — which lost the
        // per-match scoreline data and made the worker re-simulate the whole
        // group stage from pre-game. The bug was visible as /simulate showing
        // pre-tournament percentages mid-stage.
        const TOTAL_GROUPS = 12;
        const isFullGroupStage = (rd?.groupStage?.groupResults?.length ?? 0) === TOTAL_GROUPS
          && (rd?.groupStage?.advancingThirdPlace?.length ?? 0) === 8;
        if (isFullGroupStage) {
          const standings: Record<string, string[]> = {};
          for (const gr of rd!.groupStage!.groupResults) {
            standings[gr.groupName] = gr.order;
          }
          ar.finalGroupStandings = standings;
          ar.finalAdvancing3rd = rd!.groupStage!.advancingThirdPlace;
        } else {
          // Partial or no group stage: feed the worker the raw per-match
          // scoreline data so it can lock completed games. Then merge in
          // any ESPN state='post' games not yet written to the DB (sync
          // lag) so the worker treats just-finished games as locked too.
          const groupMatches: Record<string, Array<{ teamA: string; teamB: string; scoreA: number; scoreB: number }>> = {};
          for (const [g, arr] of Object.entries(rd?.groupMatches ?? {})) {
            groupMatches[g] = [...(arr as Array<{ teamA: string; teamB: string; scoreA: number; scoreB: number }>)];
          }
          if (sRes?.ok && Array.isArray(sRes.games)) {
            for (const game of sRes.games) {
              if (game.state !== 'post') continue;
              if ((game.stage ?? 'group') !== 'group') continue;
              const groupName = teamToGroup[game.home?.name];
              if (!groupName || teamToGroup[game.away?.name] !== groupName) continue;
              const exists = (groupMatches[groupName] ?? []).some(
                (m) => (m.teamA === game.home.name && m.teamB === game.away.name) ||
                       (m.teamA === game.away.name && m.teamB === game.home.name),
              );
              if (exists) continue;
              const sA = parseInt(game.home.score, 10) || 0;
              const sB = parseInt(game.away.score, 10) || 0;
              (groupMatches[groupName] ??= []).push({
                teamA: game.home.name, teamB: game.away.name, scoreA: sA, scoreB: sB,
              });
            }
          }
          if (Object.keys(groupMatches).length > 0) ar.groupMatches = groupMatches;
        }
        if (rd?.knockout && Object.keys(rd.knockout).length > 0) {
          ar.knockoutWinners = rd.knockout;
        }

        // Identify in-progress group matches and sample their scorelines,
        // so the forecast captures uncertainty in how unfinished games end.
        // Skip if the group stage is already locked (no point sampling).
        if (!ar.finalGroupStandings && sRes?.ok && Array.isArray(sRes.games)) {
          const inProgress: Record<string, InProgressGroupMatch[]> = {};
          for (const g of sRes.games) {
            if (g.state !== 'in') continue;
            if ((g.stage ?? 'group') !== 'group') continue;
            const groupName = teamToGroup[g.home?.name];
            if (!groupName || teamToGroup[g.away?.name] !== groupName) continue;
            const minutesPlayed = parseEspnClock(g.clock, g.period);
            if (minutesPlayed === null) continue;
            const sA = parseInt(g.home.score, 10) || 0;
            const sB = parseInt(g.away.score, 10) || 0;
            const samples = sampleLiveScores(g.home.name, g.away.name, sA, sB, minutesPlayed, 1000, { stage: 'group' });
            if (!samples) continue;
            (inProgress[groupName] ??= []).push({
              teamA: g.home.name,
              teamB: g.away.name,
              sampledScores: samples,
              // Score + minute give the dedupe key something concrete to
              // compare so a goal or HT/stoppage transition actually triggers
              // a worker rerun (the random sampledScores get stripped from
              // the compare to avoid spurious reruns).
              currentScoreA: sA,
              currentScoreB: sB,
              minutesPlayed,
            });
          }
          if (Object.keys(inProgress).length > 0) {
            ar.inProgressGroupMatches = inProgress;
          }
        }

        if (Object.keys(ar).length > 0) {
          setActualResults((prev) => {
            // Compare without sampledScores (re-drawn every poll so they'd
            // always differ). Keep teams + current score + minute so a goal
            // or clock change DOES trigger a rerun.
            const stripSamples = (x: ActualResults | undefined) => {
              if (!x?.inProgressGroupMatches) return x;
              const stripped: Record<string, Array<{ teamA: string; teamB: string; currentScoreA?: number; currentScoreB?: number; minutesPlayed?: number }>> = {};
              for (const [g, ms] of Object.entries(x.inProgressGroupMatches)) {
                stripped[g] = ms.map((m) => ({
                  teamA: m.teamA, teamB: m.teamB,
                  currentScoreA: m.currentScoreA,
                  currentScoreB: m.currentScoreB,
                  minutesPlayed: m.minutesPlayed,
                }));
              }
              return { ...x, inProgressGroupMatches: stripped };
            };
            if (JSON.stringify(stripSamples(prev)) === JSON.stringify(stripSamples(ar))) return prev;
            return ar;
          });
        }
      } catch {
        // ignore network failures
      }
    };
    fetchAll();
    // Poll every minute so live games refresh in near-real-time. Underlying
    // ESPN sync is debounced 60s server-side, so this is cheap.
    const interval = setInterval(fetchAll, 60 * 1000);
    return () => clearInterval(interval);
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

  const { results, progress, running, numSims, simsCompleted, rerun } = useTournamentSim(
    players, scoring, actualResults, { scoreKnockoutPicks: knockoutsLocked },
  );
  // While partial results stream in, divide raw counts by simsCompleted (not
  // numSims) so percentages reflect the actual sample size. Falls back to
  // numSims at the end (or to 1 to avoid division-by-zero before any sims).
  const effectiveNumSims = simsCompleted > 0 ? simsCompleted : numSims;

  // Day-by-day scoreboard, anchored to today in Pacific time so US users see
  // their own "matchday" grouping. Each click of prev/next bumps by 24h.
  const [scoreDate, setScoreDate] = useState<Date>(() => todayInPacific());
  const { games: liveGames, loading: liveLoading } = useLiveScores(Boolean(user), scoreDate);

  const countryCodeMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const team of Object.keys(PELE_RATINGS)) {
      const code = getCountryCode(team);
      if (code) m[team] = code;
    }
    return m;
  }, []);

  // teamToGroup map for ImpactPanel to derive matchIds.
  const teamToGroupMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const [g, teams] of Object.entries(GROUPS)) {
      for (const t of teams) m[t] = g;
    }
    return m;
  }, []);

  // Current user's bracket key + expected total score (for impact panels).
  const currentUserBracketKey = useMemo(() => {
    if (!user || !players) return undefined;
    const found = players.find((p) => p.key.startsWith(`${user.username}|`));
    return found?.key;
  }, [user, players]);
  const currentUserExpectedScore = useMemo(() => {
    if (!currentUserBracketKey || !results?.playerScores) return undefined;
    return results.playerScores.find((ps) => ps.key === currentUserBracketKey)?.avgScore;
  }, [currentUserBracketKey, results]);


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
          ? results
            ? `Showing early forecast (${progress.toLocaleString()} of ${numSims.toLocaleString()} sims) — refining…`
            : `Simulating ${numSims.toLocaleString()} tournaments…`
          : `Based on ${numSims.toLocaleString()} simulated tournaments using Nate Silver's PELE ratings.`}
      </Typography>

      {running && (
        <LinearProgress variant="determinate" value={(progress / numSims) * 100} sx={{ mb: 2, height: 6, borderRadius: 3 }} />
      )}

      <Box sx={{ mb: 3 }}>
        <LiveScores
          games={liveGames}
          loading={liveLoading}
          countryCodeMap={countryCodeMap}
          date={scoreDate}
          onDateChange={setScoreDate}
          bracketSlots={results?.bracketSlots}
          numSims={effectiveNumSims}
          currentUserKey={currentUserBracketKey}
          userExpectedScore={currentUserExpectedScore}
          conditionalScores={results?.conditionalScores}
          teamToGroup={teamToGroupMap}
        />
      </Box>

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
                return (
                  <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={g}>
                    <Paper sx={{ p: 1.5 }}>
                      <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 0.5 }}>Group {g}</Typography>
                      <GroupForecastTable groupData={groupData} numSims={effectiveNumSims} />
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
                numSims={effectiveNumSims}
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
              numSims={effectiveNumSims}
            />
          )}

          {/* Expected Standings — admin only before tournament (hidden by default), all users after */}
          {results.playerScores && results.playerScores.length > 0 && (tournamentStarted || user.is_admin) && (
            <Paper sx={{ p: 2, mt: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5, flexWrap: 'wrap' }}>
                <Typography variant="subtitle1" fontWeight="bold">
                  Expected Standings
                </Typography>
                {!tournamentStarted && user.is_admin && (
                  <IconButton
                    size="small"
                    onClick={() => setStandingsRevealed((v) => !v)}
                    title={standingsRevealed ? 'Hide standings' : 'Reveal standings (admin)'}
                  >
                    {standingsRevealed ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                  </IconButton>
                )}
                {(tournamentStarted || standingsRevealed) && userGroups.length > 1 && (
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
              {!tournamentStarted && !standingsRevealed ? (
                <Typography variant="body2" color="text.secondary">
                  🔒 Hidden until the tournament starts (June 11). Click the eye icon above to reveal — admin only.
                </Typography>
              ) : (
                (() => {
                  const anyKnockoutPicks = (players ?? []).some((p) => Object.keys(p.knockout_picks).length > 0);
                  return (
                    <>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                        Based on {effectiveNumSims.toLocaleString()} simulated tournaments, here is how each player&apos;s picks are expected to perform.
                        {!anyKnockoutPicks && ' Lead % = chance of having the top score after the group stage (knockout picks not yet locked in).'}
                      </Typography>
                      <ExpectedStandingsTable
                        playerScores={results.playerScores}
                        currentUsername={user.username}
                        leadOnly={!anyKnockoutPicks}
                      />
                    </>
                  );
                })()
              )}
            </Paper>
          )}
        </>
      )}
    </Container>
  );
}
