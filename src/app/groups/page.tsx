"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Container, Typography, Button, TextField, Box, Paper, IconButton,
  Snackbar, Alert, Chip, Dialog, DialogTitle, DialogContent, DialogActions,
  CircularProgress, Tooltip,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import GroupIcon from "@mui/icons-material/Group";
import AddIcon from "@mui/icons-material/Add";
import LoginIcon from "@mui/icons-material/Login";
import PublicIcon from "@mui/icons-material/Public";
import SettingsIcon from "@mui/icons-material/Settings";
import PeopleIcon from "@mui/icons-material/People";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import { useAuth } from "@/hooks/useAuth";
import AuthForm from "@/components/auth/AuthForm";
import ScoringEditor from "@/components/common/ScoringEditor";
import MemberManageDialog from "@/components/common/MemberManageDialog";
import type { ScoringSettings, UserPrediction } from "@/types";
import { DEFAULT_SCORING } from "@/types";

interface GroupInfo {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  creator_name: string;
  member_count: number;
  scoring_settings: ScoringSettings;
  max_brackets: number | null;
  submissions_locked: number;
}

const MAX_GROUP_NAME_LENGTH = 50;

export default function GroupsPage() {
  const { user, loading: authLoading } = useAuth();
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [snack, setSnack] = useState("");
  const [snackSeverity, setSnackSeverity] = useState<"success" | "error">("success");

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createScoring, setCreateScoring] = useState<ScoringSettings>(DEFAULT_SCORING);
  const [createMaxBrackets, setCreateMaxBrackets] = useState<string>("");
  const [creating, setCreating] = useState(false);

  // Join dialog state
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [prediction, setPrediction] = useState<UserPrediction | null>(null);

  // Edit scoring dialog state
  const [editGroup, setEditGroup] = useState<GroupInfo | null>(null);
  const [editScoring, setEditScoring] = useState<ScoringSettings>(DEFAULT_SCORING);
  const [saving, setSaving] = useState(false);

  // Member management state
  const [membersGroup, setMembersGroup] = useState<GroupInfo | null>(null);

  const showSnack = (msg: string, severity: "success" | "error" = "success") => {
    setSnackSeverity(severity);
    setSnack(msg);
  };

  const loadGroups = useCallback(async () => {
    try {
      const res = await fetch("/api/groups");
      const data = await res.json();
      if (data.groups) setGroups(data.groups);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPrediction = useCallback(async () => {
    const res = await fetch("/api/picks");
    const data = await res.json();
    if (data.prediction) setPrediction(data.prediction);
  }, []);

  useEffect(() => {
    if (user) {
      loadGroups();
      loadPrediction();
    }
  }, [user, loadGroups, loadPrediction]);

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: createName.trim(),
          scoring_settings: createScoring,
          max_brackets: createMaxBrackets ? Number(createMaxBrackets) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCreateOpen(false);
      setCreateName("");
      setCreateScoring(DEFAULT_SCORING);
      setCreateMaxBrackets("");
      showSnack("Group created!");
      loadGroups();
    } catch (e: unknown) {
      showSnack(e instanceof Error ? e.message : "Failed to create group", "error");
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join",
          invite_code: joinCode.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setJoinOpen(false);
      setJoinCode("");
      showSnack("Joined group!");
      loadGroups();
    } catch (e: unknown) {
      showSnack(e instanceof Error ? e.message : "Failed to join group", "error");
    } finally {
      setJoining(false);
    }
  };

  const copyInviteLink = (code: string) => {
    const url = `${window.location.origin}/join/${code}`;
    navigator.clipboard.writeText(url);
    showSnack("Invite link copied!");
  };

  const openEditScoring = (g: GroupInfo) => {
    setEditGroup(g);
    setEditScoring(g.scoring_settings);
  };

  const handleSaveScoring = async () => {
    if (!editGroup) return;
    setSaving(true);
    try {
      const res = await fetch("/api/groups", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: editGroup.id, scoring_settings: editScoring }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEditGroup(null);
      showSnack("Scoring settings updated!");
      loadGroups();
    } catch (e: unknown) {
      showSnack(e instanceof Error ? e.message : "Failed to update settings", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleLock = async (g: GroupInfo) => {
    try {
      const res = await fetch("/api/groups", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: g.id, submissions_locked: !g.submissions_locked }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showSnack(g.submissions_locked ? "Submissions unlocked" : "Submissions locked");
      loadGroups();
    } catch (e: unknown) {
      showSnack(e instanceof Error ? e.message : "Failed to toggle lock", "error");
    }
  };

  const scoringSummary = (s: ScoringSettings) =>
    `KO: ${s.knockout.pointsPerRound.join("/")}`;

  if (authLoading) return null;
  if (!user) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Typography variant="h4" gutterBottom>Groups</Typography>
        <AuthForm />
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h4">My Groups</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
            Create
          </Button>
          <Button variant="outlined" startIcon={<LoginIcon />} onClick={() => setJoinOpen(true)}>
            Join
          </Button>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      ) : groups.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <GroupIcon sx={{ fontSize: 48, color: "text.secondary", mb: 1 }} />
          <Typography color="text.secondary">
            You&apos;re not in any groups yet. Create one or join with an invite code!
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {[...groups].sort((a, b) => (a.id === "everyone" ? -1 : b.id === "everyone" ? 1 : 0)).map((g) => {
            const isEveryone = g.id === "everyone";
            const canEdit = g.created_by === user.id || (isEveryone && user.is_admin);
            return (
            <Paper key={g.id} sx={{ p: 2 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  {isEveryone && <PublicIcon color="primary" />}
                  <Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography variant="h6" component="a" href={`/leaderboard?group=${g.id}`}
                        sx={{ textDecoration: "none", color: "text.primary", "&:hover": { color: "primary.main" } }}>
                        {g.name}
                      </Typography>
                      <Tooltip title={scoringSummary(g.scoring_settings)}>
                        <Chip label={scoringSummary(g.scoring_settings)} size="small" variant="outlined" />
                      </Tooltip>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      {g.member_count} member{g.member_count !== 1 ? "s" : ""}{!isEveryone ? ` · Created by ${g.creator_name}` : ""}
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                  {canEdit && (
                    <>
                      {!isEveryone && (
                        <Tooltip title={g.submissions_locked ? "Unlock submissions" : "Lock submissions"}>
                          <IconButton size="small" onClick={() => handleToggleLock(g)}
                            color={g.submissions_locked ? "error" : "default"}>
                            {g.submissions_locked ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                      )}
                      <IconButton size="small" onClick={() => setMembersGroup(g)} title="Manage members">
                        <PeopleIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => openEditScoring(g)} title="Edit scoring settings">
                        <SettingsIcon fontSize="small" />
                      </IconButton>
                    </>
                  )}
                  {!isEveryone && g.submissions_locked && !canEdit && (
                    <Tooltip title="Submissions locked by group admin">
                      <LockIcon fontSize="small" color="error" />
                    </Tooltip>
                  )}
                  {!isEveryone && (
                    <>
                      <Chip label={g.invite_code} size="small" variant="outlined" />
                      <IconButton size="small" onClick={() => copyInviteLink(g.invite_code)} title="Copy invite link">
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </>
                  )}
                  <Button size="small" variant="outlined" href={`/leaderboard?group=${g.id}`}>
                    Leaderboard
                  </Button>
                </Box>
              </Box>
            </Paper>
            );
          })}
        </Box>
      )}

      {/* Create Group Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Group</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            <TextField
              label="Group Name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value.slice(0, MAX_GROUP_NAME_LENGTH))}
              helperText={createName.length >= 40 ? `${createName.length}/${MAX_GROUP_NAME_LENGTH}` : undefined}
              fullWidth
            />
            <TextField
              label="Max Brackets Per Member"
              type="number"
              value={createMaxBrackets}
              onChange={(e) => setCreateMaxBrackets(e.target.value)}
              placeholder="Unlimited"
              slotProps={{ htmlInput: { min: 1 } }}
              helperText="Leave empty for unlimited"
              fullWidth
            />
            <ScoringEditor value={createScoring} onChange={setCreateScoring} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={creating || !createName.trim()}>
            {creating ? "Creating…" : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Join Group Dialog */}
      <Dialog open={joinOpen} onClose={() => setJoinOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Join Group</DialogTitle>
        <DialogContent>
          <TextField
            label="Invite Code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.trim())}
            fullWidth
            sx={{ mt: 1 }}
            placeholder="Enter invite code"
          />
          {!prediction && (
            <Alert severity="info" sx={{ mt: 2 }}>
              An empty bracket will be created for you automatically when you join.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setJoinOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleJoin} disabled={joining || !joinCode.trim()}>
            {joining ? "Joining…" : "Join"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Scoring Dialog */}
      <Dialog open={!!editGroup} onClose={() => setEditGroup(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Scoring — {editGroup?.name}</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <ScoringEditor value={editScoring} onChange={setEditScoring} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditGroup(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveScoring} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Member Management Dialog */}
      {membersGroup && membersGroup.id !== "everyone" && (
        <MemberManageDialog
          groupId={membersGroup.id}
          groupName={membersGroup.name}
          onClose={() => setMembersGroup(null)}
          onRemoved={loadGroups}
        />
      )}

      <Snackbar open={!!snack} autoHideDuration={2000} onClose={() => setSnack("")}>
        <Alert severity={snackSeverity} onClose={() => setSnack("")}>{snack}</Alert>
      </Snackbar>
    </Container>
  );
}
