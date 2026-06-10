'use client';
import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import Matchup from './Matchup';
import { KnockoutMatchup } from '@/types';
import { ROUND_R32, ROUND_R16, ROUND_QF, ROUND_SF, ROUND_3RD, ROUND_FINAL, ROUND_LABELS } from '@/lib/bracketUtils';
import { getFeederMatchupIds } from '@/lib/knockoutBracket';

interface MediumBracketProps {
  matchups: KnockoutMatchup[];
  picks: Record<string, string>;
  onPick?: (matchupId: string, team: string) => void;
  readOnly?: boolean;
  results?: Record<string, string>;
  countryCodeMap?: Record<string, string>;
}

const CONNECTOR_COLOR = 'divider';

/**
 * Walk the FIFA feeder tree from a root match down to R32, returning the
 * top-to-bottom ordering of matches at each round. Same logic as the desktop
 * KnockoutBracket — reused so connectors line up correctly.
 */
function walkFeederIds(rootId: string, depth: number): string[][] {
  const layers: string[][] = [[rootId]];
  for (let d = 0; d < depth; d++) {
    const last = layers[layers.length - 1];
    const next: string[] = [];
    for (const id of last) {
      const f = getFeederMatchupIds(id);
      if (f) next.push(f[0], f[1]);
    }
    layers.push(next);
  }
  return layers;
}

function ConnectorColumn({ pairCount, direction }: { pairCount: number; direction: 'left' | 'right' }) {
  const isLeft = direction === 'left';
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', width: 14, flexShrink: 0 }}>
      {Array.from({ length: pairCount }, (_, i) => (
        <Box key={i} sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative' }}>
          <Box sx={{ flex: 1, ...(isLeft ? { borderRight: 2, borderBottom: 2, borderColor: CONNECTOR_COLOR } : { borderLeft: 2, borderBottom: 2, borderColor: CONNECTOR_COLOR }) }} />
          <Box sx={{ flex: 1, ...(isLeft ? { borderRight: 2, borderTop: 2, borderColor: CONNECTOR_COLOR } : { borderLeft: 2, borderTop: 2, borderColor: CONNECTOR_COLOR }) }} />
        </Box>
      ))}
    </Box>
  );
}

function RoundColumn({
  ids, matchupMap, picks, onPick, readOnly, results, countryCodeMap, isFinalCol,
}: {
  ids: string[];
  matchupMap: Map<string, KnockoutMatchup>;
  picks: Record<string, string>;
  onPick?: (matchupId: string, team: string) => void;
  readOnly?: boolean;
  results?: Record<string, string>;
  countryCodeMap?: Record<string, string>;
  isFinalCol?: boolean;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', minWidth: 160, flexShrink: 0 }}>
      {ids.map((id) => {
        const m = matchupMap.get(id);
        if (!m) return <Box key={id} sx={{ flex: 1 }} />;
        return (
          <Box key={id} sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Matchup
              matchup={m}
              userPick={picks[id]}
              onPick={onPick}
              readOnly={readOnly}
              result={results?.[id]}
              countryCodeMap={countryCodeMap}
              isChampionPick={isFinalCol}
            />
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * Medium-screen bracket layout: a single horizontal flow R32 → R16 → QF → SF
 * → Final → 3rd Place. Used when the desktop split won't fit but we still
 * want all rounds visible at once (with horizontal scroll).
 */
export default function MediumBracket({ matchups, picks, onPick, readOnly, results, countryCodeMap }: MediumBracketProps) {
  const matchupMap = useMemo(() => new Map(matchups.map((m) => [m.id, m])), [matchups]);

  // Walk from each SF down to get FIFA-correct ordering, then concatenate.
  const layers = useMemo(() => {
    const left = walkFeederIds('SF-1', 3);  // [SF-1], [QF-1,QF-2], [R16x4], [R32x8]
    const right = walkFeederIds('SF-2', 3);
    return {
      r32: [...left[3], ...right[3]],
      r16: [...left[2], ...right[2]],
      qf: [...left[1], ...right[1]],
      sf: [...left[0], ...right[0]],
    };
  }, []);

  const finalIds = ['FINAL'];
  const thirdIds = ['3RD'];

  // Stack the labels and bracket flow as siblings so a single shared layout
  // keeps them aligned. We render each round's label + matchups in one column.
  const cols: Array<{ key: string; label: string; ids: string[]; isConnector?: boolean; isFinalCol?: boolean; pairCount?: number; direction?: 'left' | 'right' }> = [
    { key: 'r32', label: ROUND_LABELS[ROUND_R32], ids: layers.r32 },
    { key: 'conn-r32-r16', label: '', ids: [], isConnector: true, pairCount: layers.r16.length, direction: 'left' },
    { key: 'r16', label: ROUND_LABELS[ROUND_R16], ids: layers.r16 },
    { key: 'conn-r16-qf', label: '', ids: [], isConnector: true, pairCount: layers.qf.length, direction: 'left' },
    { key: 'qf', label: ROUND_LABELS[ROUND_QF], ids: layers.qf },
    { key: 'conn-qf-sf', label: '', ids: [], isConnector: true, pairCount: layers.sf.length, direction: 'left' },
    { key: 'sf', label: ROUND_LABELS[ROUND_SF], ids: layers.sf },
    { key: 'conn-sf-final', label: '', ids: [], isConnector: true, pairCount: 1, direction: 'left' },
    { key: 'final', label: '🏆 Final', ids: finalIds, isFinalCol: true },
    { key: 'gap-final-3rd', label: '', ids: [], isConnector: true, pairCount: 0 },
    { key: 'third', label: '🥉 3rd Place', ids: thirdIds },
  ];

  return (
    <Box sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', pb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'stretch', minWidth: 'fit-content' }}>
        {cols.map((c) => {
          if (c.isConnector) {
            // Connector column: empty header space + connector content stacked vertically.
            return (
              <Box key={c.key} sx={{ display: 'flex', flexDirection: 'column', flexShrink: 0, width: 14 }}>
                {/* Spacer matching the label row height */}
                <Box sx={{ visibility: 'hidden', mb: 0.5 }}>
                  <Typography variant="caption" sx={{ fontSize: '0.65rem' }}>·</Typography>
                </Box>
                {(c.pairCount ?? 0) > 0 ? (
                  <Box sx={{ flex: 1, minHeight: 480 }}>
                    <ConnectorColumn pairCount={c.pairCount!} direction={c.direction ?? 'left'} />
                  </Box>
                ) : (
                  <Box sx={{ flex: 1 }} />
                )}
              </Box>
            );
          }
          return (
            <Box key={c.key} sx={{ display: 'flex', flexDirection: 'column', flexShrink: 0, minWidth: 160 }}>
              <Typography
                variant="caption"
                component="div"
                sx={{
                  textAlign: 'center', fontWeight: 700,
                  color: c.key === 'final' ? 'warning.main' : 'text.secondary',
                  fontSize: '0.65rem', mb: 0.5,
                }}
              >
                {c.label}
              </Typography>
              <Box sx={{ flex: 1, minHeight: 480 }}>
                <RoundColumn
                  ids={c.ids}
                  matchupMap={matchupMap}
                  picks={picks}
                  onPick={onPick}
                  readOnly={readOnly}
                  results={results}
                  countryCodeMap={countryCodeMap}
                  isFinalCol={c.isFinalCol}
                />
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
