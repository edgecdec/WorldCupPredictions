'use client';
import { useCallback, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import Matchup from './Matchup';
import { KnockoutMatchup } from '@/types';
import { cascadeClear, getMatchupsByRound, ROUND_3RD, ROUND_LABELS } from '@/lib/bracketUtils';

interface KnockoutBracketProps {
  matchups: KnockoutMatchup[];
  picks: Record<string, string>;
  onPick?: (matchupId: string, team: string) => void;
  readOnly?: boolean;
  results?: Record<string, string>;
  countryCodeMap?: Record<string, string>;
}

const CONNECTOR_COLOR = 'divider';

/** Derive the bracket structure from matchups: normal rounds, final, 3rd place. */
function deriveBracketStructure(matchups: KnockoutMatchup[]) {
  const byRound = getMatchupsByRound(matchups);
  const thirdMatchup = byRound.get(ROUND_3RD)?.[0] ?? null;

  // Normal rounds are all rounds except the special 3RD round (round 4)
  const normalRounds = [...byRound.keys()]
    .filter((r) => r !== ROUND_3RD)
    .sort((a, b) => a - b);

  if (normalRounds.length === 0) return { leftRounds: [], rightRounds: [], finalMatchup: null, thirdMatchup };

  // The last normal round is the Final
  const finalRound = normalRounds[normalRounds.length - 1];
  const finalMatchup = byRound.get(finalRound)?.[0] ?? null;

  // Rounds before the final get split into left/right halves
  const bracketRounds = normalRounds.slice(0, -1);

  // For each round, split matchups into left half (first half) and right half (second half)
  const leftRounds: { round: number; ids: string[] }[] = [];
  const rightRounds: { round: number; ids: string[] }[] = [];

  for (const round of bracketRounds) {
    const roundMatchups = byRound.get(round) ?? [];
    const half = Math.ceil(roundMatchups.length / 2);
    leftRounds.push({ round, ids: roundMatchups.slice(0, half).map((m) => m.id) });
    rightRounds.push({ round, ids: roundMatchups.slice(half).map((m) => m.id) });
  }

  return { leftRounds, rightRounds, finalMatchup, thirdMatchup };
}

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
  const { leftRounds, rightRounds, finalMatchup, thirdMatchup } = useMemo(
    () => deriveBracketStructure(matchups),
    [matchups],
  );

  const handlePick = useCallback(
    (matchupId: string, team: string) => {
      if (!onPick) return;
      onPick(matchupId, team);
    },
    [onPick],
  );

  return (
    <Box sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', pb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'stretch', minWidth: 'fit-content', minHeight: 500 }}>
        {/* Left half: earliest round → SF */}
        {leftRounds.map(({ round, ids }, i) => (
          <Box key={`left-${round}`} sx={{ display: 'contents' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              <RoundLabel label={ROUND_LABELS[round] ?? `Round ${round}`} />
              <RoundColumn
                matchups={matchups}
                ids={ids}
                picks={picks}
                onPick={handlePick}
                readOnly={readOnly}
                results={results}
                countryCodeMap={countryCodeMap}
              />
            </Box>
            {i < leftRounds.length - 1 && (
              <ConnectorColumn pairCount={Math.floor(ids.length / 2)} direction="left" />
            )}
          </Box>
        ))}

        {/* Center: Final + 3rd */}
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minWidth: 200, mx: 1, gap: 3 }}>
          {finalMatchup && (
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'warning.main', mb: 0.5 }}>
                🏆 Final
              </Typography>
              <Box sx={{ border: 2, borderColor: 'warning.main', borderRadius: 1, p: 0.5 }}>
                <Matchup matchup={finalMatchup} userPick={picks[finalMatchup.id]} onPick={handlePick} readOnly={readOnly} result={results?.[finalMatchup.id]} countryCodeMap={countryCodeMap} isChampionPick />
              </Box>
            </Box>
          )}
          {thirdMatchup && (
            <Box sx={{ textAlign: 'center', opacity: 0.85 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                🥉 3rd Place
              </Typography>
              <Matchup matchup={thirdMatchup} userPick={picks[thirdMatchup.id]} onPick={handlePick} readOnly={readOnly} result={results?.[thirdMatchup.id]} countryCodeMap={countryCodeMap} />
            </Box>
          )}
        </Box>

        {/* Right half: SF → earliest round (reversed) */}
        {[...rightRounds].reverse().map(({ round, ids }, i) => (
          <Box key={`right-${round}`} sx={{ display: 'contents' }}>
            {i > 0 && (
              <ConnectorColumn pairCount={Math.floor(ids.length / 2)} direction="right" />
            )}
            <Box sx={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              <RoundLabel label={ROUND_LABELS[round] ?? `Round ${round}`} />
              <RoundColumn
                matchups={matchups}
                ids={ids}
                picks={picks}
                onPick={handlePick}
                readOnly={readOnly}
                results={results}
                countryCodeMap={countryCodeMap}
              />
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
