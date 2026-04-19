'use client';
import { useEffect, useState } from 'react';
import { Container, Typography, Box, Paper } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import { useAuth } from '@/hooks/useAuth';
import { getPhase, getUnlockMessage, isPageRestricted } from '@/lib/tournamentPhase';
import type { Tournament } from '@/types';

interface PhaseGateProps {
  pathname: string;
  children: React.ReactNode;
}

export default function PhaseGate({ pathname, children }: PhaseGateProps) {
  const { user } = useAuth();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/tournaments')
      .then(r => r.json())
      .then(d => { setTournament(d.tournament); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  // Admin bypass
  if (user?.is_admin) return <>{children}</>;

  const phase = getPhase(tournament);
  if (!isPageRestricted(pathname, phase)) return <>{children}</>;

  const message = getUnlockMessage(pathname, phase);
  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <LockIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h5" gutterBottom>Not Yet Available</Typography>
        <Typography color="text.secondary">{message}</Typography>
      </Paper>
    </Container>
  );
}
