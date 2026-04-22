'use client';
import { useCallback } from 'react';
import { Box, Typography, Tooltip, Chip, Stack, Checkbox, alpha } from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import type { Theme } from '@mui/material/styles';
import TeamFlag from '@/components/common/TeamFlag';

const REQUIRED_COUNT = 8;
const TOTAL_THIRD_PLACE = 12;
const HIGHLIGHT_ALPHA = 0.12;

export interface ThirdPlaceTeamDetail {
  countryCode?: string;
  pot: number;
  fifaRanking: number;
  groupName: string;
}

interface ThirdPlacePickerProps {
  thirdPlaceTeams: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  disabled?: boolean;
  countryCodeMap?: Record<string, string>;
  teamDetails?: Record<string, ThirdPlaceTeamDetail>;
}

export default function ThirdPlacePicker({ thirdPlaceTeams, selected, onChange, disabled, countryCodeMap = {}, teamDetails = {} }: ThirdPlacePickerProps) {
  const handleToggle = useCallback((team: string) => {
    if (disabled) return;
    if (selected.includes(team)) {
      onChange(selected.filter((t) => t !== team));
    } else if (selected.length < REQUIRED_COUNT) {
      onChange([...selected, team]);
    }
  }, [disabled, selected, onChange]);

  const hasDetails = Object.keys(teamDetails).length > 0;

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

      {hasDetails ? (
        <Stack spacing={0.5}>
          {thirdPlaceTeams.map((team) => {
            const detail = teamDetails[team];
            const isSelected = selected.includes(team);
            const code = detail?.countryCode ?? countryCodeMap[team];
            const atLimit = selected.length >= REQUIRED_COUNT && !isSelected;
            return (
              <Box
                key={team}
                onClick={() => !atLimit && handleToggle(team)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  py: 0.75,
                  px: 1.5,
                  borderRadius: 1,
                  cursor: disabled ? 'default' : atLimit ? 'not-allowed' : 'pointer',
                  bgcolor: (theme: Theme) =>
                    isSelected
                      ? alpha(theme.palette.success.main, HIGHLIGHT_ALPHA)
                      : alpha(theme.palette.error.main, HIGHLIGHT_ALPHA * 0.6),
                  opacity: atLimit && !disabled ? 0.5 : 1,
                  transition: 'background-color 0.2s',
                  '&:hover': disabled ? {} : {
                    bgcolor: (theme: Theme) =>
                      isSelected
                        ? alpha(theme.palette.success.main, HIGHLIGHT_ALPHA * 1.8)
                        : atLimit
                          ? alpha(theme.palette.error.main, HIGHLIGHT_ALPHA * 0.6)
                          : alpha(theme.palette.action.hover, 0.08),
                  },
                }}
              >
                <Checkbox
                  checked={isSelected}
                  disabled={disabled || atLimit}
                  size="small"
                  sx={{ p: 0 }}
                  tabIndex={-1}
                />
                {code && <TeamFlag countryCode={code} />}
                <Typography variant="body2" sx={{ flex: 1, fontWeight: isSelected ? 'bold' : 'normal' }}>
                  {team}
                </Typography>
                {detail && (
                  <>
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                      Group {detail.groupName}
                    </Typography>
                    <Chip label={`Pot ${detail.pot}`} size="small" variant="outlined" />
                    <Typography variant="caption" color="text.secondary" sx={{ minWidth: 24, textAlign: 'right' }}>
                      #{detail.fifaRanking}
                    </Typography>
                  </>
                )}
              </Box>
            );
          })}
        </Stack>
      ) : (
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
      )}
    </Box>
  );
}
