'use client';
import { useState, useMemo } from 'react';
import { Box, Tabs, Tab, Typography } from '@mui/material';
import Matchup from './Matchup';
import { KnockoutMatchup } from '@/types';
import { getMatchupsByRound, ROUND_LABELS, ROUND_3RD } from '@/lib/bracketUtils';

interface MobileBracketProps {
  matchups: KnockoutMatchup[];
  picks: Record<string, string>;
  onPick?: (matchupId: string, team: string) => void;
  readOnly?: boolean;
  results?: Record<string, string>;
  countryCodeMap?: Record<string, string>;
}

/** Derive ordered round list from matchups. Normal rounds sorted ascending, then 3RD and Final at end. */
function deriveRoundOrder(matchups: KnockoutMatchup[]): number[] {
  const rounds = new Set(matchups.map((m) => m.round));
  const normal = [...rounds].filter((r) => r !== ROUND_3RD).sort((a, b) => a - b);
  // Insert 3RD before the final round if it exists
  if (rounds.has(ROUND_3RD) && normal.length > 0) {
    const finalRound = normal[normal.length - 1];
    const idx = normal.indexOf(finalRound);
    normal.splice(idx, 0, ROUND_3RD);
  }
  return normal;
}

export default function MobileBracket({ matchups, picks, onPick, readOnly, results, countryCodeMap }: MobileBracketProps) {
  const [tab, setTab] = useState(0);
  const byRound = getMatchupsByRound(matchups);
  const roundOrder = useMemo(() => deriveRoundOrder(matchups), [matchups]);
  const currentRound = roundOrder[tab] ?? 0;
  const roundMatchups = byRound.get(currentRound) ?? [];
  const finalRound = roundOrder.length > 0 ? roundOrder[roundOrder.length - 1] : -1;

  return (
    <Box>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {roundOrder.map((r) => (
          <Tab key={r} label={ROUND_LABELS[r] ?? `Round ${r}`} />
        ))}
      </Tabs>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {roundMatchups.length === 0 ? (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
            No matchups in this round yet.
          </Typography>
        ) : (
          roundMatchups.map((m) => (
            <Box key={m.id}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, mb: 0.25, display: 'block' }}>
                {m.id}
              </Typography>
              <Matchup matchup={m} userPick={picks[m.id]} onPick={onPick} readOnly={readOnly} result={results?.[m.id]} countryCodeMap={countryCodeMap} isChampionPick={currentRound === finalRound && m.id !== '3RD'} />
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}
