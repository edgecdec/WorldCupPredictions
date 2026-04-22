'use client';
import { useState, useEffect } from 'react';
import { Accordion, AccordionSummary, AccordionDetails, Typography, Box } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { ScoringSettings, DEFAULT_SCORING } from '@/types';

const STORAGE_KEY = 'scoringRulesExpanded';

interface ScoringRulesSummaryProps {
  mode: 'group' | 'knockout';
  settings?: ScoringSettings;
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <Box component="li" sx={{ mb: 0.5 }}>
      <Typography variant="body2" color="text.secondary">{children}</Typography>
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

  const ko = s.knockout;

  return (
    <Accordion expanded={expanded} onChange={handleChange} sx={{ mb: 2 }} disableGutters>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <InfoOutlinedIcon sx={{ mr: 1, color: 'primary.main' }} fontSize="small" />
        <Typography variant="subtitle2">Scoring Rules</Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        {mode === 'group' ? (
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            <Bullet>Correct advance/not advance: +{s.groupStage.advanceCorrect} per team</Bullet>
            <Bullet>Exact finishing position: +{s.groupStage.exactPosition} per team</Bullet>
            <Bullet>
              Upset bonus: +{s.groupStage.upsetBonusPerPlace} for each position above their seed you predicted
              (only if they finish at or above your prediction)
            </Bullet>
            <Bullet>All advancement calls correct in a group: +{s.groupStage.advancementCorrectBonus} bonus</Bullet>
            <Bullet>Perfect group order (all 4 positions exact): +{s.groupStage.perfectOrderBonus} bonus</Bullet>
            <Box component="li" sx={{ mt: 1, listStyle: 'none', ml: -2.5 }}>
              <Typography variant="caption" color="text.secondary">
                Teams finishing 1st/2nd advance automatically. 8 of 12 third-place teams also advance — pick which 8.
              </Typography>
            </Box>
          </Box>
        ) : (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Points per correct pick: R32: {ko.pointsPerRound[0]} • R16: {ko.pointsPerRound[1]} • QF: {ko.pointsPerRound[2]} • SF: {ko.pointsPerRound[3]} • Final: {ko.pointsPerRound[5]}
              {' '}(3rd place match: {ko.pointsPerRound[4]})
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              <Bullet>
                Upset bonus = ⌊FIFA ranking difference ÷ {ko.upsetModulus}⌋ × round multiplier
              </Bullet>
              <Bullet>
                Round multipliers: R32: ×{ko.upsetMultiplierPerRound[0]} • R16: ×{ko.upsetMultiplierPerRound[1]} • QF: ×{ko.upsetMultiplierPerRound[2]} • SF: ×{ko.upsetMultiplierPerRound[3]} • Final: ×{ko.upsetMultiplierPerRound[5]}
                {' '}(3rd place: ×{ko.upsetMultiplierPerRound[4]})
              </Bullet>
              {ko.championBonus > 0 && (
                <Bullet>Champion bonus: +{ko.championBonus}</Bullet>
              )}
            </Box>
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  );
}
