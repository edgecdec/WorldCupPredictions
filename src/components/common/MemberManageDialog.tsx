"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  List, ListItem, ListItemText, IconButton, Typography,
  CircularProgress, Box,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

interface Member {
  prediction_id: string;
  username: string;
  bracket_name: string;
}

interface Props {
  groupId: string | null;
  groupName: string;
  onClose: () => void;
  onRemoved: () => void;
}

export default function MemberManageDialog({ groupId, groupName, onClose, onRemoved }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<Member | null>(null);
  const [removing, setRemoving] = useState(false);

  const loadMembers = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/groups?members=${groupId}`);
      const data = await res.json();
      if (data.members) setMembers(data.members);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    if (groupId) loadMembers();
  }, [groupId, loadMembers]);

  const handleRemove = async () => {
    if (!confirmTarget || !groupId) return;
    setRemoving(true);
    try {
      const res = await fetch("/api/groups", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remove_member",
          group_id: groupId,
          prediction_id: confirmTarget.prediction_id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConfirmTarget(null);
      loadMembers();
      onRemoved();
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <Dialog open={!!groupId} onClose={onClose} maxWidth="xs" fullWidth>
        <DialogTitle>Members — {groupName}</DialogTitle>
        <DialogContent>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          ) : members.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 2 }}>No members yet.</Typography>
          ) : (
            <List dense>
              {members.map((m) => (
                <ListItem
                  key={m.prediction_id}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={() => setConfirmTarget(m)}
                      title={`Remove ${m.username}`}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={m.username}
                    secondary={m.bracket_name || undefined}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!confirmTarget} onClose={() => setConfirmTarget(null)} maxWidth="xs">
        <DialogTitle>Remove Member</DialogTitle>
        <DialogContent>
          <Typography>
            Remove <strong>{confirmTarget?.username}</strong> from {groupName}?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleRemove} disabled={removing}>
            {removing ? "Removing…" : "Remove"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
