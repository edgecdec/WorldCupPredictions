'use client';
import { Box, Typography, useTheme } from '@mui/material';

interface ScoreHistogramProps {
  /** Score → probability (sums to 1, sparse). */
  distribution: Record<number, number>;
  /** Average score — drawn as a vertical line. */
  avgScore: number;
  /** Width and height of the SVG canvas. */
  width?: number;
  height?: number;
}

const PADDING_X = 28;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 28;
const BAR_GAP = 1;

/**
 * Compact SVG bar chart of a player's score distribution. Bars span integer
 * buckets from the min to the max non-zero score. The avg-score line is drawn
 * on top so the user sees roughly where their forecast lands within the
 * distribution.
 */
export default function ScoreHistogram({
  distribution,
  avgScore,
  width = 320,
  height = 140,
}: ScoreHistogramProps) {
  const theme = useTheme();
  const entries = Object.entries(distribution).map(([k, v]) => [Number(k), v] as const);
  if (entries.length === 0) {
    return (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        No simulation data
      </Typography>
    );
  }

  const minScore = Math.min(...entries.map(([s]) => s));
  const maxScore = Math.max(...entries.map(([s]) => s));
  const span = Math.max(1, maxScore - minScore);
  const maxProb = Math.max(...entries.map(([, p]) => p));

  const plotW = width - PADDING_X * 2;
  const plotH = height - PADDING_TOP - PADDING_BOTTOM;
  const barWidth = Math.max(1, plotW / (span + 1) - BAR_GAP);

  const xFor = (score: number) => PADDING_X + ((score - minScore) / (span + 1)) * plotW;
  const yFor = (prob: number) => PADDING_TOP + plotH - (prob / maxProb) * plotH;
  const avgX = PADDING_X + ((avgScore - minScore) / (span + 1)) * plotW + barWidth / 2;

  // Pick ~5 ticks along the x-axis at integer scores.
  const tickStep = Math.max(1, Math.ceil((span + 1) / 6));
  const ticks: number[] = [];
  for (let s = minScore; s <= maxScore; s += tickStep) ticks.push(s);
  if (ticks[ticks.length - 1] !== maxScore) ticks.push(maxScore);

  const barColor = theme.palette.primary.main;
  const avgLineColor = theme.palette.warning.main;
  const axisColor = theme.palette.text.secondary;

  return (
    <Box>
      <svg width={width} height={height} style={{ display: 'block' }}>
        {/* Bars */}
        {entries.map(([score, prob]) => (
          <rect
            key={score}
            x={xFor(score)}
            y={yFor(prob)}
            width={barWidth}
            height={PADDING_TOP + plotH - yFor(prob)}
            fill={barColor}
            opacity={0.85}
          />
        ))}

        {/* Average score vertical line */}
        <line
          x1={avgX}
          x2={avgX}
          y1={PADDING_TOP - 4}
          y2={PADDING_TOP + plotH}
          stroke={avgLineColor}
          strokeWidth={2}
          strokeDasharray="3 2"
        />
        <text
          x={avgX}
          y={PADDING_TOP - 5}
          fill={avgLineColor}
          fontSize="10"
          fontWeight="700"
          textAnchor="middle"
        >
          avg {avgScore.toFixed(1)}
        </text>

        {/* X-axis ticks */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={xFor(t) + barWidth / 2}
              x2={xFor(t) + barWidth / 2}
              y1={PADDING_TOP + plotH}
              y2={PADDING_TOP + plotH + 3}
              stroke={axisColor}
              strokeWidth={1}
            />
            <text
              x={xFor(t) + barWidth / 2}
              y={PADDING_TOP + plotH + 14}
              fill={axisColor}
              fontSize="10"
              textAnchor="middle"
            >
              {t}
            </text>
          </g>
        ))}

        {/* X-axis line */}
        <line
          x1={PADDING_X}
          x2={width - PADDING_X}
          y1={PADDING_TOP + plotH}
          y2={PADDING_TOP + plotH}
          stroke={axisColor}
          strokeWidth={1}
        />
      </svg>
    </Box>
  );
}
