'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Button, Typography, Alert, CircularProgress, TextField } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import Link from 'next/link';
import GroupPrediction from '@/components/bracket/GroupPrediction';
import ThirdPlacePicker from '@/components/bracket/ThirdPlacePicker';
import CountdownTimer from '@/components/common/CountdownTimer';
import { useAuth } from '@/hooks/useAuth';
import type { Tournament, BracketData, TournamentResults, GroupPrediction as GroupPredictionType } from '@/types';

const REQUIRED_THIRD_PLACE = 8;

export default function BracketPage() {
  const { user, loading: authLoading } = useAuth();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [groupOrders, setGroupOrders] = useState<Record<string, string[]>>({});
  const [thirdPlacePicks, setThirdPlacePicks] = useState<string[]>([]);
  const [bracketName, setBracketName] = useState('My Bracket');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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

        const bd = t.bracket_data as BracketData;
        if (!bd?.groups?.length) {
          setLoading(false);
          return;
        }
        const defaults: Record<string, string[]> = {};
        for (const g of bd.groups) {
          defaults[g.name] = g.teams.map((team) => team.name);
        }

        if (user) {
          const pRes = await fetch('/api/picks');
          const pData = await pRes.json();
          if (pData.ok && pData.prediction) {
            const pred = pData.prediction;
            if (pred.bracket_name) setBracketName(pred.bracket_name);
            if (Array.isArray(pred.group_predictions)) {
              for (const gp of pred.group_predictions as GroupPredictionType[]) {
                if (gp.groupName && Array.isArray(gp.order)) {
                  defaults[gp.groupName] = gp.order;
                }
              }
            }
            if (Array.isArray(pred.third_place_picks)) {
              setThirdPlacePicks(pred.third_place_picks);
            }
          }
        }
        setGroupOrders(defaults);
      } catch {
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    if (!authLoading) load();
  }, [authLoading, user]);

  const handleGroupChange = useCallback((groupName: string, newOrder: string[]) => {
    setGroupOrders((prev) => ({ ...prev, [groupName]: newOrder }));
  }, []);

  const bracketData = tournament?.bracket_data as BracketData | undefined;

  const thirdPlaceTeams = useMemo(() => {
    if (!bracketData) return [];
    return bracketData.groups.map((g) => {
      const order = groupOrders[g.name];
      return order ? order[2] : g.teams[2].name;
    });
  }, [bracketData, groupOrders]);

  // Remove stale third-place picks when teams change
  const validThirdPicks = useMemo(
    () => thirdPlacePicks.filter((t) => thirdPlaceTeams.includes(t)),
    [thirdPlacePicks, thirdPlaceTeams],
  );

  const isLocked = Boolean(
    tournament?.lock_time_groups && new Date() > new Date(tournament.lock_time_groups),
  );
  const disabled = !user || isLocked;

  const handleSave = async () => {
    if (!bracketData || disabled) return;
    if (validThirdPicks.length !== REQUIRED_THIRD_PLACE) {
      setError(`Select exactly ${REQUIRED_THIRD_PLACE} advancing 3rd-place teams`);
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const groupPredictions: GroupPredictionType[] = bracketData.groups.map((g) => ({
        groupName: g.name,
        order: (groupOrders[g.name] || g.teams.map((t) => t.name)) as [string, string, string, string],
      }));
      const res = await fetch('/api/picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_groups',
          bracket_name: bracketName,
          group_predictions: groupPredictions,
          third_place_picks: validThirdPicks,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSuccess('Predictions saved!');
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

  if (!tournament || !bracketData) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography color="text.secondary">No tournament available yet.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', px: 2, py: 3 }}>
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        Group Stage Predictions
      </Typography>

      {tournament.lock_time_groups && (
        <CountdownTimer targetDate={tournament.lock_time_groups} label="Predictions lock in" />
      )}

      {!user && (
        <Alert severity="info" sx={{ my: 2 }}>
          Log in to make your predictions.
        </Alert>
      )}

      {error && <Alert severity="error" sx={{ my: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ my: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <TextField
        label="Bracket Name"
        value={bracketName}
        onChange={(e) => setBracketName(e.target.value)}
        disabled={disabled}
        size="small"
        sx={{ mb: 3, maxWidth: 300 }}
        fullWidth
      />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' },
          gap: 2,
          mb: 4,
        }}
      >
        {bracketData.groups.map((g) => (
          <GroupPrediction
            key={g.name}
            groupName={g.name}
            teams={g.teams}
            order={groupOrders[g.name] || g.teams.map((t) => t.name)}
            onChange={handleGroupChange}
            disabled={disabled}
          />
        ))}
      </Box>

      <Box sx={{ mb: 4 }}>
        <ThirdPlacePicker
          thirdPlaceTeams={thirdPlaceTeams}
          selected={validThirdPicks}
          onChange={setThirdPlacePicks}
          disabled={disabled}
        />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          size="large"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={disabled || saving}
        >
          {saving ? 'Saving…' : 'Save Predictions'}
        </Button>

        {Boolean((tournament.results_data as TournamentResults)?.knockoutBracket) && (
          <Button
            component={Link}
            href="/bracket/knockout"
            variant="outlined"
            size="large"
            endIcon={<ArrowForwardIcon />}
          >
            Knockout Bracket
          </Button>
        )}
      </Box>
    </Box>
  );
}
