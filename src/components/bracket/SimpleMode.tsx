'use client';
import { useState, useCallback, useMemo } from 'react';
import { Dialog, Box, Typography, Button, IconButton, LinearProgress, Chip, alpha } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import UndoIcon from '@mui/icons-material/Undo';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import type { BracketData, Group } from '@/types';
import TeamFlag from '@/components/common/TeamFlag';
import ThirdPlacePicker from '@/components/bracket/ThirdPlacePicker';

const REQUIRED_THIRD_PLACE = 8;
const POSITION_LABELS = ['1st', '2nd', '3rd', '4th'] as const;

interface SimpleModeProps {
  open: boolean;
  onClose: (groupOrders: Record<string, string[]>, thirdPlacePicks: string[]) => void;
  bracketData: BracketData;
  initialGroupOrders: Record<string, string[]>;
  initialThirdPlacePicks: string[];
  countryCodeMap: Record<string, string>;
}

export default function SimpleMode({ open, onClose, bracketData, initialGroupOrders, initialThirdPlacePicks, countryCodeMap }: SimpleModeProps) {
  const groups = bracketData.groups;
  const totalSteps = groups.length + 1; // 12 groups + third-place picker
  const [step, setStep] = useState(0);
  const [groupOrders, setGroupOrders] = useState<Record<string, string[]>>(initialGroupOrders);
  const [thirdPlacePicks, setThirdPlacePicks] = useState<string[]>(initialThirdPlacePicks);
  // Tracks the order of picks within the current group
  const [currentPicks, setCurrentPicks] = useState<string[]>([]);

  const isThirdPlaceStep = step >= groups.length;
  const currentGroup: Group | undefined = groups[step];
  const progress = ((step + (isThirdPlaceStep ? 1 : currentPicks.length / 4)) / totalSteps) * 100;

  const remainingTeams = useMemo(() => {
    if (!currentGroup) return [];
    const order = groupOrders[currentGroup.name] || currentGroup.teams.map((t) => t.name);
    return order.filter((name) => !currentPicks.includes(name));
  }, [currentGroup, groupOrders, currentPicks]);

  const thirdPlaceTeams = useMemo(() => {
    return groups.map((g) => {
      const order = groupOrders[g.name];
      return order ? order[2] : g.teams[2].name;
    });
  }, [groups, groupOrders]);

  const handlePickTeam = useCallback((teamName: string) => {
    const newPicks = [...currentPicks, teamName];
    setCurrentPicks(newPicks);

    if (newPicks.length === 4 && currentGroup) {
      // All 4 picked — save order and auto-advance
      setGroupOrders((prev) => ({ ...prev, [currentGroup.name]: newPicks as unknown as string[] }));
      setTimeout(() => {
        setStep((s) => s + 1);
        setCurrentPicks([]);
      }, 300);
    }
  }, [currentPicks, currentGroup]);

  const handleUndo = useCallback(() => {
    if (currentPicks.length > 0) {
      setCurrentPicks((prev) => prev.slice(0, -1));
    }
  }, [currentPicks]);

  const handleBack = useCallback(() => {
    if (step > 0) {
      setStep((s) => s - 1);
      setCurrentPicks([]);
    }
  }, [step]);

  const handleExit = useCallback(() => {
    onClose(groupOrders, thirdPlacePicks);
  }, [onClose, groupOrders, thirdPlacePicks]);

  const teamMap = useMemo(() => {
    const map = new Map<string, { fifaRanking: number; countryCode?: string; pot: number }>();
    for (const g of groups) {
      for (const t of g.teams) {
        map.set(t.name, { fifaRanking: t.fifaRanking, countryCode: t.countryCode, pot: t.pot });
      }
    }
    return map;
  }, [groups]);

  return (
    <Dialog open={open} fullScreen>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1, gap: 1, borderBottom: 1, borderColor: 'divider' }}>
          <IconButton onClick={handleBack} disabled={step === 0} size="small">
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="subtitle1" fontWeight="bold" sx={{ flex: 1 }}>
            {isThirdPlaceStep ? 'Advancing 3rd-Place Teams' : `Group ${currentGroup?.name}`}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {isThirdPlaceStep ? `Step ${groups.length + 1} of ${totalSteps}` : `Group ${step + 1} of ${groups.length}`}
          </Typography>
          <IconButton onClick={handleExit} size="small">
            <CloseIcon />
          </IconButton>
        </Box>

        <LinearProgress variant="determinate" value={progress} sx={{ height: 4 }} />

        {/* Content */}
        <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 3 }}>
          {isThirdPlaceStep ? (
            <Box sx={{ maxWidth: 600, mx: 'auto' }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Select exactly {REQUIRED_THIRD_PLACE} third-place teams you think will advance to the knockout round.
              </Typography>
              <ThirdPlacePicker
                thirdPlaceTeams={thirdPlaceTeams}
                selected={thirdPlacePicks}
                onChange={setThirdPlacePicks}
                countryCodeMap={countryCodeMap}
              />
              <Button
                variant="contained"
                size="large"
                fullWidth
                sx={{ mt: 3 }}
                disabled={thirdPlacePicks.filter((t) => thirdPlaceTeams.includes(t)).length !== REQUIRED_THIRD_PLACE}
                onClick={handleExit}
              >
                Done
              </Button>
            </Box>
          ) : (
            <Box sx={{ maxWidth: 500, mx: 'auto' }}>
              {/* Already picked */}
              {currentPicks.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" color="text.secondary">Your order:</Typography>
                    <IconButton size="small" onClick={handleUndo}>
                      <UndoIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  {currentPicks.map((name, i) => {
                    const info = teamMap.get(name);
                    return (
                      <Box key={name} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.5, px: 1, borderRadius: 1, bgcolor: (theme) => alpha(theme.palette.success.main, 0.08), mb: 0.5 }}>
                        <Chip label={POSITION_LABELS[i]} size="small" color="success" variant="outlined" />
                        {info?.countryCode && <TeamFlag countryCode={info.countryCode} size={24} />}
                        <Typography variant="body1">{name}</Typography>
                        <CheckCircleIcon fontSize="small" color="success" sx={{ ml: 'auto' }} />
                      </Box>
                    );
                  })}
                </Box>
              )}

              {/* Prompt */}
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                {currentPicks.length < 4
                  ? `Tap the team you predict will finish ${POSITION_LABELS[currentPicks.length]}:`
                  : 'Complete!'}
              </Typography>

              {/* Remaining teams */}
              {remainingTeams.map((name) => {
                const info = teamMap.get(name);
                return (
                  <Box
                    key={name}
                    onClick={() => handlePickTeam(name)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      p: 2,
                      mb: 1.5,
                      borderRadius: 2,
                      border: 1,
                      borderColor: 'divider',
                      cursor: 'pointer',
                      minHeight: 56,
                      '&:hover': { bgcolor: 'action.hover' },
                      '&:active': { bgcolor: 'action.selected' },
                    }}
                  >
                    {info?.countryCode && <TeamFlag countryCode={info.countryCode} size={32} />}
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body1" fontWeight="medium">{name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        FIFA #{info?.fifaRanking} · Pot {info?.pot}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      </Box>
    </Dialog>
  );
}
