'use client';
import { useState, useCallback } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import type { KnockoutMatchup } from '@/types';
import TeamFlag from '@/components/common/TeamFlag';

const PULSE_DURATION_MS = 300;

interface MatchupProps {
  matchup: KnockoutMatchup;
  userPick?: string;
  onPick?: (matchupId: string, team: string) => void;
  readOnly?: boolean;
  disabled?: boolean;
  result?: string;
  countryCodeMap?: Record<string, string>;
  isChampionPick?: boolean;
}

function TeamSlot({
  team,
  isPicked,
  isCorrect,
  isWrong,
  clickable,
  onClick,
  position,
  countryCode,
  animating,
}: {
  team: string | null;
  isPicked: boolean;
  isCorrect: boolean;
  isWrong: boolean;
  clickable: boolean;
  onClick: () => void;
  position: 'top' | 'bottom';
  countryCode?: string;
  animating: boolean;
}) {
  const bg = isCorrect
    ? 'rgba(76, 175, 80, 0.3)'
    : isWrong
      ? 'rgba(244, 67, 54, 0.3)'
      : isPicked
        ? 'rgba(66, 165, 245, 0.3)'
        : 'transparent';

  return (
    <Box
      onClick={() => clickable && team && onClick()}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        py: 0.5,
        cursor: clickable && team ? 'pointer' : 'default',
        background: bg,
        borderTop: position === 'top' ? 1 : 0,
        borderLeft: 1,
        borderRight: 1,
        borderBottom: 1,
        borderColor: 'divider',
        minWidth: 150,
        minHeight: 28,
        '&:hover': clickable && team ? { background: isPicked ? bg : 'action.hover' } : {},
        transition: 'background 0.2s ease',
        animation: animating ? `pickPulse ${PULSE_DURATION_MS}ms ease` : 'none',
      }}
    >
      {team ? (
        <>
          {countryCode && <TeamFlag countryCode={countryCode} size={16} />}
          <Typography
            variant="body2"
            noWrap
            sx={{
              fontSize: '0.75rem',
              fontWeight: isPicked ? 700 : 400,
              flexGrow: 1,
            }}
          >
            {team}
          </Typography>
          {isCorrect && (
            <Typography component="span" sx={{ fontSize: '0.65rem', color: 'success.main' }}>
              ✓
            </Typography>
          )}
          {isWrong && (
            <Typography component="span" sx={{ fontSize: '0.65rem', color: 'error.main' }}>
              ✗
            </Typography>
          )}
        </>
      ) : (
        <Typography variant="body2" sx={{ color: 'text.disabled', fontSize: '0.75rem', fontStyle: 'italic' }}>
          —
        </Typography>
      )}
    </Box>
  );
}

export default function Matchup({ matchup, userPick, onPick, readOnly, disabled, result, countryCodeMap = {}, isChampionPick }: MatchupProps) {
  const clickable = !readOnly && !disabled && !!onPick;
  const pickA = userPick === matchup.teamA;
  const pickB = userPick === matchup.teamB;

  const correctA = !!result && pickA && result === matchup.teamA;
  const wrongA = !!result && pickA && result !== matchup.teamA;
  const correctB = !!result && pickB && result === matchup.teamB;
  const wrongB = !!result && pickB && result !== matchup.teamB;

  const [animatingSlot, setAnimatingSlot] = useState<'A' | 'B' | null>(null);

  const handlePick = useCallback((team: string, slot: 'A' | 'B') => {
    setAnimatingSlot(slot);
    setTimeout(() => setAnimatingSlot(null), PULSE_DURATION_MS);
    onPick?.(matchup.id, team);
  }, [onPick, matchup.id]);

  const showShimmer = isChampionPick && userPick;

  return (
    <Paper
      elevation={0}
      sx={{
        background: showShimmer
          ? 'linear-gradient(90deg, transparent 0%, rgba(255,193,7,0.25) 50%, transparent 100%)'
          : 'transparent',
        backgroundSize: showShimmer ? '200% 100%' : undefined,
        animation: showShimmer ? 'championShimmer 2s ease-in-out infinite' : 'none',
        borderRadius: 0,
        my: 0.25,
      }}
    >
      <TeamSlot
        team={matchup.teamA}
        isPicked={pickA}
        isCorrect={correctA}
        isWrong={wrongA}
        clickable={clickable}
        onClick={() => matchup.teamA && handlePick(matchup.teamA, 'A')}
        position="top"
        countryCode={matchup.teamA ? countryCodeMap[matchup.teamA] : undefined}
        animating={animatingSlot === 'A'}
      />
      <TeamSlot
        team={matchup.teamB}
        isPicked={pickB}
        isCorrect={correctB}
        isWrong={wrongB}
        clickable={clickable}
        onClick={() => matchup.teamB && handlePick(matchup.teamB, 'B')}
        position="bottom"
        countryCode={matchup.teamB ? countryCodeMap[matchup.teamB] : undefined}
        animating={animatingSlot === 'B'}
      />
    </Paper>
  );
}
