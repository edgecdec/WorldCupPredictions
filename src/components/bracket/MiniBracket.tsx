'use client';
import { useMemo, useState } from 'react';
import { Box, Chip, Tabs, Tab, Typography, Paper } from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import TeamFlag from '@/components/common/TeamFlag';
import { KnockoutMatchup } from '@/types';
import { ROUND_R32, ROUND_R16, ROUND_QF, ROUND_SF, ROUND_3RD, ROUND_FINAL } from '@/lib/bracketUtils';

const TABS = [
  { label: 'R32→R16', fromRound: ROUND_R32, count: 16 },
  { label: 'R16→QF', fromRound: ROUND_R16, count: 8 },
  { label: 'QF→SF', fromRound: ROUND_QF, count: 4 },
  { label: 'SF→Final', fromRound: ROUND_SF, count: 2 },
] as const;

interface MiniBracketProps {
  matchups: KnockoutMatchup[];
  picks: Record<string, string>;
  countryCodeMap?: Record<string, string>;
  results?: Record<string, string>;
}

function getAdvancingTeams(
  matchups: KnockoutMatchup[],
  picks: Record<string, string>,
  results: Record<string, string> | undefined,
  fromRound: number,
): string[] {
  const teams: string[] = [];
  for (const m of matchups) {
    if (m.round !== fromRound) continue;
    const winner = results?.[m.id] ?? picks[m.id];
    if (winner) teams.push(winner);
  }
  return teams;
}

function getChampion(
  matchups: KnockoutMatchup[],
  picks: Record<string, string>,
  results: Record<string, string> | undefined,
): string | null {
  const final = matchups.find((m) => m.round === ROUND_FINAL);
  if (!final) return null;
  return results?.[final.id] ?? picks[final.id] ?? null;
}

export default function MiniBracket({ matchups, picks, countryCodeMap, results }: MiniBracketProps) {
  const [tab, setTab] = useState(0);
  const champion = useMemo(() => getChampion(matchups, picks, results), [matchups, picks, results]);

  const currentTab = TABS[tab];
  const teams = useMemo(
    () => getAdvancingTeams(matchups, picks, results, currentTab.fromRound),
    [matchups, picks, results, currentTab.fromRound],
  );

  if (!matchups.length) return null;

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      {champion && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: 1 }}>
          <EmojiEventsIcon sx={{ color: 'warning.main', fontSize: 20 }} />
          <Typography variant="body2" fontWeight={700}>
            Champion:
          </Typography>
          {countryCodeMap?.[champion] && <TeamFlag countryCode={countryCodeMap[champion]} size={16} />}
          <Typography variant="body2" fontWeight={700}>{champion}</Typography>
        </Box>
      )}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="fullWidth"
        sx={{ minHeight: 32, '& .MuiTab-root': { minHeight: 32, py: 0.5, fontSize: '0.75rem' } }}
      >
        {TABS.map((t, i) => (
          <Tab key={i} label={t.label} />
        ))}
      </Tabs>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1, justifyContent: 'center' }}>
        {teams.length === 0 ? (
          <Typography variant="caption" color="text.secondary">No picks yet</Typography>
        ) : (
          teams.map((name) => (
            <Chip
              key={name}
              size="small"
              icon={countryCodeMap?.[name] ? <TeamFlag countryCode={countryCodeMap[name]} size={14} /> : undefined}
              label={name}
              sx={{
                fontWeight: name === champion ? 700 : 400,
                borderColor: name === champion ? 'warning.main' : undefined,
                borderWidth: name === champion ? 2 : undefined,
              }}
              variant={name === champion ? 'outlined' : 'filled'}
            />
          ))
        )}
        {teams.length > 0 && teams.length < currentTab.count && (
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
            {teams.length}/{currentTab.count}
          </Typography>
        )}
      </Box>
    </Paper>
  );
}
