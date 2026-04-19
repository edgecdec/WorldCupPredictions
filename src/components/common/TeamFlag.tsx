'use client';
import { useState } from 'react';
import { Box } from '@mui/material';

const FLAG_CDN_BASE = 'https://flagcdn.com/w40';
const FLAG_WIDTH = 20;
const FLAG_HEIGHT = 15;

// Emoji flag fallback: convert country code to regional indicator symbols
function toEmoji(code: string): string {
  // Handle sub-national codes like gb-eng, gb-sct
  const base = code.split('-')[0].toUpperCase();
  return [...base].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join('');
}

interface TeamFlagProps {
  countryCode: string;
  size?: number;
}

export default function TeamFlag({ countryCode, size = FLAG_WIDTH }: TeamFlagProps) {
  const [failed, setFailed] = useState(false);
  const height = Math.round(size * (FLAG_HEIGHT / FLAG_WIDTH));

  if (failed) {
    return (
      <Box component="span" sx={{ fontSize: height, lineHeight: 1, flexShrink: 0 }}>
        {toEmoji(countryCode)}
      </Box>
    );
  }

  return (
    <Box
      component="img"
      src={`${FLAG_CDN_BASE}/${countryCode}.png`}
      alt={countryCode}
      onError={() => setFailed(true)}
      sx={{
        width: size,
        height,
        objectFit: 'cover',
        borderRadius: '2px',
        flexShrink: 0,
        verticalAlign: 'middle',
      }}
    />
  );
}
