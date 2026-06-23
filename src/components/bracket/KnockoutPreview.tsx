'use client';
import { useMemo } from 'react';
import { Box, Paper, Typography, Tooltip, LinearProgress } from '@mui/material';
import TeamFlag from '@/components/common/TeamFlag';

interface KnockoutPreviewProps {
  /** Per R32 slot side ('R32-1-A' / 'R32-1-B' / ...) → team → fraction. */
  r32SlotDistributions: Record<string, Record<string, number>>;
  countryCodeMap?: Record<string, string>;
  /** True while the sim is still warming up — show a progress hint. */
  loading?: boolean;
  /** How many sims the current distributions are based on (for display). */
  simsCompleted?: number;
}

// 1-indexed (FIFA match number 73 = R32-1). Each entry is the human-readable
// source for the two sides as defined in lib/knockoutBracket R32_SEEDS.
const R32_LABELS: Array<{ pos: number; sideA: string; sideB: string }> = [
  { pos: 1,  sideA: '2A',   sideB: '2B' },
  { pos: 2,  sideA: '1E',   sideB: '3rd (one of A/B/C/D/F)' },
  { pos: 3,  sideA: '1F',   sideB: '2C' },
  { pos: 4,  sideA: '1C',   sideB: '2F' },
  { pos: 5,  sideA: '1I',   sideB: '3rd (one of C/D/F/G/H)' },
  { pos: 6,  sideA: '2E',   sideB: '2I' },
  { pos: 7,  sideA: '1A',   sideB: '3rd (one of C/E/F/H/I)' },
  { pos: 8,  sideA: '1L',   sideB: '3rd (one of E/H/I/J/K)' },
  { pos: 9,  sideA: '1D',   sideB: '3rd (one of B/E/F/I/J)' },
  { pos: 10, sideA: '1G',   sideB: '3rd (one of A/E/H/I/J)' },
  { pos: 11, sideA: '2K',   sideB: '2L' },
  { pos: 12, sideA: '1H',   sideB: '2J' },
  { pos: 13, sideA: '1B',   sideB: '3rd (one of E/F/G/I/J)' },
  { pos: 14, sideA: '1J',   sideB: '2H' },
  { pos: 15, sideA: '1K',   sideB: '3rd (one of D/E/I/J/L)' },
  { pos: 16, sideA: '2D',   sideB: '2G' },
];

const TOP_CHIPS = 3;

function rank(dist: Record<string, number> | undefined): Array<{ team: string; pct: number }> {
  if (!dist) return [];
  return Object.entries(dist)
    .map(([team, pct]) => ({ team, pct }))
    .sort((a, b) => b.pct - a.pct);
}

function fmtPct(p: number): string {
  if (p >= 0.995) return '100%';
  if (p < 0.005) return '<1%';
  return `${Math.round(p * 100)}%`;
}

/**
 * Side of a knockout match. Renders:
 *  - the slot label (e.g. "2A") in small text above
 *  - the leading team's flag + name big
 *  - up to TOP_CHIPS additional candidate teams as small flag+% chips
 *  - hover: full ranked list popover
 */
function SideCell({
  slotId, slotLabel, ranked, countryCodeMap,
}: {
  slotId: string;
  slotLabel: string;
  ranked: Array<{ team: string; pct: number }>;
  countryCodeMap: Record<string, string>;
}) {
  const lead = ranked[0];
  const rest = ranked.slice(1, 1 + TOP_CHIPS);
  const hoverTitle = ranked.length > 0 ? (
    <Box sx={{ p: 0.5 }}>
      <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, mb: 0.5 }}>
        {slotLabel} — {slotId}
      </Typography>
      {ranked.map((r) => (
        <Box key={r.team} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.1 }}>
          {countryCodeMap[r.team] && <TeamFlag countryCode={countryCodeMap[r.team]} size={12} />}
          <Typography variant="caption" sx={{ flexGrow: 1, fontSize: '0.7rem' }}>{r.team}</Typography>
          <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.7rem' }}>{fmtPct(r.pct)}</Typography>
        </Box>
      ))}
    </Box>
  ) : '';

  return (
    <Tooltip title={hoverTitle} arrow placement="right" disableInteractive>
      <Box sx={{
        px: 1, py: 0.75, minWidth: 0,
        cursor: 'help',
        '&:hover': { bgcolor: 'action.hover' },
      }}>
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', lineHeight: 1 }}>
          {slotLabel}
        </Typography>
        {lead ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
            {countryCodeMap[lead.team] && <TeamFlag countryCode={countryCodeMap[lead.team]} size={16} />}
            <Typography variant="body2" noWrap sx={{ fontSize: '0.8rem', fontWeight: 600, flexGrow: 1, minWidth: 0 }}>
              {lead.team}
            </Typography>
            <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary', fontWeight: 700 }}>
              {fmtPct(lead.pct)}
            </Typography>
          </Box>
        ) : (
          <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'text.disabled', fontStyle: 'italic', mt: 0.25 }}>
            —
          </Typography>
        )}
        {rest.length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.25, flexWrap: 'wrap', alignItems: 'center' }}>
            {rest.map((r) => (
              <Box key={r.team} sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                {countryCodeMap[r.team] && <TeamFlag countryCode={countryCodeMap[r.team]} size={11} />}
                <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>
                  {fmtPct(r.pct)}
                </Typography>
              </Box>
            ))}
            {ranked.length > 1 + TOP_CHIPS && (
              <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.disabled', fontStyle: 'italic' }}>
                +{ranked.length - 1 - TOP_CHIPS}
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </Tooltip>
  );
}

export default function KnockoutPreview({ r32SlotDistributions, countryCodeMap = {}, loading, simsCompleted }: KnockoutPreviewProps) {
  const matches = useMemo(() => R32_LABELS.map(({ pos, sideA, sideB }) => ({
    pos,
    sideA: { slotId: `R32-${pos}-A`, label: sideA, ranked: rank(r32SlotDistributions[`R32-${pos}-A`]) },
    sideB: { slotId: `R32-${pos}-B`, label: sideB, ranked: rank(r32SlotDistributions[`R32-${pos}-B`]) },
  })), [r32SlotDistributions]);

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Knockout Bracket (Admin Preview)
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Round of 32 only. Probabilities reflect a 10k-sim Monte Carlo of the
          remaining group games, with completed and in-progress matches respected.
          Hover any side for the full ranked list.
          {simsCompleted ? ` Based on ${simsCompleted.toLocaleString()} sims.` : ''}
        </Typography>
        {loading && <LinearProgress sx={{ mt: 1, maxWidth: 400 }} />}
      </Box>

      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
        gap: 1.5,
      }}>
        {matches.map((m) => (
          <Paper key={m.pos} variant="outlined" sx={{ overflow: 'hidden' }}>
            <Box sx={{ px: 1, py: 0.5, bgcolor: 'action.selected' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.7rem', color: 'text.secondary' }}>
                R32-{m.pos}
              </Typography>
            </Box>
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <SideCell slotId={m.sideA.slotId} slotLabel={m.sideA.label} ranked={m.sideA.ranked} countryCodeMap={countryCodeMap} />
            </Box>
            <SideCell slotId={m.sideB.slotId} slotLabel={m.sideB.label} ranked={m.sideB.ranked} countryCodeMap={countryCodeMap} />
          </Paper>
        ))}
      </Box>
    </Box>
  );
}
