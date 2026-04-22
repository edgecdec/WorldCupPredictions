'use client';
import { useState, useCallback, useMemo } from 'react';
import { Dialog, Box, Typography, Button, IconButton, LinearProgress, Chip, alpha, keyframes } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import UndoIcon from '@mui/icons-material/Undo';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import type { BracketData, Group } from '@/types';
import TeamFlag from '@/components/common/TeamFlag';
import ThirdPlacePicker, { type ThirdPlaceTeamDetail } from '@/components/bracket/ThirdPlacePicker';
import useSwipe from '@/hooks/useSwipe';

const REQUIRED_THIRD_PLACE = 8;
const POSITION_LABELS = ['1st', '2nd', '3rd', '4th'] as const;
const PICK_HIGHLIGHT_MS = 300;

const pickFlash = keyframes`
  0% { transform: scale(1); }
  50% { transform: scale(1.03); }
  100% { transform: scale(1); }
`;

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
  const totalSteps = groups.length + 1;
  const [step, setStep] = useState(0);
  const [groupOrders, setGroupOrders] = useState<Record<string, string[]>>(initialGroupOrders);
  const [thirdPlacePicks, setThirdPlacePicks] = useState<string[]>(initialThirdPlacePicks);
  const [currentPicks, setCurrentPicks] = useState<string[]>([]);
  const [lastPicked, setLastPicked] = useState<string | null>(null);

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

  const thirdPlaceTeamDetails = useMemo(() => {
    const details: Record<string, ThirdPlaceTeamDetail> = {};
    for (const g of groups) {
      for (const t of g.teams) {
        details[t.name] = { countryCode: t.countryCode, pot: t.pot, fifaRanking: t.fifaRanking, groupName: g.name };
      }
    }
    return details;
  }, [groups]);

  const handlePickTeam = useCallback((teamName: string) => {
    setLastPicked(teamName);
    const newPicks = [...currentPicks, teamName];
    setCurrentPicks(newPicks);

    if (newPicks.length === 4 && currentGroup) {
      setGroupOrders((prev) => ({ ...prev, [currentGroup.name]: newPicks as unknown as string[] }));
      setTimeout(() => {
        setStep((s) => s + 1);
        setCurrentPicks([]);
        setLastPicked(null);
      }, PICK_HIGHLIGHT_MS);
    } else {
      setTimeout(() => setLastPicked(null), PICK_HIGHLIGHT_MS);
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
      setLastPicked(null);
    }
  }, [step]);

  const handleSkip = useCallback(() => {
    if (!isThirdPlaceStep && step < groups.length - 1) {
      setStep((s) => s + 1);
      setCurrentPicks([]);
      setLastPicked(null);
    } else if (!isThirdPlaceStep) {
      setStep(groups.length);
      setCurrentPicks([]);
    }
  }, [isThirdPlaceStep, step, groups.length]);

  const handleExit = useCallback(() => {
    onClose(groupOrders, thirdPlacePicks);
  }, [onClose, groupOrders, thirdPlacePicks]);

  const swipeHandlers = useSwipe(handleSkip, handleBack);

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
      <Box
        sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}
        {...swipeHandlers}
      >
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
        <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 2 }}>
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
                teamDetails={thirdPlaceTeamDetails}
              />
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
                    const justPicked = name === lastPicked;
                    return (
                      <Box
                        key={name}
                        sx={{
                          display: 'flex', alignItems: 'center', gap: 1.5, py: 0.5, px: 1,
                          borderRadius: 1, bgcolor: (theme) => alpha(theme.palette.success.main, 0.08), mb: 0.5,
                          animation: justPicked ? `${pickFlash} ${PICK_HIGHLIGHT_MS}ms ease` : 'none',
                        }}
                      >
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
                      display: 'flex', alignItems: 'center', gap: 2,
                      p: 2, mb: 1.5, borderRadius: 2, border: 1, borderColor: 'divider',
                      cursor: 'pointer', minHeight: 56,
                      transition: 'background-color 0.15s ease',
                      WebkitTapHighlightColor: 'transparent',
                      '&:hover': { bgcolor: 'action.hover' },
                      '&:active': { bgcolor: 'action.selected' },
                      '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
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

        {/* Bottom navigation bar — thumb-friendly */}
        <Box sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          px: 2, py: 1.5, borderTop: 1, borderColor: 'divider',
          bgcolor: 'background.paper',
          pb: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
        }}>
          <Button
            onClick={handleBack}
            disabled={step === 0}
            sx={{ minHeight: 48, minWidth: 80 }}
          >
            Back
          </Button>
          {isThirdPlaceStep ? (
            <Button
              variant="contained"
              onClick={handleExit}
              disabled={thirdPlacePicks.filter((t) => thirdPlaceTeams.includes(t)).length !== REQUIRED_THIRD_PLACE}
              sx={{ minHeight: 48, minWidth: 120 }}
            >
              Done
            </Button>
          ) : (
            <Button
              onClick={handleSkip}
              sx={{ minHeight: 48, minWidth: 80 }}
            >
              Skip
            </Button>
          )}
        </Box>
      </Box>
    </Dialog>
  );
}
