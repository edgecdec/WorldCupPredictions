'use client';
import { useState, useMemo } from 'react';
import {
  Box, Typography, Tabs, Tab, Table, TableHead, TableBody, TableRow, TableCell,
  TableSortLabel, Paper, Chip, Tooltip, useMediaQuery, useTheme, Drawer, IconButton, Popover,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import type { LeaderboardEntry } from '@/types';
import UserLink from '@/components/common/UserLink';
import BracketLink from '@/components/common/BracketLink';
import ScoreHistogram from '@/components/common/ScoreHistogram';

const GROUP_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const;
const ROUND_LABELS = ['R32', 'R16', 'QF', 'SF', '3RD', 'FINAL'] as const;

const COL_USER_WIDTH = 140;
const COL_RANK_WIDTH = 36;
const COL_PTS_WIDTH = 50;
const COL_EXP_WIDTH = 70;
const COL_BUCKET_WIDTH = 52;

export interface BucketScoreTableProps {
  /** Leaderboard rows from the API. */
  entries: LeaderboardEntry[];
  currentUsername: string;
  /** Map of userKey ('username|bracket_name') → expected total score from worker. */
  expectedScoresByKey?: Record<string, number>;
  /** Map of userKey → per-group expected scores from worker. */
  expectedGroupScoresByKey?: Record<string, Record<string, number>>;
  /** Map of userKey → per-round expected scores from worker. */
  expectedRoundScoresByKey?: Record<string, Record<string, number>>;
  /** Map of userKey → per-group score distributions (for hover histograms). */
  groupDistributionsByKey?: Record<string, Record<string, Record<number, number>>>;
  /** Map of userKey → per-round score distributions (for hover histograms). */
  roundDistributionsByKey?: Record<string, Record<string, Record<number, number>>>;
  /** Map of userKey → overall score distribution (for Exp Pts hover). */
  scoreDistributionsByKey?: Record<string, Record<number, number>>;
  /** Optional click handler for a row to open a deeper breakdown dialog. */
  onRowClick?: (entry: LeaderboardEntry) => void;
}

type Mode = 'groups' | 'knockout';
type SortKey = 'rank' | 'totalScore' | 'expectedScore' | { type: 'group'; name: string } | { type: 'round'; name: string };

function userKey(entry: LeaderboardEntry): string {
  return `${entry.username}|${entry.bracket_name}`;
}

/** Sticky Exp Pts cell with hover histogram of total score distribution. */
function ExpPtsCell({
  rowBg, expectedScore, distribution, label,
}: {
  rowBg: string;
  expectedScore: number;
  distribution?: Record<number, number>;
  label: string;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const hasHistogram = distribution && Object.keys(distribution).length > 0;
  return (
    <TableCell
      align="right"
      onMouseEnter={hasHistogram ? (e) => setAnchor(e.currentTarget) : undefined}
      onMouseLeave={() => setAnchor(null)}
      sx={{
        position: 'sticky', left: COL_RANK_WIDTH + COL_USER_WIDTH + COL_PTS_WIDTH, zIndex: 1,
        bgcolor: rowBg,
        minWidth: COL_EXP_WIDTH, maxWidth: COL_EXP_WIDTH,
        py: 0.5, px: 0.5,
        fontWeight: 700,
        cursor: hasHistogram ? 'help' : 'default',
        textDecoration: hasHistogram ? 'underline dotted' : 'none',
        textUnderlineOffset: '2px',
        boxShadow: '4px 0 6px -4px rgba(0,0,0,0.15)',
      }}
    >
      {expectedScore.toFixed(1)}
      {hasHistogram && (
        <Popover
          open={Boolean(anchor)}
          anchorEl={anchor}
          onClose={() => setAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          transformOrigin={{ vertical: 'top', horizontal: 'center' }}
          disableRestoreFocus
          disableAutoFocus
          disableEnforceFocus
          disableScrollLock
          sx={{ pointerEvents: 'none' }}
          slotProps={{ paper: { sx: { p: 1.5 } } }}
        >
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5, textTransform: 'uppercase', fontSize: '0.6rem' }}>
            {label} — score distribution
          </Typography>
          <ScoreHistogram distribution={distribution!} avgScore={expectedScore} />
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5, fontSize: '0.65rem' }}>
            Each bar = % of sims with that exact total score.
          </Typography>
        </Popover>
      )}
    </TableCell>
  );
}

/** A single bucket cell — locked actual or italic expected. Hovering an expected
 *  cell shows a small histogram of the distribution. */
function BucketCell({
  locked, expected, distribution, label, isLive,
}: {
  locked?: number;
  expected?: number;
  /** Score → fraction-of-sims distribution; only used when expected (not locked). */
  distribution?: Record<number, number>;
  /** Label for the popover header (e.g. 'Group A', 'R32'). */
  label?: string;
  isLive?: boolean;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const hasHistogram = locked == null && expected != null && distribution && Object.keys(distribution).length > 0;

  if (locked != null) {
    return (
      <TableCell align="center" sx={{ py: 0.5, px: 0.25, fontWeight: 700, fontSize: '0.8rem', minWidth: COL_BUCKET_WIDTH }}>
        {locked}
      </TableCell>
    );
  }
  if (expected != null) {
    return (
      <TableCell
        align="center"
        onMouseEnter={hasHistogram ? (e) => setAnchor(e.currentTarget) : undefined}
        onMouseLeave={() => setAnchor(null)}
        sx={{
          py: 0.5, px: 0.25,
          fontStyle: 'italic',
          color: isLive ? 'warning.main' : 'text.secondary',
          fontSize: '0.75rem',
          minWidth: COL_BUCKET_WIDTH,
          cursor: hasHistogram ? 'help' : 'default',
          textDecoration: hasHistogram ? 'underline dotted' : 'none',
          textUnderlineOffset: '2px',
        }}
      >
        {expected.toFixed(1)}
        {hasHistogram && (
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
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5, textTransform: 'uppercase', fontSize: '0.6rem' }}>
              {label} — score distribution
            </Typography>
            <ScoreHistogram distribution={distribution!} avgScore={expected} width={240} height={100} />
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5, fontSize: '0.6rem' }}>
              Each bar = % of sims with that exact score.
            </Typography>
          </Popover>
        )}
      </TableCell>
    );
  }
  return (
    <TableCell align="center" sx={{ py: 0.5, px: 0.25, color: 'text.disabled', fontSize: '0.75rem', minWidth: COL_BUCKET_WIDTH }}>
      —
    </TableCell>
  );
}

export default function BucketScoreTable({
  entries,
  currentUsername,
  expectedScoresByKey = {},
  expectedGroupScoresByKey = {},
  expectedRoundScoresByKey = {},
  groupDistributionsByKey = {},
  roundDistributionsByKey = {},
  scoreDistributionsByKey = {},
  onRowClick,
}: BucketScoreTableProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mode, setMode] = useState<Mode>('groups');
  const [drawerEntry, setDrawerEntry] = useState<LeaderboardEntry | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('expectedScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Compute effective expected score per entry: API totalScore (locked) + remaining
  // expected for unlocked picks. As a simple approximation, use the worker's
  // expectedScoresByKey when present, else fall back to API totalScore.
  const enriched = useMemo(() => {
    return entries.map((e) => {
      const key = userKey(e);
      const expectedTotal = expectedScoresByKey[key];
      return {
        entry: e,
        expectedScore: expectedTotal ?? e.totalScore,
        groupExp: expectedGroupScoresByKey[key] ?? {},
        roundExp: expectedRoundScoresByKey[key] ?? {},
      };
    });
  }, [entries, expectedScoresByKey, expectedGroupScoresByKey, expectedRoundScoresByKey]);

  const sorted = useMemo(() => {
    // signMul converts a "desc" comparison (b-a) into the requested direction:
    // sortDir=desc → multiply by 1 (b-a stays desc).
    // sortDir=asc  → multiply by -1 (becomes a-b, ascending).
    const signMul = sortDir === 'desc' ? 1 : -1;
    return [...enriched].sort((a, b) => {
      // Primary: locked totalScore desc, then expectedScore desc.
      // Sort key overrides this.
      if (sortKey === 'rank' || sortKey === 'totalScore') {
        // Rank/Pts column: locked points primary, expected as tiebreaker.
        const dt = b.entry.totalScore - a.entry.totalScore;
        if (dt !== 0) return dt * signMul;
        return (b.expectedScore - a.expectedScore) * signMul;
      }
      if (sortKey === 'expectedScore') {
        // Locked totalScore is the primary tiebreaker — never inverted by sortDir
        // because we want users with real points to anchor above expected ones.
        // Within tied totalScore, expectedScore follows the sortDir direction.
        const dt = b.entry.totalScore - a.entry.totalScore;
        if (dt !== 0) return dt;
        return (b.expectedScore - a.expectedScore) * signMul;
      }
      if (typeof sortKey === 'object') {
        if (sortKey.type === 'group') {
          const aLocked = a.entry.groupScoresLocked?.[sortKey.name];
          const bLocked = b.entry.groupScoresLocked?.[sortKey.name];
          const aVal = aLocked != null ? aLocked : (a.groupExp[sortKey.name] ?? 0);
          const bVal = bLocked != null ? bLocked : (b.groupExp[sortKey.name] ?? 0);
          return (bVal - aVal) * signMul;
        }
        const aLocked = a.entry.roundScoresLocked?.[sortKey.name];
        const bLocked = b.entry.roundScoresLocked?.[sortKey.name];
        const aVal = aLocked != null ? aLocked : (a.roundExp[sortKey.name] ?? 0);
        const bVal = bLocked != null ? bLocked : (b.roundExp[sortKey.name] ?? 0);
        return (bVal - aVal) * signMul;
      }
      return 0;
    });
  }, [enriched, sortKey, sortDir]);

  const ranked = useMemo(() => sorted.map((s, i) => ({ ...s, rank: i + 1 })), [sorted]);

  const handleSort = (key: SortKey) => {
    if (typeof key === typeof sortKey && JSON.stringify(key) === JSON.stringify(sortKey)) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const isSortActive = (key: SortKey): boolean =>
    JSON.stringify(key) === JSON.stringify(sortKey);

  const renderHeader = () => (
    <TableHead>
      <TableRow>
        <TableCell
          sx={{
            position: 'sticky', left: 0, zIndex: 3, bgcolor: 'background.paper',
            minWidth: COL_RANK_WIDTH, maxWidth: COL_RANK_WIDTH,
            fontWeight: 700, py: 1, px: 0.5,
          }}
        >
          <TableSortLabel active={isSortActive('rank')} direction={sortDir} onClick={() => handleSort('rank')}>
            #
          </TableSortLabel>
        </TableCell>
        <TableCell
          sx={{
            position: 'sticky', left: COL_RANK_WIDTH, zIndex: 3, bgcolor: 'background.paper',
            minWidth: COL_USER_WIDTH, maxWidth: COL_USER_WIDTH,
            fontWeight: 700, py: 1, px: 1,
          }}
        >
          User
        </TableCell>
        <TableCell
          align="right"
          sx={{
            position: 'sticky', left: COL_RANK_WIDTH + COL_USER_WIDTH, zIndex: 3,
            bgcolor: 'background.paper',
            minWidth: COL_PTS_WIDTH, maxWidth: COL_PTS_WIDTH,
            fontWeight: 700, py: 1, px: 0.5,
          }}
        >
          <TableSortLabel
            active={isSortActive('totalScore')}
            direction={sortDir}
            onClick={() => handleSort('totalScore')}
          >
            Pts
          </TableSortLabel>
        </TableCell>
        <TableCell
          align="right"
          sx={{
            position: 'sticky', left: COL_RANK_WIDTH + COL_USER_WIDTH + COL_PTS_WIDTH, zIndex: 3,
            bgcolor: 'background.paper',
            minWidth: COL_EXP_WIDTH, maxWidth: COL_EXP_WIDTH,
            fontWeight: 700, py: 1, px: 0.5,
            // Right-edge shadow to indicate the rest scrolls
            boxShadow: '4px 0 6px -4px rgba(0,0,0,0.15)',
          }}
        >
          <TableSortLabel
            active={isSortActive('expectedScore')}
            direction={sortDir}
            onClick={() => handleSort('expectedScore')}
          >
            Exp Pts
          </TableSortLabel>
        </TableCell>
        {mode === 'groups' && GROUP_NAMES.map((g) => (
          <TableCell key={g} align="center" sx={{ fontWeight: 700, minWidth: COL_BUCKET_WIDTH, py: 1, px: 0.25 }}>
            <TableSortLabel
              active={isSortActive({ type: 'group', name: g })}
              direction={sortDir}
              onClick={() => handleSort({ type: 'group', name: g })}
            >
              {g}
            </TableSortLabel>
          </TableCell>
        ))}
        {mode === 'knockout' && ROUND_LABELS.map((r) => (
          <TableCell key={r} align="center" sx={{ fontWeight: 700, minWidth: COL_BUCKET_WIDTH, py: 1, px: 0.25 }}>
            <TableSortLabel
              active={isSortActive({ type: 'round', name: r })}
              direction={sortDir}
              onClick={() => handleSort({ type: 'round', name: r })}
            >
              {r === '3RD' ? '3rd' : r}
            </TableSortLabel>
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
  );

  return (
    <Box>
      {/* Mobile mode toggle */}
      <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Tabs
          value={mode}
          onChange={(_, v) => setMode(v as Mode)}
          sx={{ minHeight: 32, '& .MuiTab-root': { minHeight: 32, py: 0.5 } }}
        >
          <Tab value="groups" label="Groups" />
          <Tab value="knockout" label="Knockout" />
        </Tabs>
        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          Bold = locked · Italic = expected
        </Typography>
      </Box>

      <Paper sx={{ overflowX: 'auto', overflowY: 'visible' }}>
        <Table size="small" sx={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          {renderHeader()}
          <TableBody>
            {ranked.map(({ entry, expectedScore, groupExp, roundExp, rank }) => {
              const isCurrentUser = entry.username === currentUsername;
              const rowBg = isCurrentUser ? 'action.selected' : 'background.paper';
              const ukey = userKey(entry);
              const groupDist = groupDistributionsByKey[ukey] ?? {};
              const roundDist = roundDistributionsByKey[ukey] ?? {};
              const totalDist = scoreDistributionsByKey[ukey];
              return (
                <TableRow
                  key={`${entry.username}-${entry.bracket_name}`}
                  hover
                  onClick={() => {
                    if (isMobile) setDrawerEntry(entry);
                    else if (onRowClick) onRowClick(entry);
                  }}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell
                    sx={{
                      position: 'sticky', left: 0, zIndex: 1, bgcolor: rowBg,
                      minWidth: COL_RANK_WIDTH, maxWidth: COL_RANK_WIDTH,
                      py: 0.5, px: 0.5, fontSize: '0.8rem',
                    }}
                  >
                    {rank}
                  </TableCell>
                  <TableCell
                    sx={{
                      position: 'sticky', left: COL_RANK_WIDTH, zIndex: 1, bgcolor: rowBg,
                      minWidth: COL_USER_WIDTH, maxWidth: COL_USER_WIDTH,
                      py: 0.5, px: 1,
                    }}
                  >
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.85rem' }}>
                        <UserLink username={entry.username} isCurrentUser={isCurrentUser} />
                        {entry.eliminated && (
                          <Tooltip title="Eliminated"><span>☠️</span></Tooltip>
                        )}
                        {entry.championEliminated && !entry.eliminated && (
                          <Tooltip title="Bracket Busted"><span>💀</span></Tooltip>
                        )}
                        {(entry.perfectGroups ?? 0) > 0 && (
                          <Tooltip title={`${entry.perfectGroups} perfect group${entry.perfectGroups === 1 ? '' : 's'}`}>
                            <span>🎯{entry.perfectGroups}</span>
                          </Tooltip>
                        )}
                      </Box>
                      <Box sx={{ fontSize: '0.65rem', color: 'text.secondary', mt: 0.25 }}>
                        <BracketLink username={entry.username} bracketName={entry.bracket_name} />
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      position: 'sticky', left: COL_RANK_WIDTH + COL_USER_WIDTH, zIndex: 1,
                      bgcolor: rowBg,
                      minWidth: COL_PTS_WIDTH, maxWidth: COL_PTS_WIDTH,
                      py: 0.5, px: 0.5,
                      fontWeight: 700,
                      fontSize: '0.85rem',
                    }}
                  >
                    {entry.totalScore}
                  </TableCell>
                  <ExpPtsCell
                    rowBg={rowBg}
                    expectedScore={expectedScore}
                    distribution={totalDist}
                    label={`${entry.username}${entry.bracket_name ? ` — ${entry.bracket_name}` : ''}`}
                  />
                  {mode === 'groups' && GROUP_NAMES.map((g) => (
                    <BucketCell
                      key={g}
                      locked={entry.groupScoresLocked?.[g]}
                      expected={groupExp[g]}
                      distribution={groupDist[g]}
                      label={`Group ${g}`}
                    />
                  ))}
                  {mode === 'knockout' && ROUND_LABELS.map((r) => (
                    <BucketCell
                      key={r}
                      locked={entry.roundScoresLocked?.[r]}
                      expected={roundExp[r]}
                      distribution={roundDist[r]}
                      label={r === '3RD' ? '3rd Place' : r === 'FINAL' ? 'Final' : r}
                    />
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Paper>

      {/* Mobile bottom-sheet drawer */}
      <Drawer
        anchor="bottom"
        open={Boolean(drawerEntry)}
        onClose={() => setDrawerEntry(null)}
        slotProps={{ paper: { sx: { borderTopLeftRadius: 12, borderTopRightRadius: 12, p: 2, maxHeight: '80vh' } } }}
      >
        {drawerEntry && (() => {
          const key = userKey(drawerEntry);
          const exp = expectedScoresByKey[key] ?? drawerEntry.totalScore;
          const groupExp = expectedGroupScoresByKey[key] ?? {};
          const roundExp = expectedRoundScoresByKey[key] ?? {};
          return (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6">
                  <UserLink username={drawerEntry.username} /> — <BracketLink username={drawerEntry.username} bracketName={drawerEntry.bracket_name} />
                </Typography>
                <IconButton size="small" onClick={() => setDrawerEntry(null)}>
                  <CloseIcon />
                </IconButton>
              </Box>
              <Typography variant="body2" sx={{ mb: 2 }}>
                Total Exp Pts: <strong>{exp.toFixed(1)}</strong>
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}>
                Group Stage
              </Typography>
              <Table size="small" sx={{ mb: 2 }}>
                <TableBody>
                  {GROUP_NAMES.map((g) => {
                    const locked = drawerEntry.groupScoresLocked?.[g];
                    const expectedVal = groupExp[g];
                    return (
                      <TableRow key={g}>
                        <TableCell sx={{ py: 0.5, px: 1, width: 80 }}>Group {g}</TableCell>
                        <TableCell sx={{ py: 0.5, px: 1, color: locked != null ? 'text.primary' : 'text.secondary' }}>
                          {locked != null ? '✓ FINAL' : '· pending'}
                        </TableCell>
                        <TableCell align="right" sx={{ py: 0.5, px: 1, fontWeight: locked != null ? 700 : 400, fontStyle: locked == null ? 'italic' : undefined }}>
                          {locked != null ? locked : (expectedVal != null ? expectedVal.toFixed(1) : '—')}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}>
                Knockout
              </Typography>
              <Table size="small">
                <TableBody>
                  {ROUND_LABELS.map((r) => {
                    const locked = drawerEntry.roundScoresLocked?.[r];
                    const expectedVal = roundExp[r];
                    return (
                      <TableRow key={r}>
                        <TableCell sx={{ py: 0.5, px: 1, width: 80 }}>{r === '3RD' ? '3rd Place' : r === 'FINAL' ? 'Final' : r}</TableCell>
                        <TableCell sx={{ py: 0.5, px: 1, color: locked != null ? 'text.primary' : 'text.secondary' }}>
                          {locked != null ? '✓ FINAL' : '· pending'}
                        </TableCell>
                        <TableCell align="right" sx={{ py: 0.5, px: 1, fontWeight: locked != null ? 700 : 400, fontStyle: locked == null ? 'italic' : undefined }}>
                          {locked != null ? locked : (expectedVal != null ? expectedVal.toFixed(1) : '—')}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          );
        })()}
      </Drawer>
    </Box>
  );
}

// Re-export so it's a clean import path
export { GROUP_NAMES, ROUND_LABELS };
