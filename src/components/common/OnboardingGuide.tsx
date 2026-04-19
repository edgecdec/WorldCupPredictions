'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Box, MobileStepper,
} from '@mui/material';
import {
  KeyboardArrowLeft, KeyboardArrowRight,
} from '@mui/icons-material';

const STORAGE_KEY = 'wc_onboarding_seen';
const TOTAL_STEPS = 5;

const STEPS = [
  {
    title: 'Welcome to World Cup Predictions! ⚽',
    content: (
      <>
        <Typography gutterBottom>
          The 2026 FIFA World Cup features <strong>48 teams</strong> in <strong>12 groups of 4</strong>.
        </Typography>
        <Typography gutterBottom>
          The top 2 teams from each group advance automatically, plus the <strong>8 best 3rd-place teams</strong> — 32 teams total move to the knockout stage.
        </Typography>
        <Typography>
          Your job: predict how it all plays out and compete against friends!
        </Typography>
      </>
    ),
  },
  {
    title: 'Step 1: Group Predictions',
    content: (
      <>
        <Typography gutterBottom>
          For each of the 12 groups, predict the finishing order from 1st to 4th.
        </Typography>
        <Typography gutterBottom>
          <strong>Drag teams</strong> or use the arrow buttons to reorder them. Teams you place 1st and 2nd are predicted to advance.
        </Typography>
        <Typography>
          You earn points for correctly predicting which teams advance and bonus points for nailing the exact position.
        </Typography>
      </>
    ),
  },
  {
    title: 'Step 2: Third-Place Picks',
    content: (
      <>
        <Typography gutterBottom>
          After ordering all 12 groups, pick which <strong>8 of the 12 third-place teams</strong> you think will advance to the Round of 32.
        </Typography>
        <Typography gutterBottom>
          This is unique to the 48-team format — not all third-place teams make it through. The 8 best (by points, goal difference, etc.) advance.
        </Typography>
        <Typography>
          Getting these right earns you extra points!
        </Typography>
      </>
    ),
  },
  {
    title: 'Step 3: Knockout Bracket',
    content: (
      <>
        <Typography gutterBottom>
          Once the group stage ends, the knockout bracket opens. You&apos;ll pick winners for all <strong>31 matches</strong> from the Round of 32 through the Final.
        </Typography>
        <Typography gutterBottom>
          Points increase each round — getting the Final right is worth the most!
        </Typography>
        <Typography>
          You&apos;ll also set a tiebreaker: predict the total goals scored in the Final.
        </Typography>
      </>
    ),
  },
  {
    title: 'Scoring Overview',
    content: (
      <>
        <Typography gutterBottom>
          <strong>Group Stage:</strong> +1 for correct advance, +1 for exact position, upset bonuses for predicting lower-ranked teams to finish high, and group bonuses for perfect predictions.
        </Typography>
        <Typography gutterBottom>
          <strong>Knockout:</strong> Points per round (3→5→8→13→13→21), with upset bonuses based on FIFA ranking differences.
        </Typography>
        <Typography>
          Your group may use custom scoring — check the scoring summary at the top of the predictions page for details.
        </Typography>
      </>
    ),
  },
];

interface OnboardingGuideProps {
  open: boolean;
  onClose: () => void;
}

export default function OnboardingGuide({ open, onClose }: OnboardingGuideProps) {
  const [step, setStep] = useState(0);

  const handleClose = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, '1');
    setStep(0);
    onClose();
  }, [onClose]);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{STEPS[step].title}</DialogTitle>
      <DialogContent>{STEPS[step].content}</DialogContent>
      <DialogActions sx={{ flexDirection: 'column', gap: 1, px: 3, pb: 2 }}>
        <MobileStepper
          variant="dots"
          steps={TOTAL_STEPS}
          position="static"
          activeStep={step}
          sx={{ width: '100%', bgcolor: 'transparent' }}
          backButton={
            <Button size="small" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
              <KeyboardArrowLeft /> Back
            </Button>
          }
          nextButton={
            step === TOTAL_STEPS - 1 ? (
              <Button size="small" variant="contained" onClick={handleClose}>
                Got it!
              </Button>
            ) : (
              <Button size="small" onClick={() => setStep((s) => s + 1)}>
                Next <KeyboardArrowRight />
              </Button>
            )
          }
        />
        {step < TOTAL_STEPS - 1 && (
          <Button size="small" color="inherit" onClick={handleClose} sx={{ opacity: 0.6 }}>
            Skip tutorial
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export { STORAGE_KEY as ONBOARDING_STORAGE_KEY };
