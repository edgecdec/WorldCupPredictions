'use client';
import { useState } from 'react';
import { Button, ButtonGroup, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import CasinoIcon from '@mui/icons-material/Casino';
import PsychologyIcon from '@mui/icons-material/Psychology';

export type AutofillStrategy = 'chalk' | 'random' | 'smart';

interface AutofillButtonsProps {
  onAutofill: (strategy: AutofillStrategy) => void;
  disabled?: boolean;
}

const STRATEGIES: { key: AutofillStrategy; label: string; icon: React.ReactNode; desc: string }[] = [
  { key: 'chalk', label: 'Chalk', icon: <AutoFixHighIcon fontSize="small" />, desc: 'Higher-ranked teams always win/finish higher.' },
  { key: 'random', label: 'Random', icon: <CasinoIcon fontSize="small" />, desc: 'Completely random picks.' },
  { key: 'smart', label: 'Smart', icon: <PsychologyIcon fontSize="small" />, desc: 'Weighted by FIFA ranking — better teams are favored but upsets can happen.' },
];

export default function AutofillButtons({ onAutofill, disabled }: AutofillButtonsProps) {
  const [pending, setPending] = useState<AutofillStrategy | null>(null);

  const selected = STRATEGIES.find((s) => s.key === pending);

  return (
    <>
      <ButtonGroup size="small" variant="outlined" disabled={disabled}>
        {STRATEGIES.map((s) => (
          <Button key={s.key} startIcon={s.icon} onClick={() => setPending(s.key)}>
            {s.label}
          </Button>
        ))}
      </ButtonGroup>

      <Dialog open={!!pending} onClose={() => setPending(null)}>
        <DialogTitle>Autofill: {selected?.label}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {selected?.desc} Only empty slots will be filled — existing picks are preserved.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPending(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (pending) onAutofill(pending);
              setPending(null);
            }}
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
