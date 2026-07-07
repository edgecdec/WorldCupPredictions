'use client';
import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Container, Typography, Box, LinearProgress, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TableSortLabel, Grid, Chip,
  Tabs, Tab, IconButton, Tooltip, Popover, Button,
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
import type { PlayerEntry, ActualResults, InProgressGroupMatch, InProgressKnockoutMatch } from '@/hooks/useTournamentSim';
import { sampleLiveScores, sampleLiveKnockoutWinners } from '@/lib/matchOdds';
import { parseEspnClock } from '@/lib/parseEspnClock';
import { useSelectedGroup } from '@/hooks/useSelectedGroup';
import AuthForm from '@/components/auth/AuthForm';
import TeamFlag from '@/components/common/TeamFlag';
import ForecastBracket from '@/components/bracket/ForecastBracket';
import { getFeederMatchupIds } from '@/lib/knockoutBracket';
import LiveScores from '@/components/bracket/LiveScores';
import { useLiveScores, todayInPacific } from '@/hooks/useLiveScores';
import { PELE_RATINGS } from '@/lib/peleRatings';
import type { ScoringSettings, GroupPrediction, GroupStageResults, KnockoutResults, KnockoutMatchup, BracketData } from '@/types';
import { DEFAULT_SCORING } from '@/types';
import { scoreTotalPrediction } from '@/lib/scoring';
import { FormControl, InputLabel, Select, MenuItem } from '@mui/material';

const GROUP_NAMES = Object.keys(GROUPS);
const TAB_GROUPS = 0;
const TAB_BRACKET = 1;
const TAB_TEAM_OUTLOOK = 2;
const TAB_WHAT_IF = 3;

// Downstream dependency graph: which matches must be revalidated when a
// given match changes. Used by the What-If cascade when the user reverses
// an earlier round pick.
const DOWNSTREAM_MATCHES: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  // R32 → R16
  for (let i = 1; i <= 16; i++) out[`R32-${i}`] = [];
  for (let i = 1; i <= 8; i++) out[`R16-${i}`] = [];
  for (let i = 1; i <= 4; i++) out[`QF-${i}`] = [];
  out['SF-1'] = []; out['SF-2'] = []; out['FINAL'] = []; out['3RD'] = [];
  // Populate: for each match M, look up its two feeders and add M to their
  // downstream list. Use the same getFeederMatchupIds semantics.
  const allChildren = ['R16-1','R16-2','R16-3','R16-4','R16-5','R16-6','R16-7','R16-8',
    'QF-1','QF-2','QF-3','QF-4','SF-1','SF-2','FINAL','3RD'];
  for (const child of allChildren) {
    const feeders = getFeederMatchupIds(child);
    if (feeders) {
      out[feeders[0]].push(child);
      out[feeders[1]].push(child);
    }
  }
  return out;
})();

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

type StandingsSortKey = 'rank' | 'player' | 'avgScore' | 'avgRank' | 'winPct' | 'points';

type StandingsScope = 'overall' | 'groups' | 'knockout';

interface StandingsRow {
  key: string;
  avgScore: number;
  avgRank: number;
  winPct: number;
  scoreDistribution: Record<number, number>;
}

function ExpectedStandingsTable({
  playerScores, currentUsername, leadOnly, scope, picksByKey, players,
  scoringSettings, bracketData, groupStageResults,
  knockoutMatchups, currentKnockoutResults, baselineKnockoutResults, whatIfCount,
}: {
  playerScores: Array<{
    key: string; avgScore: number; avgRank: number; winPct: number; scoreDistribution: Record<number, number>;
    avgGroupTotal?: number; avgGroupRank?: number; groupWinPct?: number; groupTotalDistribution?: Record<number, number>;
    avgKoTotal?: number; avgKoRank?: number; koWinPct?: number; koTotalDistribution?: Record<number, number>;
  }>;
  currentUsername: string;
  leadOnly: boolean;
  scope: StandingsScope;
  /** Map key ('username|bracket') → whether the player has non-empty group /
   *  knockout picks. Used to hide players from a scope tab when they have
   *  nothing to score there (would otherwise pile up at the bottom on 0). */
  picksByKey?: Record<string, { hasGroup: boolean; hasKnockout: boolean }>;
  /** Full player entries for deterministic Pts scoring per row. */
  players?: PlayerEntry[];
  scoringSettings?: ScoringSettings;
  bracketData?: BracketData | null;
  groupStageResults?: GroupStageResults | null;
  knockoutMatchups?: KnockoutMatchup[];
  /** Results with What-If picks merged in. Drives the Pts column. */
  currentKnockoutResults?: KnockoutResults;
  /** Results without What-If picks. Drives the rank the movement arrow
   *  compares against. */
  baselineKnockoutResults?: KnockoutResults;
  /** How many What-If overrides are active. When 0 the movement column
   *  hides itself since baseline == current. */
  whatIfCount?: number;
}) {
  // Deterministic per-player scoring: assuming every locked + What-If pick
  // resolves as-shown, what does each player total? Pts column reads from
  // here; movement column compares rank(current) vs rank(baseline).
  const scoreMap = useMemo<{ current: Record<string, number>; baseline: Record<string, number> }>(() => {
    const current: Record<string, number> = {};
    const baseline: Record<string, number> = {};
    if (!players || !scoringSettings || !bracketData) return { current, baseline };
    for (const p of players) {
      const curScore = scoreTotalPrediction(
        p.group_predictions,
        p.third_place_picks,
        p.knockout_picks,
        groupStageResults ?? undefined,
        currentKnockoutResults ?? {},
        knockoutMatchups && knockoutMatchups.length > 0 ? knockoutMatchups : undefined,
        bracketData,
        scoringSettings,
      );
      current[p.key] = curScore.totalScore;
      const basScore = scoreTotalPrediction(
        p.group_predictions,
        p.third_place_picks,
        p.knockout_picks,
        groupStageResults ?? undefined,
        baselineKnockoutResults ?? {},
        knockoutMatchups && knockoutMatchups.length > 0 ? knockoutMatchups : undefined,
        bracketData,
        scoringSettings,
      );
      baseline[p.key] = basScore.totalScore;
    }
    return { current, baseline };
  }, [players, scoringSettings, bracketData, groupStageResults, knockoutMatchups, currentKnockoutResults, baselineKnockoutResults]);
  const currentPts = scoreMap.current;
  const baselinePts = scoreMap.baseline;

  // Baseline rank map (higher score → lower rank number). Used only for
  // the ↑↓ movement column so it doesn't drift with the primary sort.
  const baselineRankByKey = useMemo(() => {
    const keys = Object.keys(baselinePts);
    keys.sort((a, b) => (baselinePts[b] ?? 0) - (baselinePts[a] ?? 0));
    const m = new Map<string, number>();
    keys.forEach((k, i) => m.set(k, i + 1));
    return m;
  }, [baselinePts]);
  const currentPtsRankByKey = useMemo(() => {
    const keys = Object.keys(currentPts);
    keys.sort((a, b) => (currentPts[b] ?? 0) - (currentPts[a] ?? 0));
    const m = new Map<string, number>();
    keys.forEach((k, i) => m.set(k, i + 1));
    return m;
  }, [currentPts]);
  const showMovement = (whatIfCount ?? 0) > 0;
  // Scope-aware filter: on Group Stage tab drop rows with no group picks; on
  // Knockouts tab drop rows with no knockout picks. Overall keeps everyone.
  const filteredScores = useMemo(() => {
    if (!picksByKey || scope === 'overall') return playerScores;
    return playerScores.filter((p) => {
      const pk = picksByKey[p.key];
      if (!pk) return true; // no pick info → show it (shouldn't happen)
      return scope === 'groups' ? pk.hasGroup : pk.hasKnockout;
    });
  }, [playerScores, scope, picksByKey]);

  // Project per-scope fields into the same 4-field shape the table uses, so
  // the sort/render code below doesn't have to branch on scope everywhere.
  const projected: StandingsRow[] = useMemo(() => filteredScores.map((p) => {
    if (scope === 'groups') {
      return {
        key: p.key,
        avgScore: p.avgGroupTotal ?? 0,
        avgRank: p.avgGroupRank ?? 0,
        winPct: p.groupWinPct ?? 0,
        scoreDistribution: p.groupTotalDistribution ?? {},
      };
    }
    if (scope === 'knockout') {
      return {
        key: p.key,
        avgScore: p.avgKoTotal ?? 0,
        avgRank: p.avgKoRank ?? 0,
        winPct: p.koWinPct ?? 0,
        scoreDistribution: p.koTotalDistribution ?? {},
      };
    }
    return {
      key: p.key,
      avgScore: p.avgScore,
      avgRank: p.avgRank,
      winPct: p.winPct,
      scoreDistribution: p.scoreDistribution,
    };
  }), [filteredScores, scope]);

  const winLabel = leadOnly ? 'Lead %' : 'Win %';
  const STANDINGS_COLUMNS: Array<{ key: StandingsSortKey; label: string; align: 'left' | 'right' }> = [
    { key: 'rank', label: '#', align: 'left' },
    { key: 'player', label: 'Player', align: 'left' },
    { key: 'points', label: 'Pts', align: 'right' },
    { key: 'avgScore', label: 'Avg', align: 'right' },
    { key: 'avgRank', label: 'Rank', align: 'right' },
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

  const ranked = useMemo(
    () => [...projected].sort((a, b) => b.avgScore - a.avgScore),
    [projected],
  );
  const rankByKey = useMemo(() => {
    const m = new Map<string, number>();
    ranked.forEach((p, i) => m.set(p.key, i + 1));
    return m;
  }, [ranked]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...projected].sort((a, b) => {
      if (sortKey === 'rank') return ((rankByKey.get(a.key) ?? 0) - (rankByKey.get(b.key) ?? 0)) * dir;
      if (sortKey === 'player') return a.key.localeCompare(b.key) * dir;
      if (sortKey === 'points') return ((currentPts[a.key] ?? 0) - (currentPts[b.key] ?? 0)) * dir;
      const av = (a as unknown as Record<string, number>)[sortKey] ?? 0;
      const bv = (b as unknown as Record<string, number>)[sortKey] ?? 0;
      return (av - bv) * dir;
    });
  }, [projected, sortKey, sortDir, rankByKey, currentPts]);

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
            const pts = currentPts[p.key] ?? 0;
            // Movement: baseline rank − current-pts rank. Positive → moved
            // UP (previously worse rank, now better). Negative → moved down.
            const baseRank = baselineRankByKey.get(p.key);
            const curPtsRank = currentPtsRankByKey.get(p.key);
            const movement = baseRank !== undefined && curPtsRank !== undefined
              ? baseRank - curPtsRank
              : 0;
            return (
              <TableRow key={p.key} sx={isCurrentUser ? { bgcolor: 'action.selected' } : undefined}>
                <TableCell sx={{ py: 0.5, px: 1, whiteSpace: 'nowrap' }}>
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4 }}>
                    <span>{rank}</span>
                    {showMovement && movement !== 0 && (
                      <Box component="span" sx={{
                        fontSize: '0.65rem',
                        color: movement > 0 ? 'success.main' : 'error.main',
                        fontWeight: 700,
                      }}>
                        {movement > 0 ? '↑' : '↓'}{Math.abs(movement)}
                      </Box>
                    )}
                  </Box>
                </TableCell>
                <TableCell sx={{ py: 0.5, px: 1, lineHeight: 1.15 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Box
                      sx={{ fontSize: '0.85rem', fontWeight: isCurrentUser ? 700 : 400 }}
                      title={username.length > 12 ? username : undefined}
                    >
                      <Link
                        href={`/profile/${encodeURIComponent(username)}`}
                        style={{ color: 'inherit', textDecoration: 'underline dotted' }}
                      >
                        {username.length > 12 ? username.slice(0, 11) + '…' : username}
                      </Link>
                      {isCurrentUser && (
                        <Box component="span" sx={{ ml: 0.5, fontSize: '0.6rem', color: 'primary.main', fontWeight: 700 }}>
                          You
                        </Box>
                      )}
                    </Box>
                    {bracketName && (
                      <Box
                        sx={{ fontSize: '0.65rem', color: 'text.secondary', mt: 0.1 }}
                        title={bracketName.length > 15 ? bracketName : undefined}
                      >
                        <BracketLink
                          username={username}
                          bracketName={bracketName}
                          displayName={bracketName.length > 15 ? bracketName.slice(0, 14) + '…' : bracketName}
                        />
                      </Box>
                    )}
                  </Box>
                </TableCell>
                <TableCell align="right" sx={{ py: 0.5, px: 1, fontWeight: 700 }}>{pts}</TableCell>
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
  // Persist the Expected Standings scope across leaderboard-group changes
  // and page reloads, matching the leaderboard's tab persistence behavior.
  const [standingsScope, setStandingsScope] = useState<'overall' | 'groups' | 'knockout'>(() => {
    if (typeof window === 'undefined') return 'overall';
    const stored = window.localStorage.getItem('simulate.standingsScope');
    return (stored === 'groups' || stored === 'knockout') ? stored : 'overall';
  });
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem('simulate.standingsScope', standingsScope); } catch { /* quota */ }
    }
  }, [standingsScope]);
  const [players, setPlayers] = useState<PlayerEntry[] | undefined>(undefined);
  const [scoring, setScoring] = useState<ScoringSettings>(DEFAULT_SCORING);
  const [groupId, setGroupId] = useSelectedGroup('everyone');
  const [userGroups, setUserGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [actualResults, setActualResults] = useState<ActualResults | undefined>(undefined);
  // What-If picks: matchId → team name. Merged into knockoutWinners before
  // handing to the sim so those matches always resolve to the user's choice.
  // Locked (real) results take precedence — they're spread AFTER whatIf.
  const [whatIfPicks, setWhatIfPicks] = useState<Record<string, string>>({});
  // R32 teams from the populated bracket (needed to render the What-If
  // matchups even before any user click). Empty until the knockout
  // bracket is generated post group-stage.
  const [knockoutBracketMatchups, setKnockoutBracketMatchups] = useState<Array<{ id: string; teamA: string | null; teamB: string | null }>>([]);
  // Full tournament results + bracket for deterministic scoring in the
  // Expected Standings table (Pts column, movement arrows). We already
  // fetch this via /api/tournaments; store the full structures.
  const [tournamentBracketData, setTournamentBracketData] = useState<BracketData | null>(null);
  const [tournamentGroupStage, setTournamentGroupStage] = useState<GroupStageResults | null>(null);
  const [tournamentKnockoutMatchups, setTournamentKnockoutMatchups] = useState<KnockoutMatchup[]>([]);
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
        if (t.bracket_data) setTournamentBracketData(t.bracket_data as BracketData);
        const rd = t.results_data;
        if (rd?.groupStage) setTournamentGroupStage(rd.groupStage as GroupStageResults);
        if (Array.isArray(rd?.knockoutBracket)) setTournamentKnockoutMatchups(rd.knockoutBracket as KnockoutMatchup[]);
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
        if (Array.isArray(rd?.knockoutBracket)) {
          setKnockoutBracketMatchups(rd.knockoutBracket.map((m: { id: string; teamA: string | null; teamB: string | null }) => ({
            id: m.id, teamA: m.teamA ?? null, teamB: m.teamB ?? null,
          })));
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

        // Same idea for in-progress KNOCKOUT matches. Skip if knockout
        // winners for that match are already finalized — once ESPN/DB marks
        // it done, the locked result takes precedence and live samples
        // would just confuse things.
        if (sRes?.ok && Array.isArray(sRes.games)) {
          const inProgressKnockouts: InProgressKnockoutMatch[] = [];
          for (const g of sRes.games) {
            if (g.state !== 'in') continue;
            if ((g.stage ?? 'group') !== 'knockout') continue;
            const minutesPlayed = parseEspnClock(g.clock, g.period);
            if (minutesPlayed === null) continue;
            const sA = parseInt(g.home.score, 10) || 0;
            const sB = parseInt(g.away.score, 10) || 0;
            const samples = sampleLiveKnockoutWinners(g.home.name, g.away.name, sA, sB, minutesPlayed, 1000, { period: g.period });
            if (!samples) continue;
            inProgressKnockouts.push({
              teamA: g.home.name, teamB: g.away.name,
              sampledWinners: samples,
              currentScoreA: sA, currentScoreB: sB, minutesPlayed,
            });
          }
          if (inProgressKnockouts.length > 0) ar.inProgressKnockoutMatches = inProgressKnockouts;
        }

        if (Object.keys(ar).length > 0) {
          setActualResults((prev) => {
            // Compare without sampledScores (re-drawn every poll so they'd
            // always differ). Keep teams + current score + minute so a goal
            // or clock change DOES trigger a rerun.
            const stripSamples = (x: ActualResults | undefined) => {
              if (!x) return x;
              const out: ActualResults = { ...x };
              if (x.inProgressGroupMatches) {
                const stripped: Record<string, Array<{ teamA: string; teamB: string; currentScoreA?: number; currentScoreB?: number; minutesPlayed?: number }>> = {};
                for (const [g, ms] of Object.entries(x.inProgressGroupMatches)) {
                  stripped[g] = ms.map((m) => ({
                    teamA: m.teamA, teamB: m.teamB,
                    currentScoreA: m.currentScoreA,
                    currentScoreB: m.currentScoreB,
                    minutesPlayed: m.minutesPlayed,
                  }));
                }
                (out as unknown as { inProgressGroupMatches: typeof stripped }).inProgressGroupMatches = stripped;
              }
              if (x.inProgressKnockoutMatches) {
                (out as unknown as { inProgressKnockoutMatches: Array<{ teamA: string; teamB: string; currentScoreA?: number; currentScoreB?: number; minutesPlayed?: number }> }).inProgressKnockoutMatches =
                  x.inProgressKnockoutMatches.map((m) => ({
                    teamA: m.teamA, teamB: m.teamB,
                    currentScoreA: m.currentScoreA,
                    currentScoreB: m.currentScoreB,
                    minutesPlayed: m.minutesPlayed,
                  }));
              }
              return out;
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
            .filter((e) => e.group_predictions.length > 0
              || (e.third_place_picks?.length ?? 0) > 0
              || Object.keys(e.knockout_picks ?? {}).length > 0)
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

  // Merge whatIfPicks into actualResults.knockoutWinners so the sim treats
  // them as forced results. Locked (real) results always win: they're
  // spread LAST so any user override on an already-decided match is
  // silently discarded. This gives the What-If tab precedence over
  // fresh sim + live samples but never over reality.
  const actualResultsWithWhatIf = useMemo<ActualResults | undefined>(() => {
    if (!actualResults && Object.keys(whatIfPicks).length === 0) return actualResults;
    const base = actualResults ?? {};
    const mergedKnockout = { ...whatIfPicks, ...(base.knockoutWinners ?? {}) };
    return { ...base, knockoutWinners: mergedKnockout };
  }, [actualResults, whatIfPicks]);

  const { results, progress, running, numSims, simsCompleted, rerun } = useTournamentSim(
    players, scoring, actualResultsWithWhatIf, { scoreKnockoutPicks: knockoutsLocked },
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

  // What-If tab: interactive bracket. R32 team names come from
  // knockoutBracketMatchups; R16+ team names flow from the user's picks
  // (or the tournament sim's leading team for that slot when the user
  // hasn't picked yet). Wire into ForecastBracket's pickMode interface.
  const r32TeamsByMatch = useMemo(() => {
    const out: Record<string, { teamA: string | null; teamB: string | null }> = {};
    for (const m of knockoutBracketMatchups) {
      if (m.id.startsWith('R32-')) out[m.id] = { teamA: m.teamA, teamB: m.teamB };
    }
    return out;
  }, [knockoutBracketMatchups]);

  // Effective picks = real locked winners + user overrides (locked wins on
  // conflict). This is what the What-If bracket resolves teams against, so
  // R16+ cells pre-populate with the teams that already advanced instead
  // of showing TBD until the user manually re-picks every finished R32.
  const effectiveWhatIfPicks = useMemo<Record<string, string>>(() => {
    return { ...whatIfPicks, ...(actualResults?.knockoutWinners ?? {}) };
  }, [whatIfPicks, actualResults]);

  const whatIfSlotForSide = useCallback((matchId: string, side: 'A' | 'B'): string | null => {
    if (matchId.startsWith('R32-')) {
      const r32 = r32TeamsByMatch[matchId];
      if (!r32) return null;
      return side === 'A' ? (r32.teamA ?? null) : (r32.teamB ?? null);
    }
    if (matchId === '3RD') {
      // Loser of each SF: the SF-N candidate that isn't the SF-N winner.
      const sfMatch = side === 'A' ? 'SF-1' : 'SF-2';
      const sfWinner = effectiveWhatIfPicks[sfMatch];
      if (!sfWinner) return null;
      const feeders = getFeederMatchupIds(sfMatch);
      if (!feeders) return null;
      const candA = effectiveWhatIfPicks[feeders[0]];
      const candB = effectiveWhatIfPicks[feeders[1]];
      if (candA && candA !== sfWinner) return candA;
      if (candB && candB !== sfWinner) return candB;
      return null;
    }
    const feeders = getFeederMatchupIds(matchId);
    if (!feeders) return null;
    const feederMatch = feeders[side === 'A' ? 0 : 1];
    return effectiveWhatIfPicks[feederMatch] ?? null;
  }, [effectiveWhatIfPicks, r32TeamsByMatch]);

  // teamForSlot passes team names through (post-lock we're always in
  // team-name mode — the picker on /bracket does the same).
  const whatIfTeamForSlot = useCallback((slotRef: string): string | null => slotRef, []);

  const handleWhatIfPick = useCallback((matchId: string, team: string) => {
    // Ignore clicks on already-finalized matches — the real winner is truth
    // and can't be overridden. This prevents "clicking does nothing"
    // confusion where the click *did* set whatIfPicks[matchId] but the
    // effective merge overwrote it with the locked winner.
    const lockedWinners = actualResults?.knockoutWinners ?? {};
    if (lockedWinners[matchId]) return;
    setWhatIfPicks((prev) => {
      const next = { ...prev };
      if (next[matchId] === team) delete next[matchId];
      else next[matchId] = team;
      // Cascade downstream: any pick whose stored team is no longer a
      // candidate (feeder changed) gets cleared. Use the merged pick view
      // so locked upstream results feed the candidate check.
      const merged = { ...next, ...lockedWinners };
      const revalidate = (m: string) => {
        if (lockedWinners[m]) return; // never clear a locked pick
        const feeders = getFeederMatchupIds(m);
        if (!feeders) return;
        let candA: string | undefined;
        let candB: string | undefined;
        if (m === '3RD') {
          // SF losers.
          for (const sf of ['SF-1', 'SF-2'] as const) {
            const sfW = merged[sf];
            const f = getFeederMatchupIds(sf);
            if (!sfW || !f) continue;
            const [a, b] = [merged[f[0]], merged[f[1]]];
            const loser = a && a !== sfW ? a : (b && b !== sfW ? b : undefined);
            if (sf === 'SF-1') candA = loser; else candB = loser;
          }
        } else {
          candA = merged[feeders[0]];
          candB = merged[feeders[1]];
        }
        const stored = next[m];
        if (stored && stored !== candA && stored !== candB) {
          delete next[m];
          revalidate(m);
        }
      };
      for (const dep of DOWNSTREAM_MATCHES[matchId] ?? []) revalidate(dep);
      return next;
    });
  }, [actualResults]);

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
            {knockoutBracketMatchups.length > 0 && <Tab label="What If" />}
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

          {activeTab === TAB_WHAT_IF && knockoutBracketMatchups.length > 0 && (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 240 }}>
                  Click any team to force them to win that match — the simulation instantly re-runs treating your picks as certainties. Real results always win over your overrides.
                  {Object.keys(whatIfPicks).length > 0 ? ` · ${Object.keys(whatIfPicks).length} override${Object.keys(whatIfPicks).length === 1 ? '' : 's'} applied.` : ''}
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  color="error"
                  onClick={() => setWhatIfPicks({})}
                  disabled={Object.keys(whatIfPicks).length === 0}
                >
                  Clear all
                </Button>
              </Box>
              <ForecastBracket
                bracketSlots={results.bracketSlots}
                numSims={effectiveNumSims}
                countryCodeMap={Object.fromEntries(
                  Object.keys(PELE_RATINGS).map(t => [t, getCountryCode(t) ?? ''])
                )}
                pickMode={{
                  // Effective picks (locked + user) drive the "isPicked"
                  // highlight so already-decided matches render pre-selected.
                  picks: effectiveWhatIfPicks,
                  onPick: handleWhatIfPick,
                  slotForSide: whatIfSlotForSide,
                  teamForSlot: whatIfTeamForSlot,
                }}
              />
            </Box>
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
                {(tournamentStarted || standingsRevealed) && (
                  <FormControl size="small" sx={{ minWidth: 140 }}>
                    <InputLabel>Scope</InputLabel>
                    <Select
                      value={standingsScope}
                      label="Scope"
                      onChange={(e) => setStandingsScope(e.target.value as 'overall' | 'groups' | 'knockout')}
                    >
                      <MenuItem value="overall">Overall</MenuItem>
                      <MenuItem value="groups">Group Stage</MenuItem>
                      <MenuItem value="knockout">Knockouts</MenuItem>
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
                  // Per-player pick availability so the scope tabs can hide
                  // rows that have nothing to score in that scope (they'd
                  // otherwise sit at the bottom at 0 pts, cluttering the view).
                  const picksByKey: Record<string, { hasGroup: boolean; hasKnockout: boolean }> = {};
                  for (const p of players ?? []) {
                    picksByKey[p.key] = {
                      hasGroup: p.group_predictions.length > 0,
                      hasKnockout: Object.keys(p.knockout_picks).length > 0,
                    };
                  }
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
                        scope={standingsScope}
                        picksByKey={picksByKey}
                        players={players}
                        scoringSettings={scoring}
                        bracketData={tournamentBracketData}
                        groupStageResults={tournamentGroupStage}
                        knockoutMatchups={tournamentKnockoutMatchups}
                        currentKnockoutResults={actualResultsWithWhatIf?.knockoutWinners ?? {}}
                        baselineKnockoutResults={actualResults?.knockoutWinners ?? {}}
                        whatIfCount={Object.keys(whatIfPicks).length}
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
