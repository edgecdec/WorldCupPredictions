'use client';
import { Box, Paper, Typography } from '@mui/material';
import type { KnockoutMatchup } from '@/types';

interface MatchupProps {
  matchup: KnockoutMatchup;
  userPick?: string;
  onPick?: (matchupId: string, team: string) => void;
  readOnly?: boolean;
  disabled?: boolean;
  result?: string;
}

function TeamSlot({
  team,
  isPicked,
  isCorrect,
  isWrong,
  clickable,
  onClick,
  position,
}: {
  team: string | null;
  isPicked: boolean;
  isCorrect: boolean;
  isWrong: boolean;
  clickable: boolean;
  onClick: () => void;
  position: 'top' | 'bottom';
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
      }}
    >
      {team ? (
        <>
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

export default function Matchup({ matchup, userPick, onPick, readOnly, disabled, result }: MatchupProps) {
  const clickable = !readOnly && !disabled && !!onPick;
  const pickA = userPick === matchup.teamA;
  const pickB = userPick === matchup.teamB;

  const correctA = !!result && pickA && result === matchup.teamA;
  const wrongA = !!result && pickA && result !== matchup.teamA;
  const correctB = !!result && pickB && result === matchup.teamB;
  const wrongB = !!result && pickB && result !== matchup.teamB;

  return (
    <Paper elevation={0} sx={{ background: 'transparent', borderRadius: 0, my: 0.25 }}>
      <TeamSlot
        team={matchup.teamA}
        isPicked={pickA}
        isCorrect={correctA}
        isWrong={wrongA}
        clickable={clickable}
        onClick={() => matchup.teamA && onPick?.(matchup.id, matchup.teamA)}
        position="top"
      />
      <TeamSlot
        team={matchup.teamB}
        isPicked={pickB}
        isCorrect={correctB}
        isWrong={wrongB}
        clickable={clickable}
        onClick={() => matchup.teamB && onPick?.(matchup.id, matchup.teamB)}
        position="bottom"
      />
    </Paper>
  );
}
