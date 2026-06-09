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

  return (
    <Box sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', pb: 2 }}>
      {/* Round labels row */}
      <Box sx={{ display: 'flex', alignItems: 'flex-end', minWidth: 'fit-content', mb: 0.5 }}>
        {[
          { round: ROUND_R32, count: layers.r32.length },
          { round: ROUND_R16, count: layers.r16.length },
          { round: ROUND_QF, count: layers.qf.length },
          { round: ROUND_SF, count: layers.sf.length },
          { round: ROUND_FINAL, count: 1 },
          { round: ROUND_3RD, count: 1 },
        ].map(({ round }, i, arr) => (
          <Box key={round} sx={{ display: 'contents' }}>
            <Box sx={{ minWidth: 160, flexShrink: 0, textAlign: 'center' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: round === ROUND_FINAL ? 'warning.main' : 'text.secondary', fontSize: '0.65rem' }}>
                {round === ROUND_FINAL ? '🏆 Final' : round === ROUND_3RD ? '🥉 3rd Place' : ROUND_LABELS[round]}
              </Typography>
            </Box>
            {i < arr.length - 1 && <Box sx={{ width: 14, flexShrink: 0 }} />}
          </Box>
        ))}
      </Box>

      {/* Bracket flow */}
      <Box sx={{ display: 'flex', alignItems: 'stretch', minWidth: 'fit-content', minHeight: 480 }}>
        <RoundColumn ids={layers.r32} matchupMap={matchupMap} picks={picks} onPick={onPick} readOnly={readOnly} results={results} countryCodeMap={countryCodeMap} />
        <ConnectorColumn pairCount={layers.r16.length} direction="left" />
        <RoundColumn ids={layers.r16} matchupMap={matchupMap} picks={picks} onPick={onPick} readOnly={readOnly} results={results} countryCodeMap={countryCodeMap} />
        <ConnectorColumn pairCount={layers.qf.length} direction="left" />
        <RoundColumn ids={layers.qf} matchupMap={matchupMap} picks={picks} onPick={onPick} readOnly={readOnly} results={results} countryCodeMap={countryCodeMap} />
        <ConnectorColumn pairCount={layers.sf.length} direction="left" />
        <RoundColumn ids={layers.sf} matchupMap={matchupMap} picks={picks} onPick={onPick} readOnly={readOnly} results={results} countryCodeMap={countryCodeMap} />
        <ConnectorColumn pairCount={1} direction="left" />
        <RoundColumn ids={finalIds} matchupMap={matchupMap} picks={picks} onPick={onPick} readOnly={readOnly} results={results} countryCodeMap={countryCodeMap} isFinalCol />
        <Box sx={{ width: 14, flexShrink: 0 }} />
        <RoundColumn ids={thirdIds} matchupMap={matchupMap} picks={picks} onPick={onPick} readOnly={readOnly} results={results} countryCodeMap={countryCodeMap} />
      </Box>
    </Box>
  );
}
