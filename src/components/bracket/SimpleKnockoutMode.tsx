'use client';
import { useState, useCallback, useMemo } from 'react';
import {
  Dialog, Box, Typography, Button, IconButton, LinearProgress,
  TextField, Alert, alpha, Chip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import type { KnockoutMatchup } from '@/types';
import { KNOCKOUT_ROUNDS } from '@/types';
import TeamFlag from '@/components/common/TeamFlag';
import { cascadeClear } from '@/lib/bracketUtils';
import { getFeederMatchupIds } from '@/lib/knockoutBracket';

interface SimpleKnockoutModeProps {
  open: boolean;
  onClose: (picks: Record<string, string>, tiebreaker: string) => void;
  matchups: KnockoutMatchup[];
  initialPicks: Record<string, string>;
  initialTiebreaker: string;
  countryCodeMap: Record<string, string>;
  teamRankings: Record<string, number>;
}

/** Order matchups so later rounds appear only after their feeders. */
function buildMatchupOrder(matchups: KnockoutMatchup[]): KnockoutMatchup[] {
  const byId = new Map(matchups.map((m) => [m.id, m]));
  const ordered: KnockoutMatchup[] = [];
  const added = new Set<string>();

  // Process rounds in order: R32(0), R16(1), QF(2), SF(3), 3RD(4), FINAL(5)
  const rounds = [0, 1, 2, 3, 4, 5];
  for (const round of rounds) {
    const roundMatchups = matchups
      .filter((m) => m.round === round)
      .sort((a, b) => {
        const numA = parseInt(a.id.split('-')[1] || '0');
        const numB = parseInt(b.id.split('-')[1] || '0');
        return numA - numB;
      });
    for (const m of roundMatchups) {
      if (!added.has(m.id)) {
        ordered.push(m);
        added.add(m.id);
      }
    }
  }
  return ordered;
}

/** Resolve teams for a matchup based on current picks. */
function resolveTeams(
  matchup: KnockoutMatchup,
  picks: Record<string, string>,
): { teamA: string | null; teamB: string | null } {
  // R32 matchups have teams set from group results
  if (matchup.round === 0) {
    return { teamA: matchup.teamA, teamB: matchup.teamB };
  }
  const feeders = getFeederMatchupIds(matchup.id);
  if (!feeders) return { teamA: matchup.teamA, teamB: matchup.teamB };

  // For 3RD place match, losers advance (not winners)
  if (matchup.id === '3RD') {
    // SF losers play 3rd place match — but we need the OTHER team from each SF
    // Actually the 3RD match teams are the SF losers, which we can't directly derive
    // from picks alone. The feeders are SF-1 and SF-2, and the teams are the losers.
    // We need to find who DIDN'T win each SF.
    return { teamA: null, teamB: null }; // handled specially below
  }

  return {
    teamA: picks[feeders[0]] || null,
    teamB: picks[feeders[1]] || null,
  };
}

/** Get the loser of a semifinal based on picks and matchup data. */
function getSFLoser(
  sfId: string,
  matchups: KnockoutMatchup[],
  picks: Record<string, string>,
): string | null {
  const sf = matchups.find((m) => m.id === sfId);
  if (!sf) return null;
  const resolved = resolveTeams(sf, picks);
  const winner = picks[sfId];
  if (!winner || !resolved.teamA || !resolved.teamB) return null;
  return winner === resolved.teamA ? resolved.teamB : resolved.teamA;
}

const STEP_TIEBREAKER = -1;
const STEP_REVIEW = -2;

export default function SimpleKnockoutMode({
  open, onClose, matchups, initialPicks, initialTiebreaker,
  countryCodeMap, teamRankings,
}: SimpleKnockoutModeProps) {
  const [picks, setPicks] = useState<Record<string, string>>(initialPicks);
  const [tiebreaker, setTiebreaker] = useState(initialTiebreaker);
  const [step, setStep] = useState(0);
  const [cascadeWarning, setCascadeWarning] = useState<{ matchupId: string; team: string } | null>(null);

  const ordered = useMemo(() => buildMatchupOrder(matchups), [matchups]);
  const totalMatchups = ordered.length;

  const isSpecialStep = step < 0;
  const currentMatchup = !isSpecialStep ? ordered[step] : null;

  const progress = isSpecialStep
    ? 100
    : ((step + 1) / (totalMatchups + 2)) * 100; // +2 for tiebreaker + review

  /** Check if picking a team would cascade-clear downstream picks. */
  const wouldCascade = useCallback((matchupId: string, team: string): boolean => {
    const oldPick = picks[matchupId];
    if (!oldPick || oldPick === team) return false;
    const cleared = cascadeClear(picks, matchupId, matchups);
    return Object.keys(picks).length > Object.keys(cleared).length + 1; // +1 for the changed pick itself
  }, [picks, matchups]);

  const applyPick = useCallback((matchupId: string, team: string) => {
    setPicks((prev) => {
      const cleared = cascadeClear(prev, matchupId, matchups);
      return { ...cleared, [matchupId]: team };
    });
    // Auto-advance after brief delay
    setTimeout(() => {
      if (step < totalMatchups - 1) {
        setStep((s) => s + 1);
      } else {
        setStep(STEP_TIEBREAKER);
      }
    }, 300);
  }, [matchups, step, totalMatchups]);

  const handlePick = useCallback((matchupId: string, team: string) => {
    if (wouldCascade(matchupId, team)) {
      setCascadeWarning({ matchupId, team });
      return;
    }
    applyPick(matchupId, team);
  }, [wouldCascade, applyPick]);

  const handleConfirmCascade = useCallback(() => {
    if (!cascadeWarning) return;
    applyPick(cascadeWarning.matchupId, cascadeWarning.team);
    setCascadeWarning(null);
  }, [cascadeWarning, applyPick]);

  const handleBack = useCallback(() => {
    setCascadeWarning(null);
    if (step === STEP_REVIEW) setStep(STEP_TIEBREAKER);
    else if (step === STEP_TIEBREAKER) setStep(totalMatchups - 1);
    else if (step > 0) setStep((s) => s - 1);
  }, [step, totalMatchups]);

  const handleExit = useCallback(() => {
    onClose(picks, tiebreaker);
  }, [onClose, picks, tiebreaker]);

  /** Resolve the two teams for the current matchup. */
  const currentTeams = useMemo(() => {
    if (!currentMatchup) return { teamA: null, teamB: null };
    if (currentMatchup.id === '3RD') {
      return {
        teamA: getSFLoser('SF-1', matchups, picks),
        teamB: getSFLoser('SF-2', matchups, picks),
      };
    }
    return resolveTeams(currentMatchup, picks);
  }, [currentMatchup, matchups, picks]);

  const roundLabel = currentMatchup ? KNOCKOUT_ROUNDS[currentMatchup.round] : '';

  const filledCount = useMemo(() => {
    return ordered.filter((m) => picks[m.id]).length;
  }, [ordered, picks]);

  return (
    <Dialog open={open} fullScreen>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1, gap: 1, borderBottom: 1, borderColor: 'divider' }}>
          <IconButton onClick={handleBack} disabled={step === 0} size="small">
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="subtitle1" fontWeight="bold" sx={{ flex: 1 }}>
            {step === STEP_TIEBREAKER ? 'Tiebreaker' : step === STEP_REVIEW ? 'Review' : `${roundLabel} — Match ${step + 1}`}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {isSpecialStep
              ? step === STEP_TIEBREAKER ? `${totalMatchups + 1} of ${totalMatchups + 2}` : `${totalMatchups + 2} of ${totalMatchups + 2}`
              : `Match ${step + 1} of ${totalMatchups}`}
          </Typography>
          <IconButton onClick={handleExit} size="small">
            <CloseIcon />
          </IconButton>
        </Box>

        <LinearProgress variant="determinate" value={progress} sx={{ height: 4 }} />

        {/* Cascade warning */}
        {cascadeWarning && (
          <Alert
            severity="warning"
            sx={{ mx: 2, mt: 2 }}
            action={
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" onClick={() => setCascadeWarning(null)}>Cancel</Button>
                <Button size="small" variant="contained" color="warning" onClick={handleConfirmCascade}>Change Anyway</Button>
              </Box>
            }
          >
            Changing this pick will clear some of your later-round picks that depend on it.
          </Alert>
        )}

        {/* Content */}
        <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {step === STEP_TIEBREAKER ? (
            <TiebreakerStep
              tiebreaker={tiebreaker}
              onChange={setTiebreaker}
              onNext={() => setStep(STEP_REVIEW)}
            />
          ) : step === STEP_REVIEW ? (
            <ReviewStep
              ordered={ordered}
              picks={picks}
              matchups={matchups}
              countryCodeMap={countryCodeMap}
              tiebreaker={tiebreaker}
              filledCount={filledCount}
              totalMatchups={totalMatchups}
              onSave={handleExit}
            />
          ) : currentMatchup ? (
            <MatchupStep
              matchup={currentMatchup}
              teamA={currentTeams.teamA}
              teamB={currentTeams.teamB}
              currentPick={picks[currentMatchup.id]}
              onPick={handlePick}
              roundLabel={roundLabel}
              countryCodeMap={countryCodeMap}
              teamRankings={teamRankings}
              step={step}
              total={totalMatchups}
            />
          ) : null}
        </Box>
      </Box>
    </Dialog>
  );
}

/* ---- Sub-components ---- */

function MatchupStep({
  matchup, teamA, teamB, currentPick, onPick, roundLabel,
  countryCodeMap, teamRankings, step, total,
}: {
  matchup: KnockoutMatchup;
  teamA: string | null;
  teamB: string | null;
  currentPick?: string;
  onPick: (matchupId: string, team: string) => void;
  roundLabel: string;
  countryCodeMap: Record<string, string>;
  teamRankings: Record<string, number>;
  step: number;
  total: number;
}) {
  if (!teamA || !teamB) {
    return (
      <Box sx={{ textAlign: 'center', maxWidth: 400 }}>
        <Typography variant="h6" color="text.secondary" gutterBottom>
          Waiting for earlier picks
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Pick winners in earlier rounds first — this matchup&apos;s teams depend on those results.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 400, width: '100%' }}>
      <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mb: 3 }}>
        {roundLabel} — Pick the winner:
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TeamCard
          team={teamA}
          isPicked={currentPick === teamA}
          onClick={() => onPick(matchup.id, teamA)}
          countryCode={countryCodeMap[teamA]}
          ranking={teamRankings[teamA]}
        />
        <Typography variant="body2" color="text.secondary" textAlign="center" fontWeight="bold">
          VS
        </Typography>
        <TeamCard
          team={teamB}
          isPicked={currentPick === teamB}
          onClick={() => onPick(matchup.id, teamB)}
          countryCode={countryCodeMap[teamB]}
          ranking={teamRankings[teamB]}
        />
      </Box>
    </Box>
  );
}

function TeamCard({
  team, isPicked, onClick, countryCode, ranking,
}: {
  team: string;
  isPicked: boolean;
  onClick: () => void;
  countryCode?: string;
  ranking?: number;
}) {
  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        p: 2.5,
        borderRadius: 2,
        border: 2,
        borderColor: isPicked ? 'primary.main' : 'divider',
        bgcolor: (theme) => isPicked ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
        cursor: 'pointer',
        minHeight: 64,
        transition: 'all 0.2s ease',
        '&:hover': { bgcolor: 'action.hover' },
        '&:active': { bgcolor: 'action.selected' },
      }}
    >
      {countryCode && <TeamFlag countryCode={countryCode} size={40} />}
      <Box sx={{ flex: 1 }}>
        <Typography variant="h6" fontWeight="medium">{team}</Typography>
        {ranking && (
          <Typography variant="caption" color="text.secondary">
            FIFA #{ranking}
          </Typography>
        )}
      </Box>
      {isPicked && <CheckCircleIcon color="primary" />}
    </Box>
  );
}

function TiebreakerStep({
  tiebreaker, onChange, onNext,
}: {
  tiebreaker: string;
  onChange: (v: string) => void;
  onNext: () => void;
}) {
  return (
    <Box sx={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
      <Typography variant="h5" gutterBottom>Tiebreaker</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        How many total goals will be scored in the Final match?
      </Typography>
      <TextField
        type="number"
        value={tiebreaker}
        onChange={(e) => onChange(e.target.value)}
        label="Total goals in Final"
        slotProps={{ htmlInput: { min: 0 } }}
        fullWidth
        sx={{ mb: 3 }}
      />
      <Button variant="contained" size="large" fullWidth onClick={onNext}>
        Review Picks
      </Button>
    </Box>
  );
}

function ReviewStep({
  ordered, picks, matchups, countryCodeMap, tiebreaker,
  filledCount, totalMatchups, onSave,
}: {
  ordered: KnockoutMatchup[];
  picks: Record<string, string>;
  matchups: KnockoutMatchup[];
  countryCodeMap: Record<string, string>;
  tiebreaker: string;
  filledCount: number;
  totalMatchups: number;
  onSave: () => void;
}) {
  // Group picks by round for summary
  const byRound = new Map<number, Array<{ id: string; pick: string | undefined }>>();
  for (const m of ordered) {
    const list = byRound.get(m.round) ?? [];
    list.push({ id: m.id, pick: picks[m.id] });
    byRound.set(m.round, list);
  }

  return (
    <Box sx={{ maxWidth: 500, width: '100%' }}>
      <Typography variant="h5" gutterBottom textAlign="center">Review Your Picks</Typography>
      <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mb: 2 }}>
        {filledCount} of {totalMatchups} matches picked
        {tiebreaker ? ` · Tiebreaker: ${tiebreaker} goals` : ''}
      </Typography>

      {Array.from(byRound.entries()).map(([round, items]) => (
        <Box key={round} sx={{ mb: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
            {KNOCKOUT_ROUNDS[round]}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {items.map(({ id, pick }) => (
              <Chip
                key={id}
                size="small"
                icon={pick && countryCodeMap[pick] ? <TeamFlag countryCode={countryCodeMap[pick]} size={16} /> : undefined}
                label={pick || '—'}
                variant={pick ? 'filled' : 'outlined'}
                color={pick ? 'primary' : 'default'}
              />
            ))}
          </Box>
        </Box>
      ))}

      <Button variant="contained" size="large" fullWidth sx={{ mt: 2 }} onClick={onSave}>
        Save Knockout Picks
      </Button>
    </Box>
  );
}
