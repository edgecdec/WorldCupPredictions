'use client';
import { useState } from 'react';
import { Box, Tabs, Tab, Typography } from '@mui/material';
import Matchup from './Matchup';
import { KnockoutMatchup } from '@/types';
import { getMatchupsByRound, ROUND_R32, ROUND_R16, ROUND_QF, ROUND_SF, ROUND_3RD, ROUND_FINAL, ROUND_LABELS } from '@/lib/bracketUtils';

interface MobileBracketProps {
  matchups: KnockoutMatchup[];
  picks: Record<string, string>;
  onPick?: (matchupId: string, team: string) => void;
  readOnly?: boolean;
  results?: Record<string, string>;
  countryCodeMap?: Record<string, string>;
}

const ROUND_ORDER = [ROUND_R32, ROUND_R16, ROUND_QF, ROUND_SF, ROUND_3RD, ROUND_FINAL];

export default function MobileBracket({ matchups, picks, onPick, readOnly, results, countryCodeMap }: MobileBracketProps) {
  const [tab, setTab] = useState(0);
  const byRound = getMatchupsByRound(matchups);
  const currentRound = ROUND_ORDER[tab];
  const roundMatchups = byRound.get(currentRound) ?? [];

  return (
    <Box>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {ROUND_ORDER.map((r) => (
          <Tab key={r} label={ROUND_LABELS[r]} />
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
              <Matchup matchup={m} userPick={picks[m.id]} onPick={onPick} readOnly={readOnly} result={results?.[m.id]} countryCodeMap={countryCodeMap} isChampionPick={currentRound === ROUND_FINAL && m.id.startsWith('FINAL')} />
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}
