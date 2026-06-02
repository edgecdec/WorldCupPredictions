'use client';
import { useMemo } from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import type { BracketSlotResult } from '@/hooks/useTournamentSim';
import TeamFlag from '@/components/common/TeamFlag';

interface ForecastBracketProps {
  bracketSlots: BracketSlotResult[];
  numSims: number;
  countryCodeMap: Record<string, string>;
}

const CONNECTOR_COLOR = 'divider';

function SlotTooltipContent({ slot, numSims, countryCodeMap }: { slot: BracketSlotResult; numSims: number; countryCodeMap: Record<string, string> }) {
  const top = slot.teams.slice(0, 10);
  return (
    <Box sx={{ p: 0.5, minWidth: 150 }}>
      {top.map((t) => (
        <Box key={t.team} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.2 }}>
          <TeamFlag countryCode={countryCodeMap[t.team] ?? ''} size={12} />
          <Typography variant="caption" sx={{ flex: 1, fontSize: '0.65rem' }}>{t.team}</Typography>
          <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.65rem' }}>
            {Math.round((t.count / numSims) * 100)}%
          </Typography>
        </Box>
      ))}
      {slot.teams.length > 10 && (
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
          +{slot.teams.length - 10} more
        </Typography>
      )}
    </Box>
  );
}

function TeamCell({ slot, numSims, countryCodeMap, position }: {
  slot: BracketSlotResult | undefined;
  numSims: number;
  countryCodeMap: Record<string, string>;
  position: 'top' | 'bottom';
}) {
  if (!slot || slot.teams.length === 0) {
    return (
      <Box sx={{ px: 0.5, py: 0.2, minWidth: 120, minHeight: 20, borderTop: position === 'top' ? 1 : 0, borderBottom: 1, borderLeft: 1, borderRight: 1, borderColor: 'divider', display: 'flex', alignItems: 'center' }}>
        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem' }}>TBD</Typography>
      </Box>
    );
  }

  const top = slot.teams[0];
  const pct = Math.round((top.count / numSims) * 100);

  return (
    <Tooltip title={<SlotTooltipContent slot={slot} numSims={numSims} countryCodeMap={countryCodeMap} />} arrow>
      <Box sx={{
        px: 0.5, py: 0.2, minWidth: 120, minHeight: 20, cursor: 'pointer',
        borderTop: position === 'top' ? 1 : 0, borderBottom: 1, borderLeft: 1, borderRight: 1,
        borderColor: 'divider',
        display: 'flex', alignItems: 'center', gap: 0.4,
        '&:hover': { bgcolor: 'action.hover', borderColor: 'primary.main' },
      }}>
        <TeamFlag countryCode={countryCodeMap[top.team] ?? ''} size={12} />
        <Typography variant="caption" noWrap sx={{ flex: 1, fontSize: '0.65rem', fontWeight: 500, lineHeight: 1.2 }}>
          {top.team}
        </Typography>
        <Typography variant="caption" sx={{ fontSize: '0.55rem', color: 'text.secondary', fontWeight: 700 }}>
          {pct}%
        </Typography>
      </Box>
    </Tooltip>
  );
}

function MatchupCell({ matchId, slotMap, numSims, countryCodeMap }: {
  matchId: string;
  slotMap: Map<string, BracketSlotResult>;
  numSims: number;
  countryCodeMap: Record<string, string>;
}) {
  return (
    <Box sx={{ my: 0.125 }}>
      <TeamCell slot={slotMap.get(`${matchId}-A`)} numSims={numSims} countryCodeMap={countryCodeMap} position="top" />
      <TeamCell slot={slotMap.get(`${matchId}-B`)} numSims={numSims} countryCodeMap={countryCodeMap} position="bottom" />
    </Box>
  );
}

function RoundColumn({ matchIds, slotMap, numSims, countryCodeMap }: {
  matchIds: string[];
  slotMap: Map<string, BracketSlotResult>;
  numSims: number;
  countryCodeMap: Record<string, string>;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', minWidth: 130, flexShrink: 0 }}>
      {matchIds.map((id) => (
        <Box key={id} sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <MatchupCell matchId={id} slotMap={slotMap} numSims={numSims} countryCodeMap={countryCodeMap} />
        </Box>
      ))}
    </Box>
  );
}

function ConnectorColumn({ pairCount, direction }: { pairCount: number; direction: 'left' | 'right' }) {
  const isLeft = direction === 'left';
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', width: 12, flexShrink: 0 }}>
      {Array.from({ length: pairCount }, (_, i) => (
        <Box key={i} sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative' }}>
          <Box sx={{ flex: 1, ...(isLeft ? { borderRight: 2, borderBottom: 2, borderColor: CONNECTOR_COLOR } : { borderLeft: 2, borderBottom: 2, borderColor: CONNECTOR_COLOR }) }} />
          <Box sx={{ flex: 1, ...(isLeft ? { borderRight: 2, borderTop: 2, borderColor: CONNECTOR_COLOR } : { borderLeft: 2, borderTop: 2, borderColor: CONNECTOR_COLOR }) }} />
        </Box>
      ))}
    </Box>
  );
}

export default function ForecastBracket({ bracketSlots, numSims, countryCodeMap }: ForecastBracketProps) {
  const slotMap = useMemo(() => {
    const map = new Map<string, BracketSlotResult>();
    for (const s of bracketSlots) map.set(s.slotId, s);
    return map;
  }, [bracketSlots]);

  // Left half: R32 matches 1-8, R16 1-4, QF 1-2, SF 1
  // Right half: R32 matches 9-16, R16 5-8, QF 3-4, SF 2
  const leftR32 = Array.from({ length: 8 }, (_, i) => `R32-${i + 1}`);
  const leftR16 = Array.from({ length: 4 }, (_, i) => `R16-${i + 1}`);
  const leftQF = Array.from({ length: 2 }, (_, i) => `QF-${i + 1}`);
  const leftSF = ['SF-1'];

  const rightR32 = Array.from({ length: 8 }, (_, i) => `R32-${i + 9}`);
  const rightR16 = Array.from({ length: 4 }, (_, i) => `R16-${i + 5}`);
  const rightQF = Array.from({ length: 2 }, (_, i) => `QF-${i + 3}`);
  const rightSF = ['SF-2'];

  const roundLabels = ['R32', 'R16', 'QF', 'SF'];
  const roundDisplayNames: Record<string, string> = { R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarterfinals', SF: 'Semifinals' };

  return (
    <Box sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', pb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'stretch', minWidth: 'fit-content', minHeight: 600 }}>
        {/* Left half */}
        {[leftR32, leftR16, leftQF, leftSF].map((ids, i) => (
          <Box key={`left-${i}`} sx={{ display: 'contents' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              <Typography variant="caption" sx={{ textAlign: 'center', fontWeight: 700, color: 'text.secondary', mb: 0.5, fontSize: '0.6rem' }}>
                {roundDisplayNames[roundLabels[i]]}
              </Typography>
              <RoundColumn matchIds={ids} slotMap={slotMap} numSims={numSims} countryCodeMap={countryCodeMap} />
            </Box>
            {i < 3 && <ConnectorColumn pairCount={ids.length} direction="left" />}
          </Box>
        ))}

        {/* Center: Final + 3rd */}
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minWidth: 160, mx: 1, gap: 3 }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'warning.main', mb: 0.5, display: 'block', fontSize: '0.7rem' }}>
              🏆 Final
            </Typography>
            <Box sx={{ border: 2, borderColor: 'warning.main', borderRadius: 1, p: 0.25 }}>
              <MatchupCell matchId="FINAL" slotMap={slotMap} numSims={numSims} countryCodeMap={countryCodeMap} />
            </Box>
          </Box>
          <Box sx={{ textAlign: 'center', opacity: 0.8 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', fontSize: '0.6rem' }}>
              🥉 3rd Place
            </Typography>
            <MatchupCell matchId="3RD" slotMap={slotMap} numSims={numSims} countryCodeMap={countryCodeMap} />
          </Box>
        </Box>

        {/* Right half (reversed order) */}
        {[rightSF, rightQF, rightR16, rightR32].map((ids, i) => (
          <Box key={`right-${i}`} sx={{ display: 'contents' }}>
            {i > 0 && <ConnectorColumn pairCount={ids.length} direction="right" />}
            <Box sx={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              <Typography variant="caption" sx={{ textAlign: 'center', fontWeight: 700, color: 'text.secondary', mb: 0.5, fontSize: '0.6rem' }}>
                {roundDisplayNames[roundLabels[3 - i]]}
              </Typography>
              <RoundColumn matchIds={ids} slotMap={slotMap} numSims={numSims} countryCodeMap={countryCodeMap} />
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
