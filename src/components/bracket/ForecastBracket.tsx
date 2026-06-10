'use client';
import { useMemo, useState } from 'react';
import { Box, Typography, Popover, Button, Tabs, Tab, useMediaQuery } from '@mui/material';
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

const MOBILE_TAB_LABELS = ['R32 → R16', 'R16 → QF', 'QF → SF', 'SF → Final'] as const;

/**
 * Walk the FIFA feeder tree from each SF down to a given depth, returning the
 * matches at that depth in [SF-1 subtree, SF-2 subtree] order. Same ordering
 * as the desktop split, so mobile reads top-to-bottom matching desktop.
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

const MOBILE_TAB_RIGHTS: string[][] = [
  walkFromSf(2), // R16 in FIFA-walk order: [R16-1, R16-2, R16-5, R16-6, R16-3, R16-4, R16-7, R16-8]
  walkFromSf(1), // QF: [QF-1, QF-2, QF-3, QF-4]
  walkFromSf(0), // SF: [SF-1, SF-2]
  ['FINAL', '3RD'],
];

function MobileMatchupPair({
  rightId, leftIds, slotMap, numSims, countryCodeMap,
}: {
  rightId: string;
  leftIds: [string, string];
  slotMap: Map<string, BracketSlotResult>;
  numSims: number;
  countryCodeMap: Record<string, string>;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'stretch', mb: 1.5 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, minWidth: 0, gap: 0.5 }}>
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
          <MatchupCell matchId={leftIds[0]} slotMap={slotMap} numSims={numSims} countryCodeMap={countryCodeMap} />
        </Box>
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
          <MatchupCell matchId={leftIds[1]} slotMap={slotMap} numSims={numSims} countryCodeMap={countryCodeMap} />
        </Box>
      </Box>

      <Box sx={{ width: 12, flexShrink: 0, position: 'relative' }}>
        <Box sx={{
          position: 'absolute', top: '25%', bottom: '25%', left: 0, right: 0,
          borderTop: 1, borderBottom: 1, borderRight: 1, borderColor: 'divider',
        }} />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
        <Box sx={{ width: '100%', border: 1, borderColor: rightId === 'FINAL' ? 'warning.main' : 'divider', borderRadius: 1, overflow: 'hidden' }}>
          <MatchupCell matchId={rightId} slotMap={slotMap} numSims={numSims} countryCodeMap={countryCodeMap} />
        </Box>
      </Box>
    </Box>
  );
}

function MobileForecastBracket({ slotMap, numSims, countryCodeMap }: { slotMap: Map<string, BracketSlotResult>; numSims: number; countryCodeMap: Record<string, string> }) {
  const [tab, setTab] = useState(0);
  const cfg = MOBILE_TAB_RIGHTS[tab];
  const labelLeft = ['Round of 32', 'Round of 16', 'Quarterfinals', 'Semifinals'][tab];
  const labelRight = ['Round of 16', 'Quarterfinals', 'Semifinals', 'Final / 3rd'][tab];

  return (
    <Box>
      <ChampionBanner slotMap={slotMap} numSims={numSims} countryCodeMap={countryCodeMap} />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ mb: 2 }}>
        {MOBILE_TAB_LABELS.map((label) => (
          <Tab key={label} label={label} sx={{ fontSize: '0.7rem', minHeight: 40, px: 0.5 }} />
        ))}
      </Tabs>

      <Box sx={{ display: 'flex', gap: 0, mb: 1 }}>
        <Typography variant="caption" sx={{ flex: 1, fontWeight: 700, textAlign: 'center', color: 'text.secondary', fontSize: '0.65rem' }}>
          {labelLeft}
        </Typography>
        <Box sx={{ width: 12 }} />
        <Typography variant="caption" sx={{ flex: 1, fontWeight: 700, textAlign: 'center', color: 'text.secondary', fontSize: '0.65rem' }}>
          {labelRight}
        </Typography>
      </Box>

      <Box>
        {cfg.map((rid) => {
          const feeders = getFeederMatchupIds(rid);
          if (!feeders) return null;
          return (
            <MobileMatchupPair
              key={rid}
              rightId={rid}
              leftIds={feeders}
              slotMap={slotMap}
              numSims={numSims}
              countryCodeMap={countryCodeMap}
            />
          );
        })}
      </Box>

      <Box sx={{ display: 'flex', justifyContent: tab === 0 ? 'flex-end' : tab === MOBILE_TAB_LABELS.length - 1 ? 'flex-start' : 'space-between', mt: 2, mb: 1 }}>
        {tab > 0 && (
          <Button variant="outlined" size="small" onClick={() => setTab(tab - 1)}>
            ← {MOBILE_TAB_LABELS[tab - 1]}
          </Button>
        )}
        {tab < MOBILE_TAB_LABELS.length - 1 && (
          <Button variant="outlined" size="small" onClick={() => setTab(tab + 1)}>
            {MOBILE_TAB_LABELS[tab + 1]} →
          </Button>
        )}
      </Box>
    </Box>
  );
}

/** Medium-screen forecast: full bracket left-to-right, R32 → Final → 3rd. */
function MediumForecastBracket({ slotMap, numSims, countryCodeMap }: { slotMap: Map<string, BracketSlotResult>; numSims: number; countryCodeMap: Record<string, string> }) {
  // Same FIFA-correct ordering as the large layout, but flattened L→R.
  const left = walkFeederIds('SF-1', 3);
  const right = walkFeederIds('SF-2', 3);
  const r32 = [...left[3], ...right[3]];
  const r16 = [...left[2], ...right[2]];
  const qf = [...left[1], ...right[1]];
  const sf = [...left[0], ...right[0]];

  return (
    <Box>
      <ChampionBanner slotMap={slotMap} numSims={numSims} countryCodeMap={countryCodeMap} />
      <Box sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', pb: 2 }}>
        {/* Round labels row */}
        <Box sx={{ display: 'flex', alignItems: 'flex-end', minWidth: 'fit-content', mb: 0.5 }}>
          {[
            { label: 'Round of 32' }, { label: 'Round of 16' }, { label: 'Quarterfinals' }, { label: 'Semifinals' },
            { label: '🏆 Final', warning: true }, { label: '🥉 3rd Place' },
          ].map((l, i, arr) => (
            <Box key={i} sx={{ display: 'contents' }}>
              <Box sx={{ minWidth: 130, flexShrink: 0, textAlign: 'center' }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: l.warning ? 'warning.main' : 'text.secondary', fontSize: '0.6rem' }}>
                  {l.label}
                </Typography>
              </Box>
              {i < arr.length - 1 && <Box sx={{ width: 12, flexShrink: 0 }} />}
            </Box>
          ))}
        </Box>

        {/* Bracket flow */}
        <Box sx={{ display: 'flex', alignItems: 'stretch', minWidth: 'fit-content', height: 600 }}>
          <RoundColumn matchIds={r32} slotMap={slotMap} numSims={numSims} countryCodeMap={countryCodeMap} isFirstRound />
          <ConnectorColumn pairCount={r16.length} direction="left" />
          <RoundColumn matchIds={r16} slotMap={slotMap} numSims={numSims} countryCodeMap={countryCodeMap} />
          <ConnectorColumn pairCount={qf.length} direction="left" />
          <RoundColumn matchIds={qf} slotMap={slotMap} numSims={numSims} countryCodeMap={countryCodeMap} />
          <ConnectorColumn pairCount={sf.length} direction="left" />
          <RoundColumn matchIds={sf} slotMap={slotMap} numSims={numSims} countryCodeMap={countryCodeMap} />
          <ConnectorColumn pairCount={1} direction="left" />
          {/* Final + 3rd — render Final highlighted, 3rd as a separate column. */}
          <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minWidth: 130, flexShrink: 0 }}>
            <Box sx={{ border: 2, borderColor: 'warning.main', borderRadius: 1, p: 0.25, width: '100%' }}>
              <MatchupCell matchId="FINAL" slotMap={slotMap} numSims={numSims} countryCodeMap={countryCodeMap} />
            </Box>
          </Box>
          <Box sx={{ width: 12, flexShrink: 0 }} />
          <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minWidth: 130, flexShrink: 0, opacity: 0.85 }}>
            <Box sx={{ width: '100%' }}>
              <MatchupCell matchId="3RD" slotMap={slotMap} numSims={numSims} countryCodeMap={countryCodeMap} />
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default function ForecastBracket({ bracketSlots, numSims, countryCodeMap }: ForecastBracketProps) {
  // Three breakpoints: <768 = 2-round mobile tabs; 768-1799 = full horizontal
  // medium layout; >=1800 = traditional split-with-Final-in-center.
  const isMobile = useMediaQuery('(max-width:767px)');
  const isMedium = useMediaQuery('(min-width:768px) and (max-width:1799px)');

  const slotMap = useMemo(() => {
    const map = new Map<string, BracketSlotResult>();
    for (const s of bracketSlots) map.set(s.slotId, s);
    return map;
  }, [bracketSlots]);

  if (isMobile) {
    return <MobileForecastBracket slotMap={slotMap} numSims={numSims} countryCodeMap={countryCodeMap} />;
  }
  if (isMedium) {
    return <MediumForecastBracket slotMap={slotMap} numSims={numSims} countryCodeMap={countryCodeMap} />;
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
