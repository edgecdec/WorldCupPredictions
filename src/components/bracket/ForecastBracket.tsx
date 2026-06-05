'use client';
import { useMemo, useState } from 'react';
import { Box, Typography, Popover, Button, Tabs, Tab, useMediaQuery, useTheme } from '@mui/material';
import type { BracketSlotResult } from '@/hooks/useTournamentSim';
import TeamFlag from '@/components/common/TeamFlag';
import { getFeederMatchupIds } from '@/lib/knockoutBracket';

/**
 * Walk the FIFA feeder tree from a top-level matchup down to R32, returning
 * the visual ordering for each round (top-to-bottom). Ensures every R32 pair
 * sits adjacent to the R16 match it actually feeds.
 */
function walkFeederIds(rootId: string, depth: number): string[][] {
  // Returns [[rootId], [feeders of root], [feeders of feeders], ...]
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

interface ForecastBracketProps {
  bracketSlots: BracketSlotResult[];
  numSims: number;
  countryCodeMap: Record<string, string>;
}

const CONNECTOR_COLOR = 'divider';
const COLLAPSED_LIMIT = 8;

function SlotPopoverContent({ slot, numSims, countryCodeMap }: { slot: BracketSlotResult; numSims: number; countryCodeMap: Record<string, string> }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? slot.teams : slot.teams.slice(0, COLLAPSED_LIMIT);
  const hasMore = slot.teams.length > COLLAPSED_LIMIT;
  return (
    <Box sx={{ p: 1, minWidth: 200, maxHeight: 400, overflowY: 'auto' }}>
      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5, textTransform: 'uppercase', fontSize: '0.6rem' }}>
        {slot.teams.length} possible team{slot.teams.length !== 1 ? 's' : ''}
      </Typography>
      {visible.map((t) => (
        <Box key={t.team} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.25 }}>
          <TeamFlag countryCode={countryCodeMap[t.team] ?? ''} size={14} />
          <Typography variant="caption" sx={{ flex: 1, fontSize: '0.7rem' }}>{t.team}</Typography>
          <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.7rem' }}>
            {Math.round((t.count / numSims) * 100)}%
          </Typography>
        </Box>
      ))}
      {hasMore && (
        <Button size="small" onClick={() => setExpanded(!expanded)} sx={{ mt: 0.5, fontSize: '0.65rem', minHeight: 0, py: 0.25 }}>
          {expanded ? 'Show less' : `See all ${slot.teams.length} teams`}
        </Button>
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
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

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
    <>
      <Box
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{
          px: 0.5, py: 0.2, minWidth: 120, minHeight: 20, cursor: 'pointer',
          borderTop: position === 'top' ? 1 : 0, borderBottom: 1, borderLeft: 1, borderRight: 1,
          borderColor: 'divider',
          display: 'flex', alignItems: 'center', gap: 0.4,
          '&:hover': { bgcolor: 'action.hover', borderColor: 'primary.main' },
        }}
      >
        <TeamFlag countryCode={countryCodeMap[top.team] ?? ''} size={12} />
        <Typography variant="caption" noWrap sx={{ flex: 1, fontSize: '0.65rem', fontWeight: 500, lineHeight: 1.2 }}>
          {top.team}
        </Typography>
        <Typography variant="caption" sx={{ fontSize: '0.55rem', color: 'text.secondary', fontWeight: 700 }}>
          {pct}%
        </Typography>
      </Box>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <SlotPopoverContent slot={slot} numSims={numSims} countryCodeMap={countryCodeMap} />
      </Popover>
    </>
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

function RoundColumn({ matchIds, slotMap, numSims, countryCodeMap, isFirstRound }: {
  matchIds: string[];
  slotMap: Map<string, BracketSlotResult>;
  numSims: number;
  countryCodeMap: Record<string, string>;
  isFirstRound?: boolean;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', minWidth: 130, flexShrink: 0, flex: 1 }}>
      {matchIds.map((id) => (
        <Box key={id} sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', py: isFirstRound ? 0.25 : 0, flex: 1 }}>
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

const ALL_ROUNDS = [
  { key: 'R32', label: 'Round of 32', count: 16 },
  { key: 'R16', label: 'Round of 16', count: 8 },
  { key: 'QF', label: 'Quarterfinals', count: 4 },
  { key: 'SF', label: 'Semifinals', count: 2 },
  { key: 'FINAL', label: '🏆 Final', count: 1 },
  { key: '3RD', label: '🥉 3rd Place', count: 1 },
];

function ChampionBanner({ slotMap, numSims, countryCodeMap }: {
  slotMap: Map<string, BracketSlotResult>;
  numSims: number;
  countryCodeMap: Record<string, string>;
}) {
  const [topAnchor, setTopAnchor] = useState<HTMLElement | null>(null);
  const [contenderAnchor, setContenderAnchor] = useState<{ el: HTMLElement; team: string } | null>(null);

  const championSlot = slotMap.get('FINAL-W');
  if (!championSlot || championSlot.teams.length === 0) return null;
  const top = championSlot.teams[0];
  const top3 = championSlot.teams.slice(0, 3);
  const pct = Math.round((top.count / numSims) * 100);

  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 2, py: 1.5, px: 2, mb: 2, flexWrap: 'wrap',
      border: 2, borderColor: 'warning.main', borderRadius: 1,
      bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,193,7,0.08)' : 'rgba(255,193,7,0.12)',
    }}>
      <Box sx={{ textAlign: 'center' }}>
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'warning.main', fontSize: '0.7rem', display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          🏆 Most Likely Champion
        </Typography>
        <Box
          onClick={(e) => setTopAnchor(e.currentTarget)}
          sx={{
            display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, justifyContent: 'center',
            cursor: 'pointer', borderRadius: 1, px: 1, py: 0.25,
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <TeamFlag countryCode={countryCodeMap[top.team] ?? ''} size={28} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{top.team}</Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, color: 'warning.main' }}>{pct}%</Typography>
        </Box>
      </Box>
      <Box sx={{ borderLeft: 1, borderColor: 'divider', pl: 2, display: { xs: 'none', sm: 'block' } }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.65rem', display: 'block', mb: 0.25 }}>
          Other contenders
        </Typography>
        {top3.slice(1).map((t) => (
          <Box
            key={t.team}
            onClick={(e) => setContenderAnchor({ el: e.currentTarget, team: t.team })}
            sx={{
              display: 'flex', alignItems: 'center', gap: 0.5, py: 0.1, px: 0.5,
              cursor: 'pointer', borderRadius: 0.5,
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <TeamFlag countryCode={countryCodeMap[t.team] ?? ''} size={14} />
            <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>{t.team}</Typography>
            <Typography variant="caption" sx={{ fontSize: '0.7rem', fontWeight: 700, ml: 0.5 }}>
              {Math.round((t.count / numSims) * 100)}%
            </Typography>
          </Box>
        ))}
      </Box>

      <Popover
        open={Boolean(topAnchor)}
        anchorEl={topAnchor}
        onClose={() => setTopAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <SlotPopoverContent slot={championSlot} numSims={numSims} countryCodeMap={countryCodeMap} />
      </Popover>
      <Popover
        open={Boolean(contenderAnchor)}
        anchorEl={contenderAnchor?.el ?? null}
        onClose={() => setContenderAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <SlotPopoverContent slot={championSlot} numSims={numSims} countryCodeMap={countryCodeMap} />
      </Popover>
    </Box>
  );
}

function MobileForecastBracket({ slotMap, numSims, countryCodeMap }: { slotMap: Map<string, BracketSlotResult>; numSims: number; countryCodeMap: Record<string, string> }) {
  const [tab, setTab] = useState(0);
  const round = ALL_ROUNDS[tab];
  const matchIds = round.count === 1 ? [round.key] : Array.from({ length: round.count }, (_, i) => `${round.key}-${i + 1}`);

  return (
    <Box>
      <ChampionBanner slotMap={slotMap} numSims={numSims} countryCodeMap={countryCodeMap} />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
        {ALL_ROUNDS.map((r) => <Tab key={r.key} label={r.label} sx={{ fontSize: '0.7rem', minWidth: 60, px: 1 }} />)}
      </Tabs>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {matchIds.map((id) => (
          <Box key={id} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
            <MatchupCell matchId={id} slotMap={slotMap} numSims={numSims} countryCodeMap={countryCodeMap} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export default function ForecastBracket({ bracketSlots, numSims, countryCodeMap }: ForecastBracketProps) {
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down('lg'));

  const slotMap = useMemo(() => {
    const map = new Map<string, BracketSlotResult>();
    for (const s of bracketSlots) map.set(s.slotId, s);
    return map;
  }, [bracketSlots]);

  if (isSmall) {
    return <MobileForecastBracket slotMap={slotMap} numSims={numSims} countryCodeMap={countryCodeMap} />;
  }

  // Walk the FIFA feeder tree from each SF down through R32 so each R32 pair
  // visually sits next to the R16 it feeds (FIFA's feeders are non-sequential).
  // walkFeederIds returns [[SF],[QFs],[R16s],[R32s]] — top-to-bottom per round.
  const leftLayers = walkFeederIds('SF-1', 3);
  const rightLayers = walkFeederIds('SF-2', 3);

  const leftSF = leftLayers[0];
  const leftQF = leftLayers[1];
  const leftR16 = leftLayers[2];
  const leftR32 = leftLayers[3];

  const rightSF = rightLayers[0];
  const rightQF = rightLayers[1];
  const rightR16 = rightLayers[2];
  const rightR32 = rightLayers[3];

  const roundLabels = ['R32', 'R16', 'QF', 'SF'];
  const roundDisplayNames: Record<string, string> = { R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarterfinals', SF: 'Semifinals' };

  const leftRounds = [leftR32, leftR16, leftQF, leftSF];
  const rightRounds = [rightSF, rightQF, rightR16, rightR32];

  return (
    <Box>
      <ChampionBanner slotMap={slotMap} numSims={numSims} countryCodeMap={countryCodeMap} />
      <Box sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', pb: 2 }}>
      {/* Round labels row */}
      <Box sx={{ display: 'flex', alignItems: 'flex-end', minWidth: 'fit-content', mb: 0.5 }}>
        {leftRounds.map((ids, i) => (
          <Box key={`lbl-left-${i}`} sx={{ display: 'contents' }}>
            <Box sx={{ minWidth: 130, flexShrink: 0, textAlign: 'center' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.6rem' }}>
                {roundDisplayNames[roundLabels[i]]}
              </Typography>
            </Box>
            {i < 3 && <Box sx={{ width: 12, flexShrink: 0 }} />}
          </Box>
        ))}
        <Box sx={{ minWidth: 160, mx: 1, textAlign: 'center' }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'warning.main', fontSize: '0.7rem' }}>
            🏆 Final
          </Typography>
        </Box>
        {rightRounds.map((ids, i) => (
          <Box key={`lbl-right-${i}`} sx={{ display: 'contents' }}>
            {i > 0 && <Box sx={{ width: 12, flexShrink: 0 }} />}
            <Box sx={{ minWidth: 130, flexShrink: 0, textAlign: 'center' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.6rem' }}>
                {roundDisplayNames[roundLabels[3 - i]]}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>

      {/* Bracket */}
      <Box sx={{ display: 'flex', alignItems: 'stretch', minWidth: 'fit-content', height: 720 }}>
        {/* Left half */}
        {leftRounds.map((ids, i) => (
          <Box key={`left-${i}`} sx={{ display: 'contents' }}>
            <RoundColumn matchIds={ids} slotMap={slotMap} numSims={numSims} countryCodeMap={countryCodeMap} isFirstRound={i === 0} />
            {i < 3 && <ConnectorColumn pairCount={ids.length} direction="left" />}
          </Box>
        ))}

        {/* Center: Final + 3rd */}
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minWidth: 160, mx: 1, gap: 3 }}>
          <Box sx={{ border: 2, borderColor: 'warning.main', borderRadius: 1, p: 0.25 }}>
            <MatchupCell matchId="FINAL" slotMap={slotMap} numSims={numSims} countryCodeMap={countryCodeMap} />
          </Box>
          <Box sx={{ opacity: 0.8 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', fontSize: '0.6rem', textAlign: 'center', mb: 0.25 }}>
              🥉 3rd Place
            </Typography>
            <MatchupCell matchId="3RD" slotMap={slotMap} numSims={numSims} countryCodeMap={countryCodeMap} />
          </Box>
        </Box>

        {/* Right half (reversed order) */}
        {rightRounds.map((ids, i) => (
          <Box key={`right-${i}`} sx={{ display: 'contents' }}>
            {i > 0 && <ConnectorColumn pairCount={ids.length} direction="right" />}
            <RoundColumn matchIds={ids} slotMap={slotMap} numSims={numSims} countryCodeMap={countryCodeMap} isFirstRound={i === 3} />
          </Box>
        ))}
      </Box>
      </Box>
    </Box>
  );
}
