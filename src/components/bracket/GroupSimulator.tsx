'use client';
import { useState, useCallback, useMemo } from 'react';
import { Box, Button, Typography, Grid, Paper, CircularProgress } from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import GroupPrediction from '@/components/bracket/GroupPrediction';
import ThirdPlacePicker from '@/components/bracket/ThirdPlacePicker';
import type { BracketData, GroupStageResults } from '@/types';
import type { GroupTable } from '@/lib/espnSync';

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
      const res = await fetch('/api/scores?type=standings');
      const data = await res.json();
      const tables: GroupTable[] = data.standings ?? [];
      if (!tables.length) return;

      const newOrders: Record<string, string[]> = { ...groupOrders };
      for (const table of tables) {
        if (table.standings.length >= 4) {
          newOrders[table.groupName] = table.standings.map((s) => s.team);
        }
      }
      setGroupOrders(newOrders);

      // Auto-pick best 8 third-place teams by points/GD
      const thirds = tables
        .filter((t) => t.standings.length >= 3)
        .map((t) => ({ team: t.standings[2].team, pts: t.standings[2].points, gd: t.standings[2].goalDifference, gf: t.standings[2].goalsFor }))
        .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf)
        .slice(0, REQUIRED_THIRD_PLACE)
        .map((t) => t.team);

      setThirdPlacePicks(thirds);
      emitResults(newOrders, thirds);
    } finally {
      setLoadingEspn(false);
    }
  }, [groupOrders, emitResults]);

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
        />
      </Paper>
    </Box>
  );
}
