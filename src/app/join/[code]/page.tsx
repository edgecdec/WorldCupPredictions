"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Container, Typography, Button, Paper, Box, CircularProgress, Alert,
} from "@mui/material";
import GroupIcon from "@mui/icons-material/Group";
import { useAuth } from "@/hooks/useAuth";
import AuthForm from "@/components/auth/AuthForm";

interface GroupInfo {
  id: string;
  name: string;
  creator_name: string;
  member_count: number;
  is_member: boolean;
}

export default function JoinGroupPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  const loadGroup = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups?invite_code=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Group not found");
        return;
      }
      setGroup(data.group);
    } catch {
      setError("Failed to load group");
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    if (user && code) loadGroup();
  }, [user, code, loadGroup]);

  const handleJoin = async () => {
    setJoining(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join",
          invite_code: code,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/leaderboard?group=${data.group_id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to join group");
      setJoining(false);
    }
  };

  if (authLoading) return null;

  if (!user) {
    return (
      <Container maxWidth="sm" sx={{ mt: 6 }}>
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <GroupIcon sx={{ fontSize: 48, color: "primary.main", mb: 2 }} />
          <Typography variant="h5" gutterBottom>
            Join a Prediction Group
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Log in or register to join this group
          </Typography>
          <AuthForm />
        </Paper>
      </Container>
    );
  }

  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ mt: 6, textAlign: "center" }}>
        <CircularProgress />
      </Container>
    );
  }

  if (error && !group) {
    return (
      <Container maxWidth="sm" sx={{ mt: 6 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  if (!group) return null;

  return (
    <Container maxWidth="sm" sx={{ mt: 6 }}>
      <Paper sx={{ p: 4, textAlign: "center" }}>
        <GroupIcon sx={{ fontSize: 48, color: "primary.main", mb: 2 }} />
        <Typography variant="h5" gutterBottom>
          ⚽ {group.name}
        </Typography>
        <Typography color="text.secondary" gutterBottom>
          Created by {group.creator_name} · {group.member_count} member
          {group.member_count !== 1 ? "s" : ""}
        </Typography>
        {error && <Alert severity="error" sx={{ mt: 2, mb: 2 }}>{error}</Alert>}
        {group.is_member ? (
          <Box sx={{ mt: 3 }}>
            <Typography color="success.main" gutterBottom>
              ✅ You&apos;re already in this group!
            </Typography>
            <Button variant="contained" href={`/leaderboard?group=${group.id}`} sx={{ mt: 1 }}>
              View Leaderboard
            </Button>
          </Box>
        ) : (
          <Button
            variant="contained"
            size="large"
            onClick={handleJoin}
            disabled={joining}
            sx={{ mt: 3 }}
          >
            {joining ? <CircularProgress size={24} /> : "Join Group"}
          </Button>
        )}
      </Paper>
    </Container>
  );
}
