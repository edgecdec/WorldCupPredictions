'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  Box, Typography, CircularProgress, Alert, Button, Paper, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Tooltip, useMediaQuery, useTheme,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import GroupsIcon from '@mui/icons-material/Groups';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import Link from 'next/link';
import GroupPrediction from '@/components/bracket/GroupPrediction';
import ThirdPlacePicker from '@/components/bracket/ThirdPlacePicker';
import KnockoutBracket from '@/components/bracket/KnockoutBracket';
import MobileBracket from '@/components/bracket/MobileBracket';
import MiniBracket from '@/components/bracket/MiniBracket';
import TeamFlag from '@/components/common/TeamFlag';
import { useAuth } from '@/hooks/useAuth';
import type { Tournament, BracketData, TournamentResults, GroupPrediction as GroupPredictionType } from '@/types';

interface ProfileGroup {
  id: string;
  name: string;
  memberCount: number;
}

interface GroupScore {
  groupId: string;
  groupName: string;
  totalScore: number;
  groupStageScore: number;
  knockoutScore: number;
  bonusPoints: number;
  rank: number;
  totalMembers: number;
  percentile: number;
  perfectGroups: number;
  contrarianPicks: number;
  hotStreak: number;
}

interface ProfileData {
  username: string;
  createdAt: string;
  groups: ProfileGroup[];
  prediction: {
    bracketName: string;
    groupPredictions: GroupPredictionType[];
    thirdPlacePicks: string[];
    knockoutPicks: Record<string, string>;
    tiebreaker: number | null;
  } | null;
  groupScores: GroupScore[];
  championPick: string | null;
}

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { user } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const printRef = useRef<HTMLDivElement>(null);

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const decodedUsername = decodeURIComponent(username);
  const isOwnProfile = user?.username?.toLowerCase() === decodedUsername.toLowerCase();

  useEffect(() => {
    async function load() {
      try {
        const [pRes, tRes] = await Promise.all([
          fetch(`/api/profile?username=${encodeURIComponent(username)}`),
          fetch('/api/tournaments'),
        ]);
        const pData = await pRes.json();
        const tData = await tRes.json();

        if (!pData.ok) {
          setError(pData.error || 'User not found');
          return;
        }
        setProfile(pData.profile);
        if (tData.ok && tData.tournament) setTournament(tData.tournament);
      } catch {
        setError('Failed to load profile');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [username]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !profile) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Alert severity="error" sx={{ maxWidth: 500, mx: 'auto', mb: 2 }}>{error || 'User not found'}</Alert>
        <Button component={Link} href="/" startIcon={<ArrowBackIcon />}>Home</Button>
      </Box>
    );
  }

  const bracketData = tournament?.bracket_data as BracketData | undefined;
  const results = tournament?.results_data as TournamentResults | undefined;
  const matchups = results?.knockoutBracket ?? [];
  const pred = profile.prediction;

  const groupOrders: Record<string, string[]> = {};
  if (bracketData?.groups && pred) {
    for (const g of bracketData.groups) {
      groupOrders[g.name] = g.teams.map((t) => t.name);
    }
    for (const gp of pred.groupPredictions) {
      if (gp.groupName && Array.isArray(gp.order)) {
        groupOrders[gp.groupName] = gp.order;
      }
    }
  }

  const countryCodeMap: Record<string, string> = {};
  if (bracketData?.groups) {
    for (const g of bracketData.groups) {
      for (const t of g.teams) {
        if (t.countryCode) countryCodeMap[t.name] = t.countryCode;
      }
    }
  }

  const groupResultsMap = new Map(
    (results?.groupStage?.groupResults ?? []).map((gr) => [gr.groupName, gr.order]),
  );
  const actualAdvancingThird = results?.groupStage?.advancingThirdPlace;

  const memberSince = profile.createdAt
    ? new Date(profile.createdAt + 'Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'Unknown';

  return (
    <Box sx={{ maxWidth: 1600, mx: 'auto', px: 2, py: 3 }} ref={printRef}>
      <Button component={Link} href="/" startIcon={<ArrowBackIcon />} size="small" sx={{ mb: 2 }}>
        Home
      </Button>

      {/* Header */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h4" fontWeight="bold">
              {profile.username}
              {isOwnProfile && <Chip label="You" size="small" color="primary" variant="outlined" sx={{ ml: 1 }} />}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Member since {memberSince}
            </Typography>
            {profile.championPick && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                <EmojiEventsIcon sx={{ color: 'warning.main', fontSize: 20 }} />
                <Typography variant="body2">
                  Champion pick: <TeamFlag countryCode={countryCodeMap[profile.championPick]} size={16} /> <strong>{profile.championPick}</strong>
                </Typography>
              </Box>
            )}
          </Box>
          {pred?.bracketName && (
            <Chip label={pred.bracketName} variant="outlined" />
          )}
          <Button component={Link} href={`/bracket/${encodeURIComponent(profile.username)}`} variant="outlined" size="small">
            View Full Bracket
          </Button>
        </Box>
      </Paper>

      {/* Groups */}
      {profile.groups.length > 0 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <GroupsIcon /> Groups
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {profile.groups.map((g) => (
              <Chip
                key={g.id}
                label={`${g.name} (${g.memberCount})`}
                component={Link}
                href={`/leaderboard?group=${g.id}`}
                clickable
                variant="outlined"
              />
            ))}
          </Box>
        </Paper>
      )}

      {/* Score Summary */}
      {profile.groupScores.length > 0 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Score Summary</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>Group</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>Rank</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>Group Stage</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>Knockout</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>Total</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>Bonus</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>Percentile</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {profile.groupScores.map((gs) => (
                  <TableRow key={gs.groupId}>
                    <TableCell>
                      <Link href={`/leaderboard?group=${gs.groupId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        {gs.groupName}
                      </Link>
                    </TableCell>
                    <TableCell align="right">{gs.rank} / {gs.totalMembers}</TableCell>
                    <TableCell align="right">{gs.groupStageScore}</TableCell>
                    <TableCell align="right">{gs.knockoutScore}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>{gs.totalScore}</TableCell>
                    <TableCell align="right" sx={{ color: 'text.secondary' }}>{gs.bonusPoints}</TableCell>
                    <TableCell align="right">
                      <Chip label={`Top ${gs.percentile}%`} size="small" color={gs.percentile >= 75 ? 'success' : gs.percentile >= 50 ? 'primary' : 'default'} variant="outlined" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Stats badges */}
          {profile.groupScores.some((gs) => gs.perfectGroups > 0 || gs.hotStreak >= 3 || gs.contrarianPicks > 0) && (
            <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {(() => {
                const maxPerfect = Math.max(...profile.groupScores.map((gs) => gs.perfectGroups));
                const maxStreak = Math.max(...profile.groupScores.map((gs) => gs.hotStreak));
                const maxContrarian = Math.max(...profile.groupScores.map((gs) => gs.contrarianPicks));
                return (
                  <>
                    {maxPerfect > 0 && (
                      <Tooltip title={`${maxPerfect} perfect group${maxPerfect === 1 ? '' : 's'} — all 4 positions exactly correct`}>
                        <Chip label={`🎯 ${maxPerfect} Perfect Groups`} size="small" />
                      </Tooltip>
                    )}
                    {maxStreak >= 3 && (
                      <Tooltip title={`${maxStreak} consecutive correct knockout picks`}>
                        <Chip label={`🔥 ${maxStreak} Hot Streak`} size="small" />
                      </Tooltip>
                    )}
                    {maxContrarian > 0 && (
                      <Tooltip title={`${maxContrarian} contrarian pick${maxContrarian === 1 ? '' : 's'} that hit`}>
                        <Chip label={`😱 ${maxContrarian} Contrarian`} size="small" />
                      </Tooltip>
                    )}
                  </>
                );
              })()}
            </Box>
          )}
        </Paper>
      )}

      {/* Mini Bracket Progression */}
      {pred && matchups.length > 0 && Object.keys(pred.knockoutPicks).length > 0 && (
        <Box sx={{ mb: 3, maxWidth: 500 }}>
          <MiniBracket matchups={matchups} picks={pred.knockoutPicks} countryCodeMap={countryCodeMap} results={results?.knockout} />
        </Box>
      )}

      {/* Group Predictions */}
      {pred && bracketData?.groups && (
        <>
          <Typography variant="h5" fontWeight="bold" sx={{ mb: 2 }}>Group Predictions</Typography>
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
                advancingThirdPlaceTeams={pred.thirdPlacePicks}
                actualOrder={groupResultsMap.get(g.name)}
                actualAdvancingThird={actualAdvancingThird}
              />
            ))}
          </Box>

          {pred.thirdPlacePicks.length > 0 && (
            <Box sx={{ mb: 4 }}>
              <ThirdPlacePicker
                thirdPlaceTeams={bracketData.groups.map((g) => {
                  const order = groupOrders[g.name];
                  return order ? order[2] : g.teams[2].name;
                })}
                selected={pred.thirdPlacePicks}
                onChange={() => {}}
                disabled
                countryCodeMap={countryCodeMap}
              />
            </Box>
          )}
        </>
      )}

      {/* Knockout Bracket */}
      {pred && matchups.length > 0 && Object.keys(pred.knockoutPicks).length > 0 && (
        <>
          <Typography variant="h5" fontWeight="bold" sx={{ mb: 2 }}>Knockout Bracket</Typography>
          {pred.tiebreaker != null && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Tiebreaker (total goals in Final): {pred.tiebreaker}
            </Typography>
          )}
          {isMobile ? (
            <MobileBracket matchups={matchups} picks={pred.knockoutPicks} readOnly results={results?.knockout} countryCodeMap={countryCodeMap} />
          ) : (
            <KnockoutBracket matchups={matchups} picks={pred.knockoutPicks} readOnly results={results?.knockout} countryCodeMap={countryCodeMap} />
          )}
        </>
      )}

      {!pred && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">{profile.username} hasn&apos;t submitted predictions yet.</Typography>
        </Paper>
      )}
    </Box>
  );
}
