'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Box, Button, Typography, Alert, CircularProgress, TextField, IconButton, Tooltip, Snackbar, Tabs, Tab, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ShareIcon from '@mui/icons-material/Share';
import LockIcon from '@mui/icons-material/Lock';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import Link from 'next/link';
import GroupPrediction from '@/components/bracket/GroupPrediction';
import ThirdPlacePicker, { type ThirdPlaceTeamDetail } from '@/components/bracket/ThirdPlacePicker';
import GroupStandings from '@/components/bracket/GroupStandings';
import ForecastBracket from '@/components/bracket/ForecastBracket';
import type { BracketSlotResult } from '@/hooks/useTournamentSim';
import CountdownTimer from '@/components/common/CountdownTimer';
import { useAuth } from '@/hooks/useAuth';
import { useGroupOnlySim } from '@/hooks/useGroupOnlySim';
import { useLiveScores } from '@/hooks/useLiveScores';
import { GROUPS, type ActualResults, type InProgressGroupMatch } from '@/hooks/useTournamentSim';
import { sampleLiveScores } from '@/lib/matchOdds';
import type { Tournament, BracketData, TournamentResults, GroupPrediction as GroupPredictionType } from '@/types';
import PrintExportButtons from '@/components/common/PrintExportButtons';
import AutofillButtons, { AutofillStrategy } from '@/components/common/AutofillButtons';
import SimpleMode from '@/components/bracket/SimpleMode';
import TouchAppIcon from '@mui/icons-material/TouchApp';
import { chalkGroups, randomGroups, smartGroups, chalkThirdPlace, randomThirdPlace, smartThirdPlace } from '@/lib/autofill';
import ScoringRulesSummary from '@/components/common/ScoringRulesSummary';
import OnboardingGuide, { ONBOARDING_STORAGE_KEY } from '@/components/common/OnboardingGuide';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useAutosave } from '@/hooks/useAutosave';
import AutosaveIndicator from '@/components/common/AutosaveIndicator';

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
  const [dataLoaded, setDataLoaded] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
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
        setDataLoaded(true);
      }
    }
    if (!authLoading) load();
  }, [authLoading, user]);

  const handleGroupChange = useCallback((groupName: string, newOrder: string[]) => {
    setGroupOrders((prev) => {
      const oldOrder = prev[groupName];
      const oldThird = oldOrder?.[2];
      const newThird = newOrder[2];
      if (oldThird && newThird && oldThird !== newThird) {
        setThirdPlacePicks((picks) => {
          if (!picks.includes(oldThird)) return picks;
          return picks.map((t) => (t === oldThird ? newThird : t));
        });
      }
      return { ...prev, [groupName]: newOrder };
    });
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

  const autosaveDataJson = useMemo(
    () => JSON.stringify({ groupOrders, thirdPlacePicks: validThirdPicks, bracketName }),
    [groupOrders, validThirdPicks, bracketName],
  );

  const doSave = useCallback(async (): Promise<boolean> => {
    if (!bracketData) return false;
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
    return res.ok;
  }, [bracketData, groupOrders, bracketName, validThirdPicks]);

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
          {user?.is_admin && <Tab label="Knockout Bracket" />}
        </Tabs>
      )}

      {activeTab === 1 && tournamentStarted ? (
        <GroupStandings groupOrders={groupOrders} countryCodeMap={countryCodeMap} />
      ) : activeTab === 2 && tournamentStarted && user?.is_admin ? (
        <KnockoutBracketTab countryCodeMap={countryCodeMap} tournament={tournament} />
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
              <Button
                variant="outlined"
                color="error"
                size="small"
                startIcon={<RestartAltIcon />}
                onClick={() => setConfirmClear(true)}
              >
                Clear All
              </Button>
            </Box>
          )}

          <Dialog open={confirmClear} onClose={() => setConfirmClear(false)}>
            <DialogTitle>Clear All Group Predictions?</DialogTitle>
            <DialogContent>
              <DialogContentText>
                This will reset all group orders to default and clear your third-place picks. This action cannot be undone.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirmClear(false)}>Cancel</Button>
              <Button color="error" onClick={() => {
                if (bracketData) {
                  const defaults: Record<string, string[]> = {};
                  for (const g of bracketData.groups) {
                    defaults[g.name] = g.teams.map((t) => t.name);
                  }
                  setGroupOrders(defaults);
                }
                setThirdPlacePicks([]);
                setConfirmClear(false);
              }}>
                Clear All
              </Button>
            </DialogActions>
          </Dialog>

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

/**
 * Admin preview of the R32 knockout bracket. Runs the worker's groupOnly
 * Monte Carlo locally (incorporating completed + in-progress group games)
 * and renders each R32 slot with the most-likely team and chip strip of
 * remaining possibilities.
 *
 * Self-contained so the main BracketPage doesn't need to re-derive
 * actualResults / sim wiring when the tab isn't active.
 */
function KnockoutBracketTab({
  countryCodeMap, tournament,
}: {
  countryCodeMap: Record<string, string>;
  tournament: Tournament | null;
}) {
  // Live scores for in-progress group games — same pattern leaderboard uses.
  const { games: liveGames } = useLiveScores(true);

  // Team → group lookup for bucketing live games.
  const teamToGroup = useMemo(() => {
    const m: Record<string, string> = {};
    for (const [g, teams] of Object.entries(GROUPS)) for (const t of teams) m[t] = g;
    return m;
  }, []);

  const actualResults = useMemo<ActualResults | undefined>(() => {
    if (!tournament) return undefined;
    const rd = tournament.results_data as TournamentResults & {
      groupMatches?: Record<string, Array<{ teamA: string; teamB: string; scoreA: number; scoreB: number }>>;
    } | null;
    const groupMatches: Record<string, Array<{ teamA: string; teamB: string; scoreA: number; scoreB: number }>> = {};
    for (const [g, arr] of Object.entries(rd?.groupMatches ?? {})) groupMatches[g] = [...arr];
    // Merge ESPN state='post' games we haven't synced yet.
    for (const game of liveGames) {
      if (game.state !== 'post') continue;
      if ((game.stage ?? 'group') !== 'group') continue;
      const gn = teamToGroup[game.home?.name];
      if (!gn || teamToGroup[game.away?.name] !== gn) continue;
      const dup = (groupMatches[gn] ?? []).some((m) =>
        (m.teamA === game.home.name && m.teamB === game.away.name) ||
        (m.teamA === game.away.name && m.teamB === game.home.name));
      if (dup) continue;
      const sA = parseInt(game.home.score, 10) || 0;
      const sB = parseInt(game.away.score, 10) || 0;
      (groupMatches[gn] ??= []).push({ teamA: game.home.name, teamB: game.away.name, scoreA: sA, scoreB: sB });
    }
    // In-progress games: pre-sample final scorelines so the worker preserves
    // joint distributions across iterations.
    const inProgressGroupMatches: Record<string, InProgressGroupMatch[]> = {};
    for (const game of liveGames) {
      if (game.state !== 'in') continue;
      if ((game.stage ?? 'group') !== 'group') continue;
      const gn = teamToGroup[game.home?.name];
      if (!gn || teamToGroup[game.away?.name] !== gn) continue;
      const parsed = parseMinutes(game.clock, game.period);
      if (parsed === null) continue;
      const sA = parseInt(game.home.score, 10) || 0;
      const sB = parseInt(game.away.score, 10) || 0;
      const samples = sampleLiveScores(game.home.name, game.away.name, sA, sB, parsed, 1000, { stage: 'group' });
      if (!samples) continue;
      (inProgressGroupMatches[gn] ??= []).push({
        teamA: game.home.name, teamB: game.away.name, sampledScores: samples,
      });
    }
    return {
      groupMatches: Object.keys(groupMatches).length > 0 ? groupMatches : undefined,
      inProgressGroupMatches: Object.keys(inProgressGroupMatches).length > 0 ? inProgressGroupMatches : undefined,
      finalGroupStandings: (rd as TournamentResults | null)?.groupStage
        ? Object.fromEntries((rd as TournamentResults).groupStage!.groupResults.map((gr) => [gr.groupName, gr.order]))
        : undefined,
      finalAdvancing3rd: (rd as TournamentResults | null)?.groupStage?.advancingThirdPlace,
    };
  }, [tournament, liveGames, teamToGroup]);

  const { results, running, simsCompleted, numSims } = useGroupOnlySim(actualResults);

  // Adapt the worker's r32SlotDistributions (fractions) into the
  // BracketSlotResult[] shape ForecastBracket expects (raw counts + numSims
  // denominator). Also derive every upstream slot (R32-N-W, R16, QF, SF,
  // 3RD, FINAL) by walking the FIFA feeder graph and unioning the candidate
  // teams from both feeder slots — for the preview this answers "who could
  // possibly be here", which is the right thing to show until users start
  // picking. Once the picker is wired, R16+ will be replaced by whatever
  // feeder slot the user chose.
  const bracketSlots = useMemo<BracketSlotResult[]>(() => {
    const dists = results?.r32SlotDistributions;
    if (!dists) return [];
    const denominator = simsCompleted || numSims;
    // We work in fractional space (0..1) for the rollup, then convert to
    // counts at the end so ForecastBracket can divide by numSims for %.
    const slot: Record<string, Record<string, number>> = {};
    for (const [id, d] of Object.entries(dists)) slot[id] = { ...d };
    // R32 winners = union of the two sides (either side could win/advance).
    for (let i = 1; i <= 16; i++) {
      slot[`R32-${i}-W`] = unionDist(slot[`R32-${i}-A`], slot[`R32-${i}-B`]);
    }
    // R16 / QF / SF / 3RD / FINAL: walk the FIFA feeder map. Each slot side
    // inherits its feeder's winner-distribution, and -W is the union of A/B.
    const buildLayer = (matchIds: string[]) => {
      for (const id of matchIds) {
        const f = getFeederIds(id);
        if (!f) continue;
        slot[`${id}-A`] = { ...(slot[`${f[0]}-W`] ?? {}) };
        slot[`${id}-B`] = { ...(slot[`${f[1]}-W`] ?? {}) };
        slot[`${id}-W`] = unionDist(slot[`${id}-A`], slot[`${id}-B`]);
      }
    };
    buildLayer(Array.from({ length: 8 }, (_, i) => `R16-${i + 1}`));
    buildLayer(Array.from({ length: 4 }, (_, i) => `QF-${i + 1}`));
    buildLayer(['SF-1', 'SF-2']);
    buildLayer(['FINAL', '3RD']);
    // Build BracketSlotResult[] in count-form.
    const out: BracketSlotResult[] = [];
    for (const [slotId, dist] of Object.entries(slot)) {
      const teams = Object.entries(dist)
        .map(([team, pct]) => ({ team, count: Math.round(pct * denominator) }))
        .filter((t) => t.count > 0)
        .sort((a, b) => b.count - a.count);
      out.push({ slotId, round: slotId.split('-')[0], teams });
    }
    return out;
  }, [results, simsCompleted, numSims]);

  return (
    <Box>
      {running && !results && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Simulating remaining group games…
          </Typography>
        </Box>
      )}
      <ForecastBracket
        bracketSlots={bracketSlots}
        numSims={simsCompleted || numSims}
        countryCodeMap={countryCodeMap}
      />
    </Box>
  );
}

/** Union two slot probability distributions. A team can show up in either
 *  feeder slot of a future match; its chance of being in the future slot is
 *  the sum (capped at 1.0 to absorb float fuzz). */
function unionDist(a?: Record<string, number>, b?: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [t, p] of Object.entries(a ?? {})) out[t] = p;
  for (const [t, p] of Object.entries(b ?? {})) out[t] = (out[t] ?? 0) + p;
  for (const t of Object.keys(out)) if (out[t] > 1) out[t] = 1;
  return out;
}

/** FIFA feeder graph for the upstream rounds. Indices are 0-based; matchId
 *  format is the same as throughout the app. */
function getFeederIds(matchId: string): [string, string] | null {
  // R16: per FIFA's official bracket (non-sequential).
  if (matchId.startsWith('R16-')) {
    const i = parseInt(matchId.slice(4), 10) - 1;
    const FEEDS: Array<[number, number]> = [[1, 4], [0, 2], [3, 5], [6, 7], [10, 11], [8, 9], [13, 15], [12, 14]];
    const [a, b] = FEEDS[i];
    return [`R32-${a + 1}`, `R32-${b + 1}`];
  }
  if (matchId.startsWith('QF-')) {
    const i = parseInt(matchId.slice(3), 10) - 1;
    const FEEDS: Array<[number, number]> = [[0, 1], [4, 5], [2, 3], [6, 7]];
    const [a, b] = FEEDS[i];
    return [`R16-${a + 1}`, `R16-${b + 1}`];
  }
  if (matchId.startsWith('SF-')) {
    const i = parseInt(matchId.slice(3), 10) - 1;
    const FEEDS: Array<[number, number]> = [[0, 1], [2, 3]];
    const [a, b] = FEEDS[i];
    return [`QF-${a + 1}`, `QF-${b + 1}`];
  }
  if (matchId === 'FINAL' || matchId === '3RD') return ['SF-1', 'SF-2'];
  return null;
}

/** Local clock parser, lifted from LiveScores. ESPN sometimes wraps the
 *  stoppage minute with an apostrophe ("90'+6'") — strip them all. */
function parseMinutes(clock: string, period: number): number | null {
  const c = (clock || '').trim().replace(/'/g, '');
  if (!c) return period === 1 ? 1 : period === 2 ? 46 : null;
  const m = c.match(/^(\d+)(?:\+(\d+))?$/);
  if (m) return parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) : 0);
  if (/^ht$/i.test(c)) return 45;
  if (/^ft$/i.test(c)) return 90;
  return null;
}
