"use client";
import { useState, useEffect } from "react";
import { Box, Typography, Button, CircularProgress } from "@mui/material";
import Link from "next/link";
import CountdownTimer from "@/components/common/CountdownTimer";
import AuthForm from "@/components/auth/AuthForm";
import LiveScores from "@/components/bracket/LiveScores";
import { useAuth } from "@/hooks/useAuth";
import { useLiveScores } from "@/hooks/useLiveScores";
import type { Tournament, BracketData } from "@/types";

interface TournamentResponse {
  ok: boolean;
  tournament: (Omit<Tournament, "bracket_data" | "results_data"> & {
    bracket_data: BracketData | null;
    results_data: Record<string, unknown> | null;
  }) | null;
}

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const [tournament, setTournament] = useState<TournamentResponse["tournament"]>(null);
  const [loading, setLoading] = useState(true);

  const tournamentStarted = Boolean(
    tournament?.lock_time_groups && new Date(tournament.lock_time_groups) <= new Date()
  );
  const { games, loading: scoresLoading } = useLiveScores(tournamentStarted && Boolean(user));

  useEffect(() => {
    fetch("/api/tournaments")
      .then((r) => r.json())
      .then((d: TournamentResponse) => setTournament(d.tournament))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || authLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    return (
      <Box sx={{ maxWidth: 600, mx: "auto", py: 4, px: 2, textAlign: "center" }}>
        <Typography variant="h3" fontWeight="bold" gutterBottom>
          ⚽ World Cup Predictions
        </Typography>
        <Typography variant="h6" color="text.secondary" gutterBottom>
          Predict the 2026 FIFA World Cup
        </Typography>
        <Box sx={{ mt: 4 }}>
          <AuthForm />
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 700, mx: "auto", py: 4, px: 2, textAlign: "center" }}>
      <Typography variant="h3" fontWeight="bold" gutterBottom>
        ⚽ World Cup Predictions
      </Typography>

      {tournament ? (
        <>
          <Typography variant="h5" color="text.secondary" gutterBottom>
            {tournament.name} {tournament.year}
          </Typography>
          {tournament.lock_time_groups && (
            <Box sx={{ my: 3 }}>
              <CountdownTimer
                targetDate={tournament.lock_time_groups}
                label="Group Predictions Lock In"
              />
            </Box>
          )}
        </>
      ) : (
        <Typography color="text.secondary" sx={{ mt: 2 }}>
          No tournament has been created yet. Check back soon!
        </Typography>
      )}

      <Box sx={{ mt: 4 }}>
        <Typography variant="h6" gutterBottom>
          Welcome back, {user.username}!
        </Typography>
        <Box sx={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "wrap" }}>
          <Button
            component={Link}
            href="/bracket"
            variant="contained"
            size="large"
          >
            Make Your Predictions
          </Button>
          {user.is_admin ? (
            <Button
              component={Link}
              href="/admin"
              variant="outlined"
              color="warning"
              size="large"
            >
              Admin Panel
            </Button>
          ) : null}
        </Box>
      </Box>

      {tournamentStarted && (
        <Box sx={{ mt: 4, textAlign: "left" }}>
          <LiveScores games={games} loading={scoresLoading} />
        </Box>
      )}
    </Box>
  );
}
