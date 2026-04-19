'use client';
import { useState, useEffect } from 'react';
import { Accordion, AccordionSummary, AccordionDetails, Typography, Box, Chip } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { ScoringSettings, DEFAULT_SCORING, KNOCKOUT_ROUNDS } from '@/types';

const STORAGE_KEY = 'scoringRulesExpanded';

interface ScoringRulesSummaryProps {
  mode: 'group' | 'knockout';
  settings?: ScoringSettings;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Chip label={value} size="small" variant="outlined" />
    </Box>
  );
}

export default function ScoringRulesSummary({ mode, settings }: ScoringRulesSummaryProps) {
  const s = settings ?? DEFAULT_SCORING;
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setExpanded(stored === null);
  }, []);

  const handleChange = (_: unknown, isExpanded: boolean) => {
    setExpanded(isExpanded);
    localStorage.setItem(STORAGE_KEY, isExpanded ? 'true' : 'false');
  };

  return (
    <Accordion expanded={expanded} onChange={handleChange} sx={{ mb: 2 }} disableGutters>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <InfoOutlinedIcon sx={{ mr: 1, color: 'primary.main' }} fontSize="small" />
        <Typography variant="subtitle2">Scoring Rules</Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        {mode === 'group' ? (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              Per team: predict finishing order 1–4. Teams finishing 1st/2nd advance automatically. 8 of 12 third-place teams also advance — pick which 8.
            </Typography>
            <Row label="Advance correct (predicted advance/not matches actual)" value={`+${s.groupStage.advanceCorrect}`} />
            <Row label="Exact position (predicted position matches actual)" value={`+${s.groupStage.exactPosition}`} />
            <Row label="Upset bonus (per place above seed, if team finishes at/above prediction)" value={`+${s.groupStage.upsetBonusPerPlace}/place`} />
            <Row label="All 4 advance/not-advance correct in a group" value={`+${s.groupStage.advancementCorrectBonus}`} />
            <Row label="Perfect group order (all 4 positions exact)" value={`+${s.groupStage.perfectOrderBonus}`} />
          </Box>
        ) : (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              Pick the winner of each match. Points increase each round. Upset bonus when a lower-ranked team wins.
            </Typography>
            {KNOCKOUT_ROUNDS.map((round, i) => (
              <Row
                key={round}
                label={`${round} correct pick`}
                value={`+${s.knockout.pointsPerRound[i]}  (upset ×${s.knockout.upsetMultiplierPerRound[i]})`}
              />
            ))}
            {s.knockout.championBonus > 0 && (
              <Row label="Champion bonus" value={`+${s.knockout.championBonus}`} />
            )}
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Upset bonus = ⌊rank diff ÷ {s.knockout.upsetModulus}⌋ × round multiplier
            </Typography>
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  );
}
