'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Box, Typography, Alert, CircularProgress, Button, IconButton, Tooltip, Snackbar, useMediaQuery, useTheme } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ShareIcon from '@mui/icons-material/Share';
import Link from 'next/link';
import GroupPrediction from '@/components/bracket/GroupPrediction';
import ThirdPlacePicker, { type ThirdPlaceTeamDetail } from '@/components/bracket/ThirdPlacePicker';
import KnockoutBracket from '@/components/bracket/KnockoutBracket';
import MobileBracket from '@/components/bracket/MobileBracket';
import { useAuth } from '@/hooks/useAuth';
import { computeEffectiveMatchups } from '@/lib/bracketUtils';
import type { Tournament, BracketData, TournamentResults, GroupPrediction as GroupPredictionType } from '@/types';
import PrintExportButtons from '@/components/common/PrintExportButtons';

export default function PublicBracketPage() {
  const { username } = useParams<{ username: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [groupOrders, setGroupOrders] = useState<Record<string, string[]>>({});
  const [thirdPlacePicks, setThirdPlacePicks] = useState<string[]>([]);
  const [knockoutPicks, setKnockoutPicks] = useState<Record<string, string>>({});
  const [bracketName, setBracketName] = useState('');
  const [tiebreaker, setTiebreaker] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Redirect to own bracket page if viewing self
  useEffect(() => {
    if (user && username && user.username.toLowerCase() === decodeURIComponent(username).toLowerCase()) {
      router.replace('/bracket');
    }
  }, [user, username, router]);

  useEffect(() => {
    async function load() {
      try {
        const [tRes, pRes] = await Promise.all([
          fetch('/api/tournaments'),
          fetch(`/api/picks/public?username=${encodeURIComponent(username)}`),
        ]);
        const tData = await tRes.json();
        const pData = await pRes.json();

        if (!tData.ok || !tData.tournament) {
          setError('No tournament available');
          setLoading(false);
          return;
        }
        const t = tData.tournament as Tournament;
        setTournament(t);

        if (!pData.ok || !pData.prediction) {
          setError(`${decodeURIComponent(username)} hasn't submitted predictions yet.`);
          setLoading(false);
          return;
        }

        const pred = pData.prediction;
        setBracketName(pred.bracket_name || '');
        if (pred.tiebreaker != null) setTiebreaker(pred.tiebreaker);
        if (Array.isArray(pred.third_place_picks)) setThirdPlacePicks(pred.third_place_picks);
        if (pred.knockout_picks && typeof pred.knockout_picks === 'object') {
          setKnockoutPicks(pred.knockout_picks);
        }

        const bd = t.bracket_data as BracketData;
        if (bd?.groups?.length) {
          const orders: Record<string, string[]> = {};
          for (const g of bd.groups) {
            orders[g.name] = g.teams.map((team) => team.name);
          }
          if (Array.isArray(pred.group_predictions)) {
            for (const gp of pred.group_predictions as GroupPredictionType[]) {
              if (gp.groupName && Array.isArray(gp.order)) {
                orders[gp.groupName] = gp.order;
              }
            }
          }
          setGroupOrders(orders);
        }
      } catch {
        setError('Failed to load bracket');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [username]);

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // fallback
    }
  };

  const bracketData = tournament?.bracket_data as BracketData | undefined;
  const results = tournament?.results_data as TournamentResults | undefined;
  const matchups = results?.knockoutBracket || [];
  const effectiveMatchups = useMemo(
    () => matchups.length > 0 ? computeEffectiveMatchups(matchups, knockoutPicks) : [],
    [matchups, knockoutPicks],
  );
  const decodedUsername = decodeURIComponent(username);
  const isOwnProfile = user?.username?.toLowerCase() === decodedUsername.toLowerCase();

  // Phase gating: hide picks until lock times pass
  const lockTimeGroups = tournament?.lock_time_groups ? new Date(tournament.lock_time_groups) : null;
  const lockTimeKnockout = tournament?.lock_time_knockout ? new Date(tournament.lock_time_knockout) : null;
  const now = new Date();
  const groupsLocked = lockTimeGroups ? now >= lockTimeGroups : false;
  const knockoutLocked = lockTimeKnockout ? now >= lockTimeKnockout : false;
  const canSeeGroupPicks = isOwnProfile || user?.is_admin || groupsLocked;
  const canSeeKnockoutPicks = isOwnProfile || user?.is_admin || knockoutLocked;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Alert severity="info" sx={{ maxWidth: 500, mx: 'auto', mb: 2 }}>{error}</Alert>
        <Button component={Link} href="/" startIcon={<ArrowBackIcon />}>Home</Button>
      </Box>
    );
  }
  const groupResultsMap = new Map(
    (results?.groupStage?.groupResults ?? []).map((gr) => [gr.groupName, gr.order]),
  );
  const actualAdvancingThird = results?.groupStage?.advancingThirdPlace;
  const countryCodeMap: Record<string, string> = {};
  const thirdPlaceTeamDetails: Record<string, ThirdPlaceTeamDetail> = {};
  if (bracketData?.groups) {
    for (const g of bracketData.groups) {
      for (const t of g.teams) {
        if (t.countryCode) countryCodeMap[t.name] = t.countryCode;
        thirdPlaceTeamDetails[t.name] = { countryCode: t.countryCode, pot: t.pot, fifaRanking: t.fifaRanking, groupName: g.name };
      }
    }
  }

  return (
    <Box sx={{ maxWidth: 1600, mx: 'auto', px: 2, py: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Button component={Link} href="/" startIcon={<ArrowBackIcon />} size="small" className="no-print">Home</Button>
        <Typography variant="h4" fontWeight="bold" sx={{ flex: 1 }}>
          {decodedUsername}&apos;s Bracket{bracketName ? `: ${bracketName}` : ''}
        </Typography>
        <PrintExportButtons targetRef={printRef} filename={`${decodedUsername}-bracket`} />
        <Tooltip title="Copy link">
          <IconButton onClick={handleShare} className="no-print"><ShareIcon /></IconButton>
        </Tooltip>
      </Box>

      <Box ref={printRef}>
        {/* Picks hidden notice */}
        {!canSeeGroupPicks && (
          <Alert severity="info" sx={{ mb: 3 }}>
            🔒 {decodedUsername}&apos;s predictions are hidden until the tournament begins
            {lockTimeGroups && ` on ${lockTimeGroups.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`}.
          </Alert>
        )}

        {tiebreaker != null && canSeeKnockoutPicks && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Tiebreaker (total goals in Final): {tiebreaker}
          </Typography>
        )}

        {bracketData?.groups && canSeeGroupPicks && (
          <>
            <Typography variant="h5" fontWeight="bold" sx={{ mb: 2 }}>Group Stage</Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' },
                gap: 2,
                mb: 3,
              }}
            >
              {bracketData.groups.map((g) => (
                <GroupPrediction
                  key={g.name}
                  groupName={g.name}
                  teams={g.teams}
                  order={groupOrders[g.name] || g.teams.map((t) => t.name)}
                  onChange={() => {}}
                  disabled
                  advancingThirdPlaceTeams={thirdPlacePicks}
                  actualOrder={groupResultsMap.get(g.name)}
                  actualAdvancingThird={actualAdvancingThird}
                />
              ))}
            </Box>

            {thirdPlacePicks.length > 0 && (
              <Box sx={{ mb: 4 }}>
                <ThirdPlacePicker
                  thirdPlaceTeams={bracketData.groups.map((g) => {
                    const order = groupOrders[g.name];
                    return order ? order[2] : g.teams[2].name;
                  })}
                  selected={thirdPlacePicks}
                  onChange={() => {}}
                  disabled
                  countryCodeMap={countryCodeMap}
                  teamDetails={thirdPlaceTeamDetails}
                />
              </Box>
            )}
          </>
        )}

        {matchups.length > 0 && Object.keys(knockoutPicks).length > 0 && canSeeKnockoutPicks && (
          <>
            <Typography variant="h5" fontWeight="bold" sx={{ mb: 2 }}>Knockout Bracket</Typography>
            {isMobile ? (
              <MobileBracket matchups={effectiveMatchups} picks={knockoutPicks} readOnly results={results?.knockout} countryCodeMap={countryCodeMap} />
            ) : (
              <KnockoutBracket matchups={effectiveMatchups} picks={knockoutPicks} readOnly results={results?.knockout} countryCodeMap={countryCodeMap} />
            )}
          </>
        )}

        {canSeeGroupPicks && !canSeeKnockoutPicks && Object.keys(knockoutPicks).length > 0 && (
          <Alert severity="info" sx={{ mt: 3 }}>
            🔒 Knockout bracket picks become visible once the knockout stage begins.
          </Alert>
        )}
      </Box>

      <Snackbar
        open={copied}
        autoHideDuration={2000}
        onClose={() => setCopied(false)}
        message="Link copied!"
      />
    </Box>
  );
}
