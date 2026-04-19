'use client';
import {
  Dialog, DialogTitle, DialogContent, IconButton, Box, Tab, Tabs,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Typography, Chip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useState } from 'react';
import {
  UserPrediction, GroupStageResults, KnockoutResults, KnockoutMatchup,
  BracketData, ScoringSettings, KNOCKOUT_ROUNDS,
} from '@/types';
import {
  scoreGroupStage, scoreKnockout,
  GroupStageScoreResult, KnockoutScoreResult,
} from '@/lib/scoring';
import {
  getGroupTeamBreakdown, GroupTeamDetail,
  getKnockoutMatchBreakdown, KnockoutMatchDetail,
} from '@/lib/scoringBreakdown';

interface Props {
  open: boolean;
  onClose: () => void;
  prediction: UserPrediction;
  results: { groupStage?: GroupStageResults; knockout?: KnockoutResults; knockoutBracket?: KnockoutMatchup[] };
  settings: ScoringSettings;
  bracketData: BracketData;
}

export default function ScoringBreakdownDialog({ open, onClose, prediction, results, settings, bracketData }: Props) {
  const [tab, setTab] = useState(0);

  const groupResult: GroupStageScoreResult | null = results.groupStage
    ? scoreGroupStage(prediction.group_predictions, prediction.third_place_picks, results.groupStage, bracketData, settings.groupStage)
    : null;

  const knockoutResult: KnockoutScoreResult | null =
    results.knockout && results.knockoutBracket
      ? scoreKnockout(prediction.knockout_picks, results.knockout, results.knockoutBracket, bracketData, settings.knockout)
      : null;

  const groupTeams: GroupTeamDetail[] = results.groupStage
    ? getGroupTeamBreakdown(prediction, results.groupStage, bracketData, settings.groupStage)
    : [];

  const knockoutMatches: KnockoutMatchDetail[] =
    results.knockout && results.knockoutBracket
      ? getKnockoutMatchBreakdown(prediction, results.knockout, results.knockoutBracket, bracketData, settings.knockout)
      : [];

  const totalScore = (groupResult?.total ?? 0) + (knockoutResult?.total ?? 0) + (knockoutResult?.championBonus ?? 0);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{prediction.bracket_name || 'Bracket'}</span>
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', gap: 2, mb: 1 }}>
          <Typography variant="body2">Group: {groupResult?.total ?? 0}</Typography>
          <Typography variant="body2">Knockout: {knockoutResult?.total ?? 0}</Typography>
          <Typography variant="body2" fontWeight="bold">Total: {totalScore}</Typography>
        </Box>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1 }}>
          <Tab label="Group Stage" />
          <Tab label="Knockout" />
        </Tabs>
        {tab === 0 && <GroupStageTab teams={groupTeams} result={groupResult} />}
        {tab === 1 && <KnockoutTab matches={knockoutMatches} result={knockoutResult} />}
      </DialogContent>
    </Dialog>
  );
}

function GroupStageTab({ teams, result }: { teams: GroupTeamDetail[]; result: GroupStageScoreResult | null }) {
  if (!result || teams.length === 0) {
    return <Typography color="text.secondary">No group stage results yet.</Typography>;
  }

  const grouped = new Map<string, GroupTeamDetail[]>();
  for (const t of teams) {
    const arr = grouped.get(t.groupName) ?? [];
    arr.push(t);
    grouped.set(t.groupName, arr);
  }

  return (
    <TableContainer sx={{ maxHeight: 500 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell>Group</TableCell>
            <TableCell>Team</TableCell>
            <TableCell align="center">Pred</TableCell>
            <TableCell align="center">Actual</TableCell>
            <TableCell align="right">Adv</TableCell>
            <TableCell align="right">Pos</TableCell>
            <TableCell align="right">Upset</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {Array.from(grouped.entries()).map(([groupName, groupTeams]) => {
            const groupDetail = result.perGroup.find((g) => g.groupName === groupName);
            return groupTeams.map((t, i) => (
              <TableRow key={`${groupName}-${t.teamName}`}>
                {i === 0 && (
                  <TableCell rowSpan={groupTeams.length} sx={{ verticalAlign: 'top', fontWeight: 'bold' }}>
                    {groupName}
                    {groupDetail && (
                      <Box sx={{ mt: 0.5 }}>
                        <Chip label={groupDetail.total} size="small" color="primary" />
                      </Box>
                    )}
                  </TableCell>
                )}
                <TableCell>{t.teamName}</TableCell>
                <TableCell align="center">{t.predictedPosition}</TableCell>
                <TableCell align="center">{t.actualPosition}</TableCell>
                <TableCell align="right">
                  <ScoreChip value={t.advanceCorrectPts} ok={t.advanceCorrect} />
                </TableCell>
                <TableCell align="right">
                  <ScoreChip value={t.exactPositionPts} ok={t.exactPosition} />
                </TableCell>
                <TableCell align="right">
                  {t.upsetBonusPts > 0 ? <Chip label={`+${t.upsetBonusPts}`} size="small" color="warning" /> : '—'}
                </TableCell>
              </TableRow>
            ));
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function KnockoutTab({ matches, result }: { matches: KnockoutMatchDetail[]; result: KnockoutScoreResult | null }) {
  if (!result || matches.length === 0) {
    return <Typography color="text.secondary">No knockout results yet.</Typography>;
  }

  return (
    <>
      <Box sx={{ display: 'flex', gap: 2, mb: 1, flexWrap: 'wrap' }}>
        {result.perRound.map((r) => (
          <Typography key={r.round} variant="body2">{r.round}: {r.total}</Typography>
        ))}
        {result.championBonus > 0 && (
          <Typography variant="body2" color="warning.main">Champion: +{result.championBonus}</Typography>
        )}
      </Box>
      <TableContainer sx={{ maxHeight: 500 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Round</TableCell>
              <TableCell>Match</TableCell>
              <TableCell>Pick</TableCell>
              <TableCell>Winner</TableCell>
              <TableCell align="right">Base</TableCell>
              <TableCell align="right">Upset</TableCell>
              <TableCell align="right">Total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {matches.map((m) => (
              <TableRow
                key={m.matchupId}
                sx={m.winner ? { bgcolor: m.correct ? 'success.main' : 'error.main', '& td': { color: 'common.white' } } : undefined}
              >
                <TableCell>{KNOCKOUT_ROUNDS[m.round]}</TableCell>
                <TableCell>{m.teamA ?? '?'} vs {m.teamB ?? '?'}</TableCell>
                <TableCell>{m.userPick || '—'}</TableCell>
                <TableCell>{m.winner || '—'}</TableCell>
                <TableCell align="right">{m.correct ? m.basePoints : 0}</TableCell>
                <TableCell align="right">{m.upsetBonus > 0 ? `+${m.upsetBonus}` : '—'}</TableCell>
                <TableCell align="right">{m.correct ? m.basePoints + m.upsetBonus : 0}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
}

function ScoreChip({ value, ok }: { value: number; ok: boolean }) {
  if (ok && value > 0) return <Chip label={`+${value}`} size="small" color="success" />;
  if (ok) return <Chip label="✓" size="small" color="success" variant="outlined" />;
  return <Chip label="✗" size="small" color="error" variant="outlined" />;
}
