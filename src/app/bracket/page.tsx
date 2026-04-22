'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Box, Button, Typography, Alert, CircularProgress, TextField, IconButton, Tooltip, Snackbar, Tabs, Tab } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ShareIcon from '@mui/icons-material/Share';
import LockIcon from '@mui/icons-material/Lock';
import Link from 'next/link';
import GroupPrediction from '@/components/bracket/GroupPrediction';
import ThirdPlacePicker, { type ThirdPlaceTeamDetail } from '@/components/bracket/ThirdPlacePicker';
import GroupStandings from '@/components/bracket/GroupStandings';
import CountdownTimer from '@/components/common/CountdownTimer';
import { useAuth } from '@/hooks/useAuth';
import type { Tournament, BracketData, TournamentResults, GroupPrediction as GroupPredictionType } from '@/types';
import PrintExportButtons from '@/components/common/PrintExportButtons';
import AutofillButtons, { AutofillStrategy } from '@/components/common/AutofillButtons';
import SimpleMode from '@/components/bracket/SimpleMode';
import TouchAppIcon from '@mui/icons-material/TouchApp';
import { chalkGroups, randomGroups, smartGroups, chalkThirdPlace, randomThirdPlace, smartThirdPlace } from '@/lib/autofill';
import ScoringRulesSummary from '@/components/common/ScoringRulesSummary';
import OnboardingGuide, { ONBOARDING_STORAGE_KEY } from '@/components/common/OnboardingGuide';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

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
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [simpleMode, setSimpleMode] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [lockedGroup, setLockedGroup] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('help') === '1' || !localStorage.getItem(ONBOARDING_STORAGE_KEY)) {
      setShowOnboarding(true);
    }
  }, []);

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
          if (pData.locked_group) setLockedGroup(pData.locked_group);
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

  const handleAutofill = useCallback((strategy: AutofillStrategy) => {
    if (!bracketData) return;
    const fillFn = strategy === 'chalk' ? chalkGroups : strategy === 'random' ? randomGroups : smartGroups;
    const thirdFn = strategy === 'chalk' ? chalkThirdPlace : strategy === 'random' ? randomThirdPlace : smartThirdPlace;
    const newOrders = fillFn(bracketData);
    setGroupOrders((prev) => {
      const merged = { ...prev };
      for (const [name, order] of Object.entries(newOrders)) {
        merged[name] = order;
      }
      return merged;
    });
    setThirdPlacePicks(thirdFn(bracketData, newOrders));
  }, [bracketData]);

  const thirdPlaceTeams = useMemo(() => {
    if (!bracketData) return [];
    return bracketData.groups.map((g) => {
      const order = groupOrders[g.name];
      return order ? order[2] : g.teams[2].name;
    });
  }, [bracketData, groupOrders]);

  const countryCodeMap = useMemo(() => {
    if (!bracketData) return {};
    const map: Record<string, string> = {};
    for (const g of bracketData.groups) {
      for (const t of g.teams) {
        if (t.countryCode) map[t.name] = t.countryCode;
      }
    }
    return map;
  }, [bracketData]);

  const thirdPlaceTeamDetails = useMemo(() => {
    if (!bracketData) return {};
    const details: Record<string, ThirdPlaceTeamDetail> = {};
    for (const g of bracketData.groups) {
      for (const t of g.teams) {
        details[t.name] = { countryCode: t.countryCode, pot: t.pot, fifaRanking: t.fifaRanking, groupName: g.name };
      }
    }
    return details;
  }, [bracketData]);

  // Remove stale third-place picks when teams change
  const validThirdPicks = useMemo(
    () => thirdPlacePicks.filter((t) => thirdPlaceTeams.includes(t)),
    [thirdPlacePicks, thirdPlaceTeams],
  );

  const groupStageResults = (tournament?.results_data as TournamentResults | undefined)?.groupStage;
  const groupResultsMap = useMemo(() => {
    if (!groupStageResults?.groupResults) return new Map<string, [string, string, string, string]>();
    return new Map(groupStageResults.groupResults.map((gr) => [gr.groupName, gr.order]));
  }, [groupStageResults]);
  const actualAdvancingThird = groupStageResults?.advancingThirdPlace;

  const isLocked = Boolean(
    tournament?.lock_time_groups && new Date() > new Date(tournament.lock_time_groups),
  );
  const tournamentStarted = isLocked;
  const disabled = !user || isLocked || !!lockedGroup;

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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="h4" fontWeight="bold" sx={{ flex: 1 }}>
          Group Stage Predictions
        </Typography>
        <Tooltip title="How it works">
          <IconButton onClick={() => setShowOnboarding(true)} size="small">
            <HelpOutlineIcon />
          </IconButton>
        </Tooltip>
        <PrintExportButtons targetRef={printRef} filename="group-predictions" />
        {user && (
          <Tooltip title="Share bracket">
            <IconButton onClick={async () => {
              const url = `${window.location.origin}/bracket/${encodeURIComponent(user.username)}`;
              try { await navigator.clipboard.writeText(url); setCopied(true); } catch { /* noop */ }
            }}>
              <ShareIcon />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {tournament.lock_time_groups && (
        <CountdownTimer targetDate={tournament.lock_time_groups} label="Predictions lock in" />
      )}

      {!user && (
        <Alert severity="info" sx={{ my: 2 }}>
          Log in to make your predictions.
        </Alert>
      )}

      {lockedGroup && (
        <Alert severity="warning" icon={<LockIcon />} sx={{ my: 2 }}>
          Submissions locked by group admin ({lockedGroup})
        </Alert>
      )}

      {error && <Alert severity="error" sx={{ my: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ my: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <ScoringRulesSummary mode="group" />

      {tournamentStarted && (
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 2 }}>
          <Tab label="My Predictions" />
          <Tab label="Live Standings" />
        </Tabs>
      )}

      {activeTab === 1 && tournamentStarted ? (
        <GroupStandings groupOrders={groupOrders} countryCodeMap={countryCodeMap} />
      ) : (
        <>
          <TextField
            label="Bracket Name"
            value={bracketName}
            onChange={(e) => setBracketName(e.target.value)}
            disabled={disabled}
            size="small"
            sx={{ mb: 3, maxWidth: 300 }}
            fullWidth
          />

          {!disabled && (
            <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Button variant="outlined" startIcon={<TouchAppIcon />} onClick={() => setSimpleMode(true)}>
                Fill Step-by-Step
              </Button>
              <Typography variant="body2" color="text.secondary">Autofill:</Typography>
              <AutofillButtons onAutofill={handleAutofill} disabled={disabled} />
            </Box>
          )}

          <Box ref={printRef}>
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
                  advancingThirdPlaceTeams={validThirdPicks}
                  actualOrder={groupResultsMap.get(g.name)}
                  actualAdvancingThird={actualAdvancingThird}
                />
              ))}
            </Box>

            <Box sx={{ mb: 4 }}>
              <ThirdPlacePicker
                thirdPlaceTeams={thirdPlaceTeams}
                selected={validThirdPicks}
                onChange={setThirdPlacePicks}
                disabled={disabled}
                countryCodeMap={countryCodeMap}
                teamDetails={thirdPlaceTeamDetails}
              />
            </Box>
          </Box>

          <Box className="no-print" sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
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
        </>
      )}

      <Snackbar open={copied} autoHideDuration={2000} onClose={() => setCopied(false)} message="Link copied!" />

      {bracketData && (
        <SimpleMode
          open={simpleMode}
          onClose={(orders, thirds) => {
            setGroupOrders(orders);
            setThirdPlacePicks(thirds);
            setSimpleMode(false);
          }}
          bracketData={bracketData}
          initialGroupOrders={groupOrders}
          initialThirdPlacePicks={validThirdPicks}
          countryCodeMap={countryCodeMap}
        />
      )}

      <OnboardingGuide open={showOnboarding} onClose={() => setShowOnboarding(false)} />
    </Box>
  );
}
