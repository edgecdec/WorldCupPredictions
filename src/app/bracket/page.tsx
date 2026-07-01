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
import KnockoutBracket from '@/components/bracket/KnockoutBracket';
import MobileBracket from '@/components/bracket/MobileBracket';
import { computeEffectiveMatchups } from '@/lib/bracketUtils';
import { useMediaQuery, useTheme } from '@mui/material';
import type { BracketSlotResult } from '@/hooks/useTournamentSim';
import CountdownTimer from '@/components/common/CountdownTimer';
import { useAuth } from '@/hooks/useAuth';
import { useGroupOnlySim } from '@/hooks/useGroupOnlySim';
import { useLiveScores } from '@/hooks/useLiveScores';
import { GROUPS, type ActualResults, type InProgressGroupMatch } from '@/hooks/useTournamentSim';
import { sampleLiveScores, computeMatchOdds } from '@/lib/matchOdds';
import TeamFlag from '@/components/common/TeamFlag';
import { parseEspnClock } from '@/lib/parseEspnClock';
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
          Predictions
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

      {/* Countdown switches based on which deadline is next:
          - pre-group-lock: count down to group lock
          - post-group-lock & pre-knockout-lock: count down to knockout lock
          - post-knockout-lock: nothing (everything's locked) */}
      {tournament.lock_time_groups && !isLocked && (
        <CountdownTimer targetDate={tournament.lock_time_groups} label="Group predictions lock in" />
      )}
      {isLocked && tournament.lock_time_knockout && new Date() < new Date(tournament.lock_time_knockout) && (
        <CountdownTimer targetDate={tournament.lock_time_knockout} label="Knockout bracket locks in" />
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

      {/* Show the relevant rules for the active tab. Knockout tab → knockout
          rules; the other tabs (My Predictions, Live Standings) → group rules. */}
      <ScoringRulesSummary mode={activeTab === 0 && tournamentStarted ? 'knockout' : 'group'} />

      {tournamentStarted && (
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 2 }}>
          {/* Knockout first since group picks are already locked once group
              stage starts. Knockout picks remain editable server-side until
              lock_time_knockout passes. */}
          <Tab label="Knockout" />
          <Tab label="Group" />
          <Tab label="Live Standings" />
        </Tabs>
      )}

      {activeTab === 0 && tournamentStarted ? (
        <KnockoutBracketTab countryCodeMap={countryCodeMap} tournament={tournament} />
      ) : activeTab === 2 && tournamentStarted ? (
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

  const bracketData = tournament?.bracket_data as BracketData | undefined;

  // team name → FIFA ranking, used by the autofill chalk strategy.
  const teamRankings = useMemo(() => {
    const m: Record<string, number> = {};
    if (!bracketData) return m;
    for (const g of bracketData.groups) {
      for (const t of g.teams) m[t.name] = t.fifaRanking ?? 9999;
    }
    return m;
  }, [bracketData]);

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
      const parsed = parseEspnClock(game.clock, game.period);
      if (parsed === null) continue;
      const sA = parseInt(game.home.score, 10) || 0;
      const sB = parseInt(game.away.score, 10) || 0;
      const samples = sampleLiveScores(game.home.name, game.away.name, sA, sB, parsed, 1000, { stage: 'group' });
      if (!samples) continue;
      (inProgressGroupMatches[gn] ??= []).push({
        teamA: game.home.name, teamB: game.away.name, sampledScores: samples,
        currentScoreA: sA, currentScoreB: sB, minutesPlayed: parsed,
      });
    }
    // Only treat groupStage as "final" when all 12 groups + 8 advancing
    // 3rd-place teams are present. A partial groupStage feeds the worker
    // via groupMatches (per-match scorelines) instead.
    const TOTAL_GROUPS = 12;
    const gs = (rd as TournamentResults | null)?.groupStage;
    const isFullGroupStage = (gs?.groupResults.length ?? 0) === TOTAL_GROUPS
      && (gs?.advancingThirdPlace?.length ?? 0) === 8;
    return {
      groupMatches: Object.keys(groupMatches).length > 0 ? groupMatches : undefined,
      inProgressGroupMatches: Object.keys(inProgressGroupMatches).length > 0 ? inProgressGroupMatches : undefined,
      finalGroupStandings: isFullGroupStage
        ? Object.fromEntries(gs!.groupResults.map((gr) => [gr.groupName, gr.order]))
        : undefined,
      finalAdvancing3rd: isFullGroupStage ? gs!.advancingThirdPlace : undefined,
    };
  }, [tournament, liveGames, teamToGroup]);

  const { results, running, simsCompleted, numSims } = useGroupOnlySim(actualResults);

  // Build R32-only BracketSlotResult[] from the worker's fractions. R16+
  // slots stay empty (TBD) so ForecastBracket renders them as the user's
  // pick targets, with pickContent supplying the lineage-resolved team name.
  const bracketSlots = useMemo<BracketSlotResult[]>(() => {
    const dists = results?.r32SlotDistributions;
    if (!dists) return [];
    const denominator = simsCompleted || numSims;
    const out: BracketSlotResult[] = [];
    for (const [slotId, dist] of Object.entries(dists)) {
      const teams = Object.entries(dist)
        .map(([team, pct]) => ({ team, count: Math.round(pct * denominator) }))
        .filter((t) => t.count > 0)
        .sort((a, b) => b.count - a.count);
      out.push({ slotId, round: 'R32', teams });
    }
    return out;
  }, [results, simsCompleted, numSims]);

  // User's picks: matchId -> winning TEAM NAME (e.g. 'Canada'). Storing
  // team names directly is what scoring.ts expects and what the post-lock
  // migration normalized everyone to.
  const [picks, setPicks] = useState<Record<string, string>>({});

  // Populated R32 bracket (matchId -> {teamA, teamB}) from results_data.
  // The picker reads from here to know which two teams to show in each R32
  // cell. R16+ teams are derived from picks[feederMatch].
  const r32TeamsByMatch = useMemo<Record<string, { teamA: string | null; teamB: string | null }>>(() => {
    const out: Record<string, { teamA: string | null; teamB: string | null }> = {};
    const ko = (tournament?.results_data as TournamentResults | undefined)?.knockoutBracket;
    if (!ko) return out;
    for (const m of ko) {
      if (m.id.startsWith('R32-')) {
        out[m.id] = { teamA: m.teamA ?? null, teamB: m.teamB ?? null };
      }
    }
    return out;
  }, [tournament]);
  const [picksLoaded, setPicksLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  // Load the user's saved knockout picks once on mount so the bracket
  // hydrates with what's in the DB. Without this, the page rendered an
  // empty bracket every visit — making save look like it didn't work.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/picks').then((r) => r.json()).then((data) => {
      if (cancelled) return;
      const ko = data?.prediction?.knockout_picks;
      if (ko && typeof ko === 'object') setPicks(ko as Record<string, string>);
      setPicksLoaded(true);
    }).catch(() => { setPicksLoaded(true); /* still flip so autosave engages */ });
    return () => { cancelled = true; };
  }, []);

  // Once picks are loaded from the server, treat that as the autosave
  // baseline so we don't immediately resave the same payload.
  useEffect(() => {
    if (picksLoaded) markSaved(picksJson);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picksLoaded]);

  // Lead team name for any slot reference. Two formats flow through here:
  //   - Slot token 'R32-N-A/B' (pre-lock) → resolve via r32SlotDistributions
  //   - Team name (post-lock, after knockout migration) → pass through
  const teamForSlot = useCallback((slotRef: string): string | null => {
    if (!/^R32-\d+-[AB]$/.test(slotRef)) return slotRef; // already a team name
    const dists = results?.r32SlotDistributions ?? {};
    const d = dists[slotRef];
    if (!d) return null;
    let best: string | null = null;
    let bestP = -1;
    for (const [t, p] of Object.entries(d)) if (p > bestP) { best = t; bestP = p; }
    return best;
  }, [results]);

  // What slot token is on a given side of a given match? At R32: the slot id
  // ('R32-3-A'). At R16+: whichever slot token the user picked at the feeder
  // match. If the feeder isn't picked yet → null (cell shows TBD).
  //
  // Special case: the 3rd-place playoff is fed by the LOSERS of the two SFs,
  // not the winners. picks[SF-N] is the SF winner, so the loser is the OTHER
  // candidate at SF-N — i.e. the one of SF-N's feeders (QF picks) that the
  // user didn't pick as the SF winner.
  // Returns the TEAM NAME on the given side of this match given current
  // picks. R32 reads from results_data.knockoutBracket; R16+ pulls from the
  // feeder match's pick (already a team name). 3RD's sides are the SF losers.
  const slotForSide = useCallback((matchId: string, side: 'A' | 'B'): string | null => {
    if (matchId.startsWith('R32-')) {
      const r32 = r32TeamsByMatch[matchId];
      if (!r32) return null;
      return side === 'A' ? (r32.teamA ?? null) : (r32.teamB ?? null);
    }

    if (matchId === '3RD') {
      const sfMatch = side === 'A' ? 'SF-1' : 'SF-2';
      const sfPick = picks[sfMatch];
      if (!sfPick) return null;
      const sfFeeders = getFeederIds(sfMatch);
      if (!sfFeeders) return null;
      const candA = picks[sfFeeders[0]];
      const candB = picks[sfFeeders[1]];
      if (candA && candA !== sfPick) return candA;
      if (candB && candB !== sfPick) return candB;
      return null;
    }

    const feeders = getFeederIds(matchId);
    if (!feeders) return null;
    const feederMatch = feeders[side === 'A' ? 0 : 1];
    return picks[feederMatch] ?? null;
  }, [picks, r32TeamsByMatch]);

  const handlePick = useCallback((matchId: string, team: string) => {
    setPicks((prev) => {
      const next = { ...prev };
      // Click the same side again to unpick. Downstream picks that referenced
      // this match's winner become orphans and get cleared in validateDownstream.
      if (next[matchId] === team) {
        delete next[matchId];
      } else {
        next[matchId] = team;
      }
      validateDownstream(matchId, next, r32TeamsByMatch);
      return next;
    });
  }, [r32TeamsByMatch]);

  // "Smart Fill": play out one simulated tournament given the current sim's
  // R32 distributions and the team strength (PELE / FIFA ranking) — and use
  // those winners as the user's picks. Each match is decided via a single
  // Poisson goal sim, so the resulting bracket is plausible but not chalky;
  // running it twice gives a different bracket. Doesn't overwrite user picks
  // that are already in place.
  const handleSmartFill = useCallback(() => {
    setPicks((prev) => {
      const next = { ...prev };
      const winProbability = (teamA: string, teamB: string): number => {
        const odds = computeMatchOdds(teamA, teamB, { stage: 'knockout' });
        if (odds) {
          const draw = odds.draw ?? 0;
          return (odds.winA ?? 0) + draw / 2;
        }
        const rA = teamRankings[teamA] ?? 9999;
        const rB = teamRankings[teamB] ?? 9999;
        return 1 / (1 + Math.pow(10, (rA - rB) / 50));
      };
      const tryFill = (matchId: string) => {
        if (next[matchId]) return; // user already picked it — don't overwrite
        const [aTeam, bTeam] = candidateTeams(matchId, next, r32TeamsByMatch);
        if (!aTeam && !bTeam) return;
        if (!aTeam) { next[matchId] = bTeam!; return; }
        if (!bTeam) { next[matchId] = aTeam; return; }
        const pA = winProbability(aTeam, bTeam);
        next[matchId] = Math.random() < pA ? aTeam : bTeam;
      };
      // Dependency order: R32 → R16 → QF → SF → FINAL → 3RD.
      for (let i = 1; i <= 16; i++) tryFill(`R32-${i}`);
      for (let i = 1; i <= 8; i++) tryFill(`R16-${i}`);
      for (let i = 1; i <= 4; i++) tryFill(`QF-${i}`);
      for (const sf of ['SF-1', 'SF-2']) tryFill(sf);
      tryFill('FINAL');
      tryFill('3RD');
      return next;
    });
  }, [teamRankings, r32TeamsByMatch]);

  // Step-by-step modal: walk the user through every match in dependency
  // order. Shows the two candidate teams for the next unpicked match and
  // advances on click. By the time we get to a later round, its feeder
  // picks are already in place (because we walked R32 first), so the
  // candidate set is well-defined.
  const [stepOpen, setStepOpen] = useState(false);
  const matchOrder = useMemo<string[]>(() => {
    const out: string[] = [];
    for (let i = 1; i <= 16; i++) out.push(`R32-${i}`);
    for (let i = 1; i <= 8; i++) out.push(`R16-${i}`);
    for (let i = 1; i <= 4; i++) out.push(`QF-${i}`);
    out.push('SF-1', 'SF-2', 'FINAL', '3RD');
    return out;
  }, []);
  const nextUnpickedMatch = useMemo<string | null>(() => {
    for (const m of matchOrder) if (!picks[m]) return m;
    return null;
  }, [matchOrder, picks]);

  // Whether knockout picks are still editable (mirrors the server-side
  // gate on /api/picks).
  const knockoutLockTime = tournament?.lock_time_knockout
    ? new Date(tournament.lock_time_knockout)
    : null;
  const knockoutLocked = knockoutLockTime ? new Date() >= knockoutLockTime : false;

  // Autosave: debounced 2s after the last pick change. Saves the current
  // picks map to /api/picks via the same endpoint as the explicit Save
  // button. Disabled when locked or before initial picks have hydrated.
  const picksJson = useMemo(() => JSON.stringify(picks), [picks]);
  const doAutosave = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_knockout', knockout_picks: picks }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, [picks]);
  const { status: autosaveStatus, markSaved } = useAutosave({
    dataJson: picksLoaded ? picksJson : '',
    disabled: knockoutLocked || !picksLoaded,
    saveFn: doAutosave,
  });

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      // Picks are already in slot-token form (matchId → 'R32-N-A' etc),
      // which is the API's storage shape. Save as-is; the scoring layer
      // will resolve slot tokens to teams once group stage finalizes.
      const res = await fetch('/api/picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_knockout', knockout_picks: picks }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSaveMsg({ kind: 'success', msg: 'Picks saved.' });
        markSaved(picksJson); // sync autosave baseline so it doesn't refire
      } else {
        setSaveMsg({ kind: 'error', msg: data.error ?? 'Failed to save picks.' });
      }
    } catch {
      setSaveMsg({ kind: 'error', msg: 'Network error.' });
    } finally {
      setSaving(false);
    }
  };

  const r32PickedCount = Object.keys(picks).filter((k) => k.startsWith('R32-')).length;
  const totalPicked = Object.keys(picks).length;
  // 32 matches total: 16 R32 + 8 R16 + 4 QF + 2 SF + FINAL + 3RD.
  const TOTAL_MATCHES = 32;

  // Post-lock, swap the interactive picker for the same read-only correct/
  // incorrect bracket that /bracket/[username] renders — so users see how
  // their picks are performing round-by-round.
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const resultsData = tournament?.results_data as TournamentResults | undefined;
  const knockoutMatchups = resultsData?.knockoutBracket ?? [];
  const knockoutResults = resultsData?.knockout ?? {};
  const effectiveMatchups = useMemo(
    () => knockoutMatchups.length > 0 ? computeEffectiveMatchups(knockoutMatchups, picks) : [],
    [knockoutMatchups, picks],
  );
  // Count correct picks so far so the header can show "N/M correct" instead
  // of "N/32 picked" once we're locked in.
  const correctSoFar = useMemo(() => {
    let n = 0;
    for (const [matchId, winner] of Object.entries(knockoutResults)) {
      if (picks[matchId] === winner) n++;
    }
    return n;
  }, [picks, knockoutResults]);
  const totalCompleted = Object.keys(knockoutResults).length;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="caption" color="text.secondary">
            {knockoutLocked
              ? 'Knockouts are underway — your picks are locked. ✓ = correct so far, ✗ = eliminated.'
              : 'Click a side to pick it. Hover any cell for the full ranked possibility list.'}
            {!knockoutLocked && running && !results ? ' Simulating remaining group games…' : ''}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
            {knockoutLocked
              ? `Picks locked in: ${totalPicked} / ${TOTAL_MATCHES}` + (totalCompleted > 0 ? ` · Correct so far: ${correctSoFar} / ${totalCompleted}` : '')
              : `Picked: ${totalPicked} / ${TOTAL_MATCHES} (${r32PickedCount}/16 R32)`}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {saveMsg && (
            <Typography variant="caption" sx={{ color: saveMsg.kind === 'success' ? 'success.main' : 'error.main' }}>
              {saveMsg.msg}
            </Typography>
          )}
          {!knockoutLocked && <AutosaveIndicator status={autosaveStatus} />}
          {!knockoutLocked && (
            <>
              <Button
                variant="outlined"
                size="small"
                onClick={() => setStepOpen(true)}
                disabled={!results || totalPicked === TOTAL_MATCHES}
                title="Walk through each empty match one at a time"
              >
                Step-by-Step
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={handleSmartFill}
                disabled={!results || totalPicked === TOTAL_MATCHES}
                title="Simulate the tournament once and use those winners as your picks"
              >
                Smart Fill
              </Button>
              <Button
                variant="outlined"
                size="small"
                color="error"
                onClick={() => setConfirmClearOpen(true)}
                disabled={totalPicked === 0}
                title="Clear every knockout pick"
              >
                Clear
              </Button>
              <Button variant="contained" size="small" onClick={handleSave} disabled={saving || totalPicked === 0}>
                {saving ? 'Saving…' : 'Save Picks'}
              </Button>
            </>
          )}
        </Box>
      </Box>
      {knockoutLocked && knockoutMatchups.length > 0 ? (
        isMobile ? (
          <MobileBracket matchups={effectiveMatchups} picks={picks} readOnly results={knockoutResults} countryCodeMap={countryCodeMap} />
        ) : (
          <KnockoutBracket matchups={effectiveMatchups} picks={picks} readOnly results={knockoutResults} countryCodeMap={countryCodeMap} />
        )
      ) : (
        <ForecastBracket
          bracketSlots={bracketSlots}
          numSims={simsCompleted || numSims}
          countryCodeMap={countryCodeMap}
          teamRankings={teamRankings}
          pickMode={{ picks, onPick: handlePick, slotForSide, teamForSlot }}
        />
      )}
      <StepByStepDialog
        open={stepOpen}
        onClose={() => setStepOpen(false)}
        nextMatch={nextUnpickedMatch}
        picks={picks}
        onPick={handlePick}
        r32TeamsByMatch={r32TeamsByMatch}
        countryCodeMap={countryCodeMap}
        teamRankings={teamRankings}
        totalPicked={totalPicked}
        total={TOTAL_MATCHES}
      />
      <Dialog open={confirmClearOpen} onClose={() => setConfirmClearOpen(false)}>
        <DialogTitle>Clear all knockout picks?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will remove all {totalPicked} of your bracket picks. Autosave will
            then persist the empty bracket. You can refill via Smart Fill or
            Step-by-Step afterwards.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClearOpen(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setPicks({});
              setConfirmClearOpen(false);
            }}
          >
            Clear All
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/** Walk-the-user-through-it dialog. Shows the next unpicked match with its
 *  two candidate teams; click one to commit and advance. Auto-closes when
 *  there's no next match. */
function StepByStepDialog({
  open, onClose, nextMatch, picks, onPick, r32TeamsByMatch, countryCodeMap, teamRankings, totalPicked, total,
}: {
  open: boolean;
  onClose: () => void;
  nextMatch: string | null;
  picks: Record<string, string>;
  onPick: (matchId: string, team: string) => void;
  r32TeamsByMatch: Record<string, { teamA: string | null; teamB: string | null }>;
  countryCodeMap: Record<string, string>;
  teamRankings: Record<string, number>;
  totalPicked: number;
  total: number;
}) {
  if (!open) return null;
  const matchId = nextMatch;
  const [aTeam, bTeam] = matchId ? candidateTeams(matchId, picks, r32TeamsByMatch) : [null, null];

  // Friendly label for which round we're on.
  const roundLabel = matchId
    ? matchId.startsWith('R32-') ? `Round of 32 — Match ${matchId.slice(4)}`
    : matchId.startsWith('R16-') ? `Round of 16 — Match ${matchId.slice(4)}`
    : matchId.startsWith('QF-') ? `Quarterfinal ${matchId.slice(3)}`
    : matchId === 'SF-1' ? 'Semifinal 1'
    : matchId === 'SF-2' ? 'Semifinal 2'
    : matchId === 'FINAL' ? '🏆 Final'
    : matchId === '3RD' ? '🥉 3rd Place Match'
    : matchId
    : '';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Step-by-Step
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontWeight: 400 }}>
          {totalPicked} / {total} picks made
        </Typography>
      </DialogTitle>
      <DialogContent>
        {!matchId ? (
          <DialogContentText>All matches picked. Save when ready.</DialogContentText>
        ) : (
          <>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, textAlign: 'center' }}>
              {roundLabel}
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: 'text.secondary', mb: 2 }}>
              Pick who advances:
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'stretch' }}>
              {[
                { team: aTeam, side: 'A' as const },
                { team: bTeam, side: 'B' as const },
              ].map(({ team, side }) => (
                <Button
                  key={side}
                  variant="outlined"
                  fullWidth
                  size="large"
                  disabled={!team}
                  onClick={() => team && onPick(matchId, team)}
                  sx={{ flexDirection: 'column', gap: 1, py: 3 }}
                >
                  {team && countryCodeMap[team] && (
                    <TeamFlag countryCode={countryCodeMap[team]} size={32} />
                  )}
                  <Typography variant="body1" sx={{ fontWeight: 700, textTransform: 'none' }}>
                    {team ?? 'TBD'}
                    {team && teamRankings[team] != null && (
                      <Box component="span" sx={{ fontSize: '0.7rem', color: 'text.secondary', ml: 0.5, fontWeight: 500 }}>
                        #{teamRankings[team]}
                      </Box>
                    )}
                  </Typography>
                </Button>
              ))}
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{matchId ? 'Close' : 'Done'}</Button>
      </DialogActions>
    </Dialog>
  );
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

/** Which downstream matches consume this match's winner? (Inverse of getFeederIds.) */
function dependentMatches(matchId: string): string[] {
  const out: string[] = [];
  for (let i = 1; i <= 8; i++) {
    const f = getFeederIds(`R16-${i}`);
    if (f && f.includes(matchId)) out.push(`R16-${i}`);
  }
  for (let i = 1; i <= 4; i++) {
    const f = getFeederIds(`QF-${i}`);
    if (f && f.includes(matchId)) out.push(`QF-${i}`);
  }
  for (const sf of ['SF-1', 'SF-2']) {
    const f = getFeederIds(sf);
    if (f && f.includes(matchId)) out.push(sf);
  }
  for (const top of ['FINAL', '3RD']) {
    const f = getFeederIds(top);
    if (f && f.includes(matchId)) out.push(top);
  }
  return out;
}

/** Candidate slot tokens at a given match, given current picks. For most
 *  matches, the two candidates are the picks at the two feeder matches
 *  (= the winners flowing up). For the 3rd-place playoff, the candidates
 *  are the LOSERS of the two SFs — derived as the other QF pick at each
 *  SF (the one the user didn't choose as the SF winner). */
function candidateTeams(
  matchId: string,
  picks: Record<string, string>,
  r32TeamsByMatch: Record<string, { teamA: string | null; teamB: string | null }>,
): Array<string | null> {
  // R32: the two candidate teams come from the populated knockoutBracket.
  if (matchId.startsWith('R32-')) {
    const r32 = r32TeamsByMatch[matchId];
    return [r32?.teamA ?? null, r32?.teamB ?? null];
  }
  if (matchId === '3RD') {
    const loserOf = (sf: string): string | null => {
      const sfPick = picks[sf];
      if (!sfPick) return null;
      const f = getFeederIds(sf);
      if (!f) return null;
      const a = picks[f[0]];
      const b = picks[f[1]];
      if (a && a !== sfPick) return a;
      if (b && b !== sfPick) return b;
      return null;
    };
    return [loserOf('SF-1'), loserOf('SF-2')];
  }
  const feeders = getFeederIds(matchId);
  if (!feeders) return [null, null];
  return [picks[feeders[0]] ?? null, picks[feeders[1]] ?? null];
}

/**
 * Walk the bracket forward from `changedMatchId`. For each downstream match
 * that has a stored pick token, check whether that token still matches one
 * of its current candidates. If it doesn't, the user's pick is no longer
 * reachable — clear it, then recurse.
 *
 * "Downstream" here also needs to include the 3rd-place playoff: any QF or
 * SF change can invalidate the 3RD pick (since 3RD's candidates are derived
 * from BOTH the SF picks and their QF-level feeders). dependentMatches
 * already returns 3RD as a dependent of SF — and since 3RD's candidates
 * recompute from QF + SF state, validating it here works as long as we
 * cascade through SF whenever a QF changes. We already do that.
 */
function validateDownstream(
  changedMatchId: string,
  picks: Record<string, string>,
  r32TeamsByMatch: Record<string, { teamA: string | null; teamB: string | null }>,
) {
  const dependents = dependentMatches(changedMatchId);
  for (const dep of dependents) {
    const stored = picks[dep];
    if (!stored) continue;
    const [candA, candB] = candidateTeams(dep, picks, r32TeamsByMatch);
    if (stored !== candA && stored !== candB) {
      delete picks[dep];
      validateDownstream(dep, picks, r32TeamsByMatch);
    }
  }
  if (!changedMatchId.startsWith('SF-') && changedMatchId !== '3RD') {
    const stored = picks['3RD'];
    if (stored) {
      const [candA, candB] = candidateTeams('3RD', picks, r32TeamsByMatch);
      if (stored !== candA && stored !== candB) delete picks['3RD'];
    }
  }
}

// parseEspnClock moved to lib/parseEspnClock for sharing.
