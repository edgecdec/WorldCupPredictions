"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Chip,
} from "@mui/material";
import { useAuth } from "@/hooks/useAuth";
import { WORLD_CUP_2026_DATA } from "@/lib/bracketData";
import type { Tournament, BracketData } from "@/types";

const SEED_TOURNAMENT_NAME = "FIFA World Cup";
const SEED_TOURNAMENT_YEAR = 2026;
const SEED_LOCK_GROUPS = "2026-06-11T00:00:00";
const SEED_LOCK_KNOCKOUT = "2026-06-30T00:00:00";

interface TournamentResponse {
  ok: boolean;
  tournament:
    | (Omit<Tournament, "bracket_data" | "results_data"> & {
        bracket_data: BracketData | null;
        results_data: Record<string, unknown> | null;
      })
    | null;
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [tournament, setTournament] = useState<TournamentResponse["tournament"]>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [lockGroups, setLockGroups] = useState("");
  const [lockKnockout, setLockKnockout] = useState("");
  const [bracketData, setBracketData] = useState<BracketData | null>(null);

  const fetchTournament = useCallback(() => {
    fetch("/api/tournaments")
      .then((r) => r.json())
      .then((d: TournamentResponse) => setTournament(d.tournament))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchTournament();
  }, [fetchTournament]);

  const handleSeedTournament = async () => {
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: SEED_TOURNAMENT_NAME,
          year: SEED_TOURNAMENT_YEAR,
          lock_time_groups: SEED_LOCK_GROUPS,
          lock_time_knockout: SEED_LOCK_KNOCKOUT,
          bracket_data: WORLD_CUP_2026_DATA,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to seed tournament");
      setSuccess("Test tournament seeded successfully!");
      fetchTournament();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUseWorldCupData = () => {
    setBracketData(WORLD_CUP_2026_DATA);
    setSuccess("Loaded 2026 World Cup data (48 teams, 12 groups)");
  };

  const handleSubmit = async () => {
    setError("");
    setSuccess("");
    if (!name.trim() || !year.trim()) {
      setError("Name and year are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          year: Number(year),
          lock_time_groups: lockGroups || null,
          lock_time_knockout: lockKnockout || null,
          bracket_data: bracketData,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to create tournament");
      setSuccess("Tournament created successfully!");
      setName("");
      setYear("");
      setLockGroups("");
      setLockKnockout("");
      setBracketData(null);
      fetchTournament();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user?.is_admin) {
    return (
      <Box sx={{ maxWidth: 600, mx: "auto", py: 4, px: 2, textAlign: "center" }}>
        <Typography variant="h5" color="error">
          Access Denied
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          You must be an admin to view this page.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 700, mx: "auto", py: 4, px: 2 }}>
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        Admin Panel
      </Typography>

      {tournament && (
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Current Tournament
            </Typography>
            <Typography>
              {tournament.name} {tournament.year}
            </Typography>
            {tournament.lock_time_groups && (
              <Typography variant="body2" color="text.secondary">
                Groups lock: {new Date(tournament.lock_time_groups).toLocaleString()}
              </Typography>
            )}
            {tournament.lock_time_knockout && (
              <Typography variant="body2" color="text.secondary">
                Knockout locks: {new Date(tournament.lock_time_knockout).toLocaleString()}
              </Typography>
            )}
            {tournament.bracket_data && (
              <Chip
                label={`${tournament.bracket_data.groups.length} groups loaded`}
                size="small"
                color="primary"
                sx={{ mt: 1 }}
              />
            )}
          </CardContent>
        </Card>
      )}

      {!tournament && (
        <Card sx={{ mb: 4 }}>
          <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
            <Typography variant="h6">Quick Setup</Typography>
            <Typography variant="body2" color="text.secondary">
              No tournament exists. Seed a test tournament with 2026 World Cup data.
            </Typography>
            <Button
              variant="contained"
              color="secondary"
              onClick={handleSeedTournament}
              disabled={submitting}
              startIcon={submitting ? <CircularProgress size={20} color="inherit" /> : null}
            >
              Seed Test Tournament
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Typography variant="h6">Create Tournament</Typography>

          <TextField
            fullWidth
            label="Tournament Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
          />
          <TextField
            fullWidth
            label="Year"
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            disabled={submitting}
          />
          <TextField
            fullWidth
            label="Group Predictions Lock Time"
            type="datetime-local"
            value={lockGroups}
            onChange={(e) => setLockGroups(e.target.value)}
            disabled={submitting}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            fullWidth
            label="Knockout Predictions Lock Time"
            type="datetime-local"
            value={lockKnockout}
            onChange={(e) => setLockKnockout(e.target.value)}
            disabled={submitting}
            slotProps={{ inputLabel: { shrink: true } }}
          />

          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Button
              variant="outlined"
              onClick={handleUseWorldCupData}
              disabled={submitting}
            >
              Use 2026 World Cup Data
            </Button>
            {bracketData && (
              <Chip
                label={`${bracketData.groups.length} groups, ${bracketData.groups.length * 4} teams`}
                color="success"
                size="small"
              />
            )}
          </Box>

          {error && <Alert severity="error">{error}</Alert>}
          {success && <Alert severity="success">{success}</Alert>}

          <Button
            fullWidth
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting || !name.trim() || !year.trim()}
            startIcon={submitting ? <CircularProgress size={20} color="inherit" /> : null}
          >
            Create Tournament
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
