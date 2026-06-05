'use client';
import { useCallback, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import Matchup from './Matchup';
import { KnockoutMatchup } from '@/types';
import { getMatchupsByRound, ROUND_R32, ROUND_R16, ROUND_QF, ROUND_SF, ROUND_3RD, ROUND_LABELS } from '@/lib/bracketUtils';
import { getFeederMatchupIds } from '@/lib/knockoutBracket';

interface KnockoutBracketProps {
  matchups: KnockoutMatchup[];
  picks: Record<string, string>;
  onPick?: (matchupId: string, team: string) => void;
  readOnly?: boolean;
  results?: Record<string, string>;
  countryCodeMap?: Record<string, string>;
  probabilityMap?: Record<string, Record<string, number>>;
}

const CONNECTOR_COLOR = 'divider';

/**
 * Walk the FIFA feeder tree from a top-level matchup down to the earliest round,
 * returning the visual ordering for each round (top-to-bottom).
 *
 * For example, walkFeeders('SF-1') returns:
 *   { 3: ['SF-1'], 2: ['QF-1','QF-2'], 1: ['R16-1','R16-2','R16-5','R16-6'],
 *     0: ['R32-2','R32-5','R32-1','R32-3','R32-11','R32-12','R32-9','R32-10'] }
 * where each pair-of-pairs feeds its parent. This ensures the connectors line up.
 */
function walkFeeders(rootId: string, rootRound: number): Map<number, string[]> {
  const result = new Map<number, string[]>();
  result.set(rootRound, [rootId]);

  let currentIds = [rootId];
  let currentRound = rootRound;
  while (currentRound > ROUND_R32) {
    const nextIds: string[] = [];
    for (const id of currentIds) {
      const feeders = getFeederMatchupIds(id);
      if (feeders) {
        nextIds.push(feeders[0], feeders[1]);
      }
    }
    currentRound -= 1;
    result.set(currentRound, nextIds);
    currentIds = nextIds;
  }
  return result;
}

/** Derive the bracket structure from matchups: normal rounds, final, 3rd place. */
function deriveBracketStructure(matchups: KnockoutMatchup[]) {
  const byRound = getMatchupsByRound(matchups);
  const thirdMatchup = byRound.get(ROUND_3RD)?.[0] ?? null;

  // Final = the matchup whose ID is 'FINAL'
  const finalMatchup = matchups.find((m) => m.id === 'FINAL') ?? null;

  // SF determines the two halves: SF-1 → left, SF-2 → right.
  const sfMatchups = byRound.get(ROUND_SF) ?? [];
  const sf1 = sfMatchups.find((m) => m.id === 'SF-1');
  const sf2 = sfMatchups.find((m) => m.id === 'SF-2');

  if (!sf1 || !sf2) {
    return { leftRounds: [], rightRounds: [], finalMatchup, thirdMatchup };
  }

  const leftTree = walkFeeders('SF-1', ROUND_SF);
  const rightTree = walkFeeders('SF-2', ROUND_SF);

  // Order rounds shallowest (R32) → deepest (SF) for left,
  // shallowest → deepest (will be reversed in render) for right.
  const orderedRounds = [ROUND_R32, ROUND_R16, ROUND_QF, ROUND_SF];

  const leftRounds: { round: number; ids: string[] }[] = [];
  const rightRounds: { round: number; ids: string[] }[] = [];
  for (const round of orderedRounds) {
    leftRounds.push({ round, ids: leftTree.get(round) ?? [] });
    rightRounds.push({ round, ids: rightTree.get(round) ?? [] });
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
