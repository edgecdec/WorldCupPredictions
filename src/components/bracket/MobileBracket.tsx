'use client';
import { useState, useMemo } from 'react';
import { Box, Tabs, Tab, Typography, Button } from '@mui/material';
import Matchup from './Matchup';
import { KnockoutMatchup } from '@/types';
import { ROUND_R32, ROUND_R16, ROUND_QF, ROUND_SF, ROUND_3RD, ROUND_FINAL, ROUND_LABELS } from '@/lib/bracketUtils';
import { getFeederMatchupIds } from '@/lib/knockoutBracket';

interface MobileBracketProps {
  matchups: KnockoutMatchup[];
  picks: Record<string, string>;
  onPick?: (matchupId: string, team: string) => void;
  readOnly?: boolean;
  results?: Record<string, string>;
  countryCodeMap?: Record<string, string>;
}

const TAB_LABELS = ['R32 → R16', 'R16 → QF', 'QF → SF', 'SF → Final'] as const;

interface TabConfig {
  leftRound: number;
  rightRound: number;
  /** Order of right-round matches; left feeders are derived from these. */
  rightIds: string[];
}

/**
 * Walk the FIFA feeder tree from SF down so the mobile order matches the
 * desktop's top-to-bottom layout. Returns matches in [SF-1 subtree, SF-2 subtree]
 * order.
 */
function walkFromSf(depth: number): string[] {
  const collect = (root: string, d: number): string[] => {
    let layers: string[][] = [[root]];
    for (let i = 0; i < d; i++) {
      const next: string[] = [];
      for (const id of layers[layers.length - 1]) {
        const f = getFeederMatchupIds(id);
        if (f) next.push(...f);
      }
      layers.push(next);
    }
    return layers[layers.length - 1];
  };
  return [...collect('SF-1', depth), ...collect('SF-2', depth)];
}

/**
 * Build the per-tab match layout. Mirrors the desktop split: each right-round
 * match shows next to its 2 feeder matches (stacked) on the left. The right-side
 * round IDs use the FIFA-walk order from SF down so mobile reads top-to-bottom
 * the same way the desktop does.
 *
 * For SF → Final, the layout is special: 2 SF matches on the left, the Final
 * AND the 3rd-place game on the right (since both are fed by SF losers/winners).
 */
function buildTabConfigs(): TabConfig[] {
  // R16 in FIFA-walk order: [R16-1, R16-2, R16-5, R16-6, R16-3, R16-4, R16-7, R16-8]
  const r16Ids = walkFromSf(2);
  // QF in FIFA-walk order: [QF-1, QF-2, QF-3, QF-4]
  const qfIds = walkFromSf(1);
  // SF in FIFA-walk order: [SF-1, SF-2]
  const sfIds = walkFromSf(0);
  return [
    { leftRound: ROUND_R32, rightRound: ROUND_R16, rightIds: r16Ids },
    { leftRound: ROUND_R16, rightRound: ROUND_QF, rightIds: qfIds },
    { leftRound: ROUND_QF, rightRound: ROUND_SF, rightIds: sfIds },
    // SF → Final tab handled specially — see render below.
    { leftRound: ROUND_SF, rightRound: ROUND_FINAL, rightIds: ['FINAL', '3RD'] },
  ];
}

/**
 * Renders a single feeder pair: 2 left matches stacked, connector, 1 right match.
 * For 3RD, both feeders are SF games — and we show the LOSERS as effective teams
 * (already handled by the bracket engine's effective propagation upstream).
 */
function MatchupPair({
  rightId,
  leftIds,
  matchups,
  picks,
  onPick,
  readOnly,
  results,
  countryCodeMap,
}: {
  rightId: string;
  leftIds: [string, string];
  matchups: KnockoutMatchup[];
  picks: Record<string, string>;
  onPick?: (matchupId: string, team: string) => void;
  readOnly?: boolean;
  results?: Record<string, string>;
  countryCodeMap?: Record<string, string>;
}) {
  const matchupMap = useMemo(() => new Map(matchups.map((m) => [m.id, m])), [matchups]);
  const left0 = matchupMap.get(leftIds[0]);
  const left1 = matchupMap.get(leftIds[1]);
  const right = matchupMap.get(rightId);

  return (
    <Box sx={{ display: 'flex', alignItems: 'stretch', mb: 1.5 }}>
      {/* Left column: 2 feeder matches stacked */}
      <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, minWidth: 0, gap: 0.5 }}>
        {left0 ? (
          <Matchup matchup={left0} userPick={picks[left0.id]} onPick={onPick} readOnly={readOnly} result={results?.[left0.id]} countryCodeMap={countryCodeMap} />
        ) : <Box sx={{ flex: 1 }} />}
        {left1 ? (
          <Matchup matchup={left1} userPick={picks[left1.id]} onPick={onPick} readOnly={readOnly} result={results?.[left1.id]} countryCodeMap={countryCodeMap} />
        ) : <Box sx={{ flex: 1 }} />}
      </Box>

      {/* Connector */}
      <Box sx={{ width: 12, flexShrink: 0, position: 'relative' }}>
        <Box sx={{
          position: 'absolute', top: '25%', bottom: '25%', left: 0, right: 0,
          borderTop: 1, borderBottom: 1, borderRight: 1, borderColor: 'divider',
        }} />
      </Box>

      {/* Right: target match centered */}
      <Box sx={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
        {right ? (
          <Box sx={{ width: '100%' }}>
            <Matchup matchup={right} userPick={picks[right.id]} onPick={onPick} readOnly={readOnly} result={results?.[right.id]} countryCodeMap={countryCodeMap} isChampionPick={right.id === 'FINAL'} />
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

export default function MobileBracket({ matchups, picks, onPick, readOnly, results, countryCodeMap }: MobileBracketProps) {
  const [tab, setTab] = useState(0);
  const tabs = useMemo(buildTabConfigs, []);
  const cfg = tabs[tab];

  const handlePrev = () => setTab((t) => Math.max(0, t - 1));
  const handleNext = () => setTab((t) => Math.min(tabs.length - 1, t + 1));

  return (
    <Box>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="fullWidth"
        sx={{ mb: 2 }}
      >
        {TAB_LABELS.map((label) => (
          <Tab key={label} label={label} sx={{ fontSize: '0.7rem', minHeight: 40, px: 0.5 }} />
        ))}
      </Tabs>

      <Box sx={{ display: 'flex', gap: 0, mb: 1 }}>
        <Typography variant="caption" sx={{ flex: 1, fontWeight: 700, textAlign: 'center', color: 'text.secondary', fontSize: '0.65rem' }}>
          {ROUND_LABELS[cfg.leftRound]}
        </Typography>
        <Box sx={{ width: 12 }} />
        <Typography variant="caption" sx={{ flex: 1, fontWeight: 700, textAlign: 'center', color: 'text.secondary', fontSize: '0.65rem' }}>
          {ROUND_LABELS[cfg.rightRound]}
        </Typography>
      </Box>

      <Box>
        {cfg.rightIds.map((rid) => {
          const feeders = getFeederMatchupIds(rid);
          if (!feeders) return null;
          return (
            <MatchupPair
              key={rid}
              rightId={rid}
              leftIds={feeders}
              matchups={matchups}
              picks={picks}
              onPick={onPick}
              readOnly={readOnly}
              results={results}
              countryCodeMap={countryCodeMap}
            />
          );
        })}
      </Box>

      <Box sx={{ display: 'flex', justifyContent: tab === 0 ? 'flex-end' : tab === tabs.length - 1 ? 'flex-start' : 'space-between', mt: 2, mb: 1 }}>
        {tab > 0 && (
          <Button variant="outlined" size="small" onClick={handlePrev}>
            ← {TAB_LABELS[tab - 1]}
          </Button>
        )}
        {tab < tabs.length - 1 && (
          <Button variant="outlined" size="small" onClick={handleNext}>
            {TAB_LABELS[tab + 1]} →
          </Button>
        )}
      </Box>
    </Box>
  );
}
