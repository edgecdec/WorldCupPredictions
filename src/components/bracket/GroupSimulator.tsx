'use client';
import { useState, useCallback, useMemo } from 'react';
import { Box, Button, Typography, Grid, Paper, CircularProgress } from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import GroupPrediction from '@/components/bracket/GroupPrediction';
import ThirdPlacePicker, { type ThirdPlaceTeamDetail } from '@/components/bracket/ThirdPlacePicker';
import type { BracketData, GroupStageResults, LiveGame } from '@/types';
import { computeLiveStandings } from '@/lib/liveStandings';
import { rankThirdPlaceCandidates } from '@/lib/groupOrder';

const REQUIRED_THIRD_PLACE = 8;

interface GroupSimulatorProps {
  bracketData: BracketData;
  onChange: (results: GroupStageResults | null) => void;
  initialResults?: GroupStageResults;
}

function buildCountryCodeMap(bracketData: BracketData): Record<string, string> {
  const map: Record<string, string> = {};
  for (const g of bracketData.groups) {
    for (const t of g.teams) {
      if (t.countryCode) map[t.name] = t.countryCode;
    }
  }
  return map;
}

export default function GroupSimulator({ bracketData, onChange, initialResults }: GroupSimulatorProps) {
  const [groupOrders, setGroupOrders] = useState<Record<string, string[]>>(() => {
    const orders: Record<string, string[]> = {};
    for (const g of bracketData.groups) {
      const existing = initialResults?.groupResults.find((r) => r.groupName === g.name);
      orders[g.name] = existing
        ? [...existing.order]
        : g.teams.map((t) => t.name);
    }
    return orders;
  });

  const [thirdPlacePicks, setThirdPlacePicks] = useState<string[]>(
    () => initialResults?.advancingThirdPlace ?? [],
  );

  const [loadingEspn, setLoadingEspn] = useState(false);
  const countryCodeMap = useMemo(() => buildCountryCodeMap(bracketData), [bracketData]);

  const thirdPlaceTeamDetails = useMemo(() => {
    const details: Record<string, ThirdPlaceTeamDetail> = {};
    for (const g of bracketData.groups) {
      for (const t of g.teams) {
        details[t.name] = { countryCode: t.countryCode, pot: t.pot, fifaRanking: t.fifaRanking, groupName: g.name };
      }
    }
    return details;
  }, [bracketData]);

  const thirdPlaceTeams = useMemo(
    () => bracketData.groups.map((g) => groupOrders[g.name]?.[2] ?? g.teams[2].name),
    [bracketData, groupOrders],
  );

  // Emit results whenever orders or third-place picks change
  const emitResults = useCallback(
    (orders: Record<string, string[]>, picks: string[]) => {
      if (picks.length !== REQUIRED_THIRD_PLACE) {
        onChange(null);
        return;
      }
      const groupResults = bracketData.groups.map((g) => ({
        groupName: g.name,
        order: (orders[g.name] ?? g.teams.map((t) => t.name)) as [string, string, string, string],
      }));
      onChange({ groupResults, advancingThirdPlace: picks });
    },
    [bracketData, onChange],
  );

  const handleGroupChange = useCallback(
    (groupName: string, newOrder: string[]) => {
      setGroupOrders((prev) => {
        const next = { ...prev, [groupName]: newOrder };
        // If the 3rd-place team changed, remove old one from picks
        const oldThird = prev[groupName]?.[2];
        const newThird = newOrder[2];
        if (oldThird !== newThird) {
          setThirdPlacePicks((tp) => {
            const updated = tp.filter((t) => t !== oldThird);
            emitResults(next, updated);
            return updated;
          });
        } else {
          emitResults(next, thirdPlacePicks);
        }
        return next;
      });
    },
    [emitResults, thirdPlacePicks],
  );

  const handleThirdPlaceChange = useCallback(
    (selected: string[]) => {
      setThirdPlacePicks(selected);
      emitResults(groupOrders, selected);
    },
    [groupOrders, emitResults],
  );

  const handleEspnFill = useCallback(async () => {
    setLoadingEspn(true);
    try {
      // Use the same data sources / tiebreaker chain as Live Standings:
      // results_data.groupMatches for completed games + /api/scores for
      // in-progress games. This keeps the autofill consistent with what
      // /bracket's Live Standings tab shows and applies 2026 FIFA H2H-first
      // tiebreakers, where ESPN's /standings did neither.
      const [tRes, sRes] = await Promise.all([
        fetch('/api/tournaments').then((r) => r.json()).catch(() => null),
        fetch('/api/scores').then((r) => r.json()).catch(() => null),
      ]);
      const completed: Record<string, Array<{ teamA: string; teamB: string; scoreA: number; scoreB: number; cardEvents?: Array<{ teamId: number; athleteId: number; kind: 'yellow' | 'red' }> }>> =
        tRes?.tournament?.results_data?.groupMatches ?? {};
      const liveGames: LiveGame[] = sRes?.games ?? [];

      // Build team → group lookup for bucketing in-progress games.
      const teamToGroup: Record<string, string> = {};
      for (const g of bracketData.groups) for (const t of g.teams) teamToGroup[t.name] = g.name;

      const inProgress: Record<string, Array<{ teamA: string; teamB: string; scoreA: number; scoreB: number }>> = {};
      for (const g of liveGames) {
        if (g.state !== 'in') continue;
        if ((g.stage ?? 'group') !== 'group') continue;
        const gn = teamToGroup[g.home?.name];
        if (!gn || teamToGroup[g.away?.name] !== gn) continue;
        const dup = (completed[gn] ?? []).some((m) =>
          (m.teamA === g.home.name && m.teamB === g.away.name) ||
          (m.teamA === g.away.name && m.teamB === g.home.name));
        if (dup) continue;
        const sA = parseInt(g.home.score, 10) || 0;
        const sB = parseInt(g.away.score, 10) || 0;
        (inProgress[gn] ??= []).push({ teamA: g.home.name, teamB: g.away.name, scoreA: sA, scoreB: sB });
      }
      const tables = computeLiveStandings(bracketData, completed, inProgress);
      if (!tables.length) return;

      const newOrders: Record<string, string[]> = { ...groupOrders };
      for (const table of tables) {
        if (table.standings.length >= 4) {
          newOrders[table.groupName] = table.standings.map((s) => s.team);
        }
      }
      setGroupOrders(newOrders);

      // Auto-pick the best 8 third-place teams via the canonical cross-group
      // sorter (no H2H — these teams haven't played each other).
      const fifaRank = (team: string) => {
        for (const g of bracketData.groups) {
          const t = g.teams.find((x) => x.name === team);
          if (t) return t.fifaRanking ?? 9999;
        }
        return 9999;
      };
      const thirds = rankThirdPlaceCandidates(
        tables
          .filter((t) => t.standings.length >= 3)
          .map((t) => {
            const s = t.standings[2];
            return {
              team: s.team, points: s.points, goalDifference: s.goalDifference,
              goalsFor: s.goalsFor, fairPlay: s.fairPlay,
            };
          }),
        fifaRank,
      ).slice(0, REQUIRED_THIRD_PLACE).map((c) => c.team);

      setThirdPlacePicks(thirds);
      emitResults(newOrders, thirds);
    } finally {
      setLoadingEspn(false);
    }
  }, [bracketData, groupOrders, emitResults]);

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={loadingEspn ? <CircularProgress size={16} /> : <AutoFixHighIcon />}
          onClick={handleEspnFill}
          disabled={loadingEspn}
        >
          If Current Results Hold
        </Button>
        <Typography variant="caption" color="text.secondary">
          Reorder teams in each group, then pick 8 advancing 3rd-place teams.
        </Typography>
      </Box>

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {bracketData.groups.map((g) => (
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={g.name}>
            <GroupPrediction
              groupName={g.name}
              teams={g.teams}
              order={groupOrders[g.name] ?? g.teams.map((t) => t.name)}
              onChange={handleGroupChange}
            />
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ p: 2 }}>
        <ThirdPlacePicker
          thirdPlaceTeams={thirdPlaceTeams}
          selected={thirdPlacePicks}
          onChange={handleThirdPlaceChange}
          countryCodeMap={countryCodeMap}
          teamDetails={thirdPlaceTeamDetails}
        />
      </Paper>
    </Box>
  );
}
