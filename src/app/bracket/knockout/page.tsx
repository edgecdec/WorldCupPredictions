'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Button, Typography, Alert, CircularProgress, TextField, useMediaQuery, useTheme } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Link from 'next/link';
import KnockoutBracket from '@/components/bracket/KnockoutBracket';
import MobileBracket from '@/components/bracket/MobileBracket';
import CountdownTimer from '@/components/common/CountdownTimer';
import { useAuth } from '@/hooks/useAuth';
import { cascadeClear } from '@/lib/bracketUtils';
import type { Tournament, TournamentResults, KnockoutMatchup } from '@/types';
import PrintExportButtons from '@/components/common/PrintExportButtons';

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
        }
      } catch {
        setError('Failed to load data');
      } finally {
        setLoading(false);
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

  const results = tournament?.results_data as TournamentResults | undefined;
  const hasGroupResults = Boolean(results?.groupStage);
  const hasKnockoutBracket = matchups.length > 0;

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const isLocked = Boolean(
    tournament?.lock_time_knockout && new Date() > new Date(tournament.lock_time_knockout),
  );
  const disabled = !user || isLocked;

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

  if (!hasGroupResults || !hasKnockoutBracket) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h5" gutterBottom>Knockout Bracket</Typography>
        <Alert severity="info" sx={{ maxWidth: 500, mx: 'auto' }}>
          Group stage results have not been entered yet. The knockout bracket will be available once the admin enters group stage results.
        </Alert>
        <Button component={Link} href="/bracket" startIcon={<ArrowBackIcon />} sx={{ mt: 2 }}>
          Back to Group Predictions
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1600, mx: 'auto', px: 2, py: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Button component={Link} href="/bracket" startIcon={<ArrowBackIcon />} size="small" className="no-print">
          Groups
        </Button>
        <Typography variant="h4" fontWeight="bold" sx={{ flex: 1 }}>
          Knockout Predictions
        </Typography>
        <PrintExportButtons targetRef={printRef} filename="knockout-bracket" />
      </Box>

      {tournament.lock_time_knockout && (
        <CountdownTimer targetDate={tournament.lock_time_knockout} label="Knockout picks lock in" />
      )}

      {!user && (
        <Alert severity="info" sx={{ my: 2 }}>
          Log in to make your knockout predictions.
        </Alert>
      )}

      {error && <Alert severity="error" sx={{ my: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ my: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <Box ref={printRef}>
        {isMobile ? (
          <MobileBracket
            matchups={matchups}
            picks={picks}
            onPick={disabled ? undefined : handlePick}
            readOnly={disabled}
            results={results?.knockout}
          />
        ) : (
          <KnockoutBracket
            matchups={matchups}
            picks={picks}
            onPick={disabled ? undefined : handlePick}
            readOnly={disabled}
            results={results?.knockout}
          />
        )}
      </Box>

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
        <Button
          variant="contained"
          size="large"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={disabled || saving}
        >
          {saving ? 'Saving…' : 'Save Knockout Picks'}
        </Button>
      </Box>
    </Box>
  );
}
