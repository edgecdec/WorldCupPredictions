'use client';
import { useCallback } from 'react';
import { Box, Typography } from '@mui/material';
import Matchup from './Matchup';
import { KnockoutMatchup } from '@/types';
import { cascadeClear, getMatchupsByRound, ROUND_R32, ROUND_R16, ROUND_QF, ROUND_SF, ROUND_3RD, ROUND_FINAL, ROUND_LABELS } from '@/lib/bracketUtils';

interface KnockoutBracketProps {
  matchups: KnockoutMatchup[];
  picks: Record<string, string>;
  onPick?: (matchupId: string, team: string) => void;
  readOnly?: boolean;
  results?: Record<string, string>;
  countryCodeMap?: Record<string, string>;
}

// Left half: R32-1..R32-8, R16-1..R16-4, QF-1..QF-2, SF-1
// Right half: R32-9..R32-16, R16-5..R16-8, QF-3..QF-4, SF-2
const LEFT_IDS: Record<number, string[]> = {
  [ROUND_R32]: ['R32-1', 'R32-2', 'R32-3', 'R32-4', 'R32-5', 'R32-6', 'R32-7', 'R32-8'],
  [ROUND_R16]: ['R16-1', 'R16-2', 'R16-3', 'R16-4'],
  [ROUND_QF]: ['QF-1', 'QF-2'],
  [ROUND_SF]: ['SF-1'],
};
const RIGHT_IDS: Record<number, string[]> = {
  [ROUND_R32]: ['R32-9', 'R32-10', 'R32-11', 'R32-12', 'R32-13', 'R32-14', 'R32-15', 'R32-16'],
  [ROUND_R16]: ['R16-5', 'R16-6', 'R16-7', 'R16-8'],
  [ROUND_QF]: ['QF-3', 'QF-4'],
  [ROUND_SF]: ['SF-2'],
};

const CONNECTOR_COLOR = 'divider';

function RoundColumn({
  matchups,
  ids,
  picks,
  onPick,
  readOnly,
  results,
  countryCodeMap,
}: {
  matchups: KnockoutMatchup[];
  ids: string[];
  picks: Record<string, string>;
  onPick?: (matchupId: string, team: string) => void;
  readOnly?: boolean;
  results?: Record<string, string>;
  countryCodeMap?: Record<string, string>;
}) {
  const matchupMap = new Map(matchups.map((m) => [m.id, m]));
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', minWidth: 160, flexShrink: 0 }}>
      {ids.map((id) => {
        const m = matchupMap.get(id);
        if (!m) return <Box key={id} sx={{ flex: 1 }} />;
        return (
          <Box key={id} sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Matchup matchup={m} userPick={picks[id]} onPick={onPick} readOnly={readOnly} result={results?.[id]} countryCodeMap={countryCodeMap} />
          </Box>
        );
      })}
    </Box>
  );
}

function ConnectorColumn({ pairCount, direction }: { pairCount: number; direction: 'left' | 'right' }) {
  const isLeft = direction === 'left';
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', width: 16, flexShrink: 0 }}>
      {Array.from({ length: pairCount }, (_, i) => (
        <Box key={i} sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative' }}>
          <Box sx={{ flex: 1, ...(isLeft ? { borderRight: 2, borderBottom: 2, borderColor: CONNECTOR_COLOR } : { borderLeft: 2, borderBottom: 2, borderColor: CONNECTOR_COLOR }) }} />
          <Box sx={{ flex: 1, ...(isLeft ? { borderRight: 2, borderTop: 2, borderColor: CONNECTOR_COLOR } : { borderLeft: 2, borderTop: 2, borderColor: CONNECTOR_COLOR }) }} />
        </Box>
      ))}
    </Box>
  );
}

function RoundLabel({ label }: { label: string }) {
  return (
    <Typography variant="caption" sx={{ textAlign: 'center', fontWeight: 700, color: 'text.secondary', mb: 0.5 }}>
      {label}
    </Typography>
  );
}

export default function KnockoutBracket({ matchups, picks, onPick, readOnly, results, countryCodeMap }: KnockoutBracketProps) {
  const byRound = getMatchupsByRound(matchups);
  const allMatchups = matchups;

  const handlePick = useCallback(
    (matchupId: string, team: string) => {
      if (!onPick) return;
      const cleared = cascadeClear(picks, matchupId, allMatchups);
      // The parent should set picks to { ...cleared, [matchupId]: team }
      // But since onPick is per-matchup, we need to communicate the cascade.
      // We call onPick which the parent handles with cascade logic.
      onPick(matchupId, team);
    },
    [onPick, picks, allMatchups],
  );

  const leftRounds = [ROUND_R32, ROUND_R16, ROUND_QF, ROUND_SF] as const;
  const rightRounds = [ROUND_SF, ROUND_QF, ROUND_R16, ROUND_R32] as const;

  // Center matchups: Final and 3rd place
  const finalMatchup = (byRound.get(ROUND_FINAL) ?? [])[0];
  const thirdMatchup = (byRound.get(ROUND_3RD) ?? [])[0];

  return (
    <Box sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', pb: 2 }}>
      {/* Round labels */}
      <Box sx={{ display: 'flex', alignItems: 'flex-end', minWidth: 'fit-content', mb: 0.5 }}>
        {/* Left labels */}
        {leftRounds.map((r) => (
          <Box key={`ll-${r}`} sx={{ minWidth: 160, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
            <RoundLabel label={ROUND_LABELS[r]} />
          </Box>
        ))}
        {/* Connector spacers for left */}
        {/* We need to interleave spacers — simpler to just put labels above the bracket */}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'stretch', minWidth: 'fit-content', minHeight: 500 }}>
        {/* Left half: R32 → R16 → QF → SF */}
        {leftRounds.map((round, i) => (
          <Box key={`left-${round}`} sx={{ display: 'contents' }}>
            <RoundColumn
              matchups={byRound.get(round) ?? []}
              ids={LEFT_IDS[round]}
              picks={picks}
              onPick={handlePick}
              readOnly={readOnly}
              results={results}
              countryCodeMap={countryCodeMap}
            />
            {i < leftRounds.length - 1 && (
              <ConnectorColumn pairCount={LEFT_IDS[round].length / 2} direction="left" />
            )}
          </Box>
        ))}

        {/* Center: Final + 3rd */}
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minWidth: 180, mx: 1, gap: 3 }}>
          {finalMatchup && (
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'warning.main' }}>
                🏆 Final
              </Typography>
              <Matchup matchup={finalMatchup} userPick={picks[finalMatchup.id]} onPick={handlePick} readOnly={readOnly} result={results?.[finalMatchup.id]} countryCodeMap={countryCodeMap} />
            </Box>
          )}
          {thirdMatchup && (
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                🥉 3rd Place
              </Typography>
              <Matchup matchup={thirdMatchup} userPick={picks[thirdMatchup.id]} onPick={handlePick} readOnly={readOnly} result={results?.[thirdMatchup.id]} countryCodeMap={countryCodeMap} />
            </Box>
          )}
        </Box>

        {/* Right half: SF → QF → R16 → R32 */}
        {rightRounds.map((round, i) => (
          <Box key={`right-${round}`} sx={{ display: 'contents' }}>
            {i > 0 && (
              <ConnectorColumn pairCount={RIGHT_IDS[round].length / 2} direction="right" />
            )}
            <RoundColumn
              matchups={byRound.get(round) ?? []}
              ids={RIGHT_IDS[round]}
              picks={picks}
              onPick={handlePick}
              readOnly={readOnly}
              results={results}
              countryCodeMap={countryCodeMap}
            />
          </Box>
        ))}
      </Box>
    </Box>
  );
}
