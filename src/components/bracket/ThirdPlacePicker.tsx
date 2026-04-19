'use client';
import { useState, useCallback } from 'react';
import { Box, Chip, Typography, Tooltip } from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import TeamFlag from '@/components/common/TeamFlag';

const REQUIRED_COUNT = 8;
const TOTAL_THIRD_PLACE = 12;
const POP_DURATION_MS = 300;

interface ThirdPlacePickerProps {
  thirdPlaceTeams: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  disabled?: boolean;
  countryCodeMap?: Record<string, string>;
}

export default function ThirdPlacePicker({ thirdPlaceTeams, selected, onChange, disabled, countryCodeMap = {} }: ThirdPlacePickerProps) {
  const [animatingChip, setAnimatingChip] = useState<string | null>(null);

  const handleToggle = useCallback((team: string) => {
    if (disabled) return;
    setAnimatingChip(team);
    setTimeout(() => setAnimatingChip(null), POP_DURATION_MS);
    if (selected.includes(team)) {
      onChange(selected.filter((t) => t !== team));
    } else if (selected.length < REQUIRED_COUNT) {
      onChange([...selected, team]);
    }
  }, [disabled, selected, onChange]);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
          Advancing 3rd-Place Teams ({selected.length}/{REQUIRED_COUNT})
        </Typography>
        <Tooltip title="8 of 12 third-place teams advance to the Round of 32 — pick which ones you think will make it!">
          <HelpOutlineIcon fontSize="small" color="action" sx={{ mb: 0.5, cursor: 'help' }} />
        </Tooltip>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Select exactly {REQUIRED_COUNT} of {TOTAL_THIRD_PLACE} third-place teams to advance to the knockout round.
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {thirdPlaceTeams.map((team) => {
          const isSelected = selected.includes(team);
          const code = countryCodeMap[team];
          return (
            <Chip
              key={team}
              icon={code ? <TeamFlag countryCode={code} size={16} /> : undefined}
              label={team}
              color={isSelected ? 'primary' : 'default'}
              variant={isSelected ? 'filled' : 'outlined'}
              onClick={() => handleToggle(team)}
              disabled={disabled}
              sx={{
                cursor: disabled ? 'default' : 'pointer',
                animation: animatingChip === team ? `chipPop ${POP_DURATION_MS}ms ease` : 'none',
              }}
            />
          );
        })}
      </Box>
    </Box>
  );
}
