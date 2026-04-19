'use client';
import { Box, Chip, Typography } from '@mui/material';
import TeamFlag from '@/components/common/TeamFlag';

const REQUIRED_COUNT = 8;
const TOTAL_THIRD_PLACE = 12;

interface ThirdPlacePickerProps {
  thirdPlaceTeams: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  disabled?: boolean;
  countryCodeMap?: Record<string, string>;
}

export default function ThirdPlacePicker({ thirdPlaceTeams, selected, onChange, disabled, countryCodeMap = {} }: ThirdPlacePickerProps) {
  const handleToggle = (team: string) => {
    if (disabled) return;
    if (selected.includes(team)) {
      onChange(selected.filter((t) => t !== team));
    } else if (selected.length < REQUIRED_COUNT) {
      onChange([...selected, team]);
    }
  };

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
        Advancing 3rd-Place Teams ({selected.length}/{REQUIRED_COUNT})
      </Typography>
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
              sx={{ cursor: disabled ? 'default' : 'pointer' }}
            />
          );
        })}
      </Box>
    </Box>
  );
}
