'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Box, Button, Typography, Alert, CircularProgress, TextField, useMediaQuery, useTheme } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LockIcon from '@mui/icons-material/Lock';
import Link from 'next/link';
import KnockoutBracket from '@/components/bracket/KnockoutBracket';
import MobileBracket from '@/components/bracket/MobileBracket';
import CountdownTimer from '@/components/common/CountdownTimer';
import { useAuth } from '@/hooks/useAuth';
import { cascadeClear, computeEffectiveMatchups, generateEmptyBracket } from '@/lib/bracketUtils';
import type { Tournament, TournamentResults, KnockoutMatchup, BracketData } from '@/types';
import PrintExportButtons from '@/components/common/PrintExportButtons';
import AutofillButtons, { AutofillStrategy } from '@/components/common/AutofillButtons';
import { chalkKnockout, randomKnockout, smartKnockout } from '@/lib/autofill';
import TouchAppIcon from '@mui/icons-material/TouchApp';
import SimpleKnockoutMode from '@/components/bracket/SimpleKnockoutMode';
import MiniBracket from '@/components/bracket/MiniBracket';
import ScoringRulesSummary from '@/components/common/ScoringRulesSummary';
import { useAutosave } from '@/hooks/useAutosave';
import AutosaveIndicator from '@/components/common/AutosaveIndicator';

export default function KnockoutPage() {
  const { user, loading: authLoading } = useAuth();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matchups, setMatchups] = useState<KnockoutMatchup[]>([]);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [tiebreaker, setTiebreaker] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [simpleMode, setSimpleMode] = useState(false);
  const [lockedGroup, setLockedGroup] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const tRes = await fetch('/api/tournaments');
        const tData = await tRes.json();
        if (!tData.ok || !tData.tournament) {
          setLoading(false);
          return;
        }
        const t = tData.tournament as Tournament;
        setTournament(t);

        const results = t.results_data as TournamentResults;
        if (results?.knockoutBracket) {
          setMatchups(results.knockoutBracket);
        }

        if (user) {
          const pRes = await fetch('/api/picks');
          const pData = await pRes.json();
          if (pData.ok && pData.prediction) {
            const pred = pData.prediction;
            if (pred.knockout_picks && typeof pred.knockout_picks === 'object') {
              setPicks(pred.knockout_picks);
            }
            if (pred.tiebreaker != null) {
              setTiebreaker(String(pred.tiebreaker));
            }
          }
          if (pData.locked_group) setLockedGroup(pData.locked_group);
        }
      } catch {
        setError('Failed to load data');
      } finally {
        setLoading(false);
        setDataLoaded(true);
      }
    }
    if (!authLoading) load();
  }, [authLoading, user]);

  const handlePick = useCallback(
    (matchupId: string, team: string) => {
      setPicks((prev) => {
        const cleared = cascadeClear(prev, matchupId, matchups);
        return { ...cleared, [matchupId]: team };
      });
    },
    [matchups],
  );

  const bracketData = tournament?.bracket_data as BracketData | undefined;

  const countryCodeMap: Record<string, string> = {};
  const teamRankingsMap: Record<string, number> = {};
  if (bracketData?.groups) {
    for (const g of bracketData.groups) {
      for (const t of g.teams) {
        if (t.countryCode) countryCodeMap[t.name] = t.countryCode;
        teamRankingsMap[t.name] = t.fifaRanking;
      }
    }
  }

  const handleAutofill = useCallback((strategy: AutofillStrategy) => {
    if (!bracketData || matchups.length === 0) return;
    const fillFn = strategy === 'chalk' ? chalkKnockout : strategy === 'random' ? randomKnockout : smartKnockout;
    setPicks((prev) => fillFn(matchups, bracketData, prev));
  }, [bracketData, matchups]);

  const results = tournament?.results_data as TournamentResults | undefined;
  const hasKnockoutBracket = matchups.length > 0;

  // Compute effective matchups with picks propagated into downstream slots
  // When no real bracket exists, use an empty skeleton for preview
  const effectiveMatchups = useMemo(
    () => hasKnockoutBracket ? computeEffectiveMatchups(matchups, picks) : generateEmptyBracket(),
    [matchups, picks, hasKnockoutBracket],
  );

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const isLocked = Boolean(
    tournament?.lock_time_knockout && new Date() > new Date(tournament.lock_time_knockout),
  );
  const disabled = !user || isLocked || !!lockedGroup;

  const autosaveDataJson = useMemo(
    () => JSON.stringify({ picks, tiebreaker }),
    [picks, tiebreaker],
  );

  const doSave = useCallback(async (): Promise<boolean> => {
    const res = await fetch('/api/picks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_knockout',
        knockout_picks: picks,
        tiebreaker: tiebreaker ? parseInt(tiebreaker, 10) : null,
      }),
    });
    return res.ok;
  }, [picks, tiebreaker]);

  const { status: autosaveStatus, markSaved } = useAutosave({
    dataJson: dataLoaded ? autosaveDataJson : '',
    disabled,
    saveFn: doSave,
  });

  // Mark initial load as saved baseline
  useEffect(() => {
    if (dataLoaded) markSaved(autosaveDataJson);
  }, [dataLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (disabled) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_knockout',
          knockout_picks: picks,
          tiebreaker: tiebreaker ? parseInt(tiebreaker, 10) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSuccess('Knockout picks saved!');
      markSaved(autosaveDataJson);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading || authLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!tournament) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography color="text.secondary">No tournament available yet.</Typography>
      </Box>
    );
  }

  const lockDate = tournament.lock_time_knockout
    ? new Date(tournament.lock_time_knockout).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    : null;

  return (
    <Box sx={{ maxWidth: 1600, mx: 'auto', px: 2, py: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Button component={Link} href="/bracket" startIcon={<ArrowBackIcon />} size="small" className="no-print">
          Groups
        </Button>
        <Typography variant="h4" fontWeight="bold" sx={{ flex: 1 }}>
          Knockout Predictions
        </Typography>
        {hasKnockoutBracket && <PrintExportButtons targetRef={printRef} filename="knockout-bracket" />}
      </Box>

      {!hasKnockoutBracket && (
        <Alert severity="info" sx={{ my: 2 }}>
          The knockout bracket will be available after the group stage ends
          {lockDate ? ` on ${lockDate}` : ''}. Come back then to fill out your picks!
        </Alert>
      )}

      {hasKnockoutBracket && tournament.lock_time_knockout && (
        <CountdownTimer targetDate={tournament.lock_time_knockout} label="Knockout picks lock in" />
      )}

      {!user && (
        <Alert severity="info" sx={{ my: 2 }}>
          Log in to make your knockout predictions.
        </Alert>
      )}

      {lockedGroup && (
        <Alert severity="warning" icon={<LockIcon />} sx={{ my: 2 }}>
          Submissions locked by group admin ({lockedGroup})
        </Alert>
      )}

      {error && <Alert severity="error" sx={{ my: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ my: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      {hasKnockoutBracket && <ScoringRulesSummary mode="knockout" />}

      {hasKnockoutBracket && Object.keys(picks).length > 0 && (
        <Box sx={{ mb: 2, maxWidth: 500 }}>
          <MiniBracket matchups={effectiveMatchups} picks={picks} countryCodeMap={countryCodeMap} results={results?.knockout} />
        </Box>
      )}

      {hasKnockoutBracket && !disabled && (
        <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">Autofill:</Typography>
          <AutofillButtons onAutofill={handleAutofill} disabled={disabled} />
          <Button variant="outlined" startIcon={<TouchAppIcon />} onClick={() => setSimpleMode(true)}>
            Fill Step-by-Step
          </Button>
        </Box>
      )}

      <Box ref={printRef} sx={!hasKnockoutBracket ? { opacity: 0.4, pointerEvents: 'none' } : undefined}>
        {isMobile ? (
          <MobileBracket
            matchups={effectiveMatchups}
            picks={picks}
            onPick={disabled || !hasKnockoutBracket ? undefined : handlePick}
            readOnly={disabled || !hasKnockoutBracket}
            results={results?.knockout}
            countryCodeMap={countryCodeMap}
          />
        ) : (
          <KnockoutBracket
            matchups={effectiveMatchups}
            picks={picks}
            onPick={disabled || !hasKnockoutBracket ? undefined : handlePick}
            readOnly={disabled || !hasKnockoutBracket}
            results={results?.knockout}
            countryCodeMap={countryCodeMap}
          />
        )}
      </Box>

      {hasKnockoutBracket && (
        <Box className="no-print" sx={{ display: 'flex', alignItems: 'center', gap: 3, mt: 3, flexWrap: 'wrap' }}>
          <TextField
            label="Tiebreaker: Total goals in Final"
            type="number"
            value={tiebreaker}
            onChange={(e) => setTiebreaker(e.target.value)}
            disabled={disabled}
            size="small"
            slotProps={{ htmlInput: { min: 0 } }}
            sx={{ width: 280 }}
          />
          <AutosaveIndicator status={autosaveStatus} />
          <Button
            variant="outlined"
            size="small"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={disabled || saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </Box>
      )}

      {hasKnockoutBracket && !disabled && (
        <SimpleKnockoutMode
          open={simpleMode}
          onClose={(newPicks, newTiebreaker) => {
            setPicks(newPicks);
            setTiebreaker(newTiebreaker);
            setSimpleMode(false);
          }}
          matchups={matchups}
          initialPicks={picks}
          initialTiebreaker={tiebreaker}
          countryCodeMap={countryCodeMap}
          teamRankings={teamRankingsMap}
        />
      )}
    </Box>
  );
}
