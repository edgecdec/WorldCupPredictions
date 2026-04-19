"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  Typography,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableSortLabel,
  Box,
  TextField,
  Button,
  Autocomplete,
  Alert,
  CircularProgress,
} from "@mui/material";

interface GroupOption {
  id: string;
  name: string;
  invite_code: string;
  creator_name: string;
  member_count: number;
}

interface UserOption {
  id: string;
  username: string;
}

type SortKey = "name" | "member_count" | "creator_name";
type SortDir = "asc" | "desc";

export default function GroupManagement() {
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<GroupOption | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list_groups" }),
      });
      const data = await res.json();
      if (data.ok) setGroups(data.groups);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  useEffect(() => {
    if (!userQuery.trim()) {
      setUserOptions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "search_users", query: userQuery }),
        });
        const data = await res.json();
        if (data.ok) setUserOptions(data.users);
      } catch {
        /* ignore */
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [userQuery]);

  const handleAdd = async () => {
    if (!selectedGroup || !selectedUser) return;
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_to_group",
          group_id: selectedGroup.id,
          username: selectedUser.username,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to add user");
      setSuccess(`Added ${selectedUser.username} to ${selectedGroup.name}`);
      setSelectedUser(null);
      setUserQuery("");
      fetchGroups();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSort = (key: SortKey) => {
    setSortDir(sortKey === key && sortDir === "asc" ? "desc" : "asc");
    setSortKey(key);
  };

  const sorted = [...groups].sort((a, b) => {
    const mul = sortDir === "asc" ? 1 : -1;
    if (sortKey === "member_count") return (a.member_count - b.member_count) * mul;
    return a[sortKey].localeCompare(b[sortKey]) * mul;
  });

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <Card sx={{ mb: 4 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Group Management
        </Typography>

        <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap", alignItems: "center" }}>
          <Autocomplete
            options={groups}
            getOptionLabel={(g) => `${g.name} (${g.member_count} members)`}
            value={selectedGroup}
            onChange={(_, v) => setSelectedGroup(v)}
            sx={{ minWidth: 250, flex: 1 }}
            renderInput={(params) => <TextField {...params} label="Select Group" size="small" />}
          />
          <Autocomplete
            options={userOptions}
            getOptionLabel={(u) => u.username}
            value={selectedUser}
            onChange={(_, v) => setSelectedUser(v)}
            inputValue={userQuery}
            onInputChange={(_, v) => setUserQuery(v)}
            sx={{ minWidth: 200, flex: 1 }}
            filterOptions={(x) => x}
            noOptionsText={userQuery ? "No users found" : "Type to search"}
            renderInput={(params) => <TextField {...params} label="Search User" size="small" />}
          />
          <Button
            variant="contained"
            onClick={handleAdd}
            disabled={submitting || !selectedGroup || !selectedUser}
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : null}
          >
            Add to Group
          </Button>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>
                <TableSortLabel active={sortKey === "name"} direction={sortKey === "name" ? sortDir : "asc"} onClick={() => handleSort("name")}>
                  Group
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel active={sortKey === "member_count"} direction={sortKey === "member_count" ? sortDir : "asc"} onClick={() => handleSort("member_count")}>
                  Members
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel active={sortKey === "creator_name"} direction={sortKey === "creator_name" ? sortDir : "asc"} onClick={() => handleSort("creator_name")}>
                  Creator
                </TableSortLabel>
              </TableCell>
              <TableCell>Invite Code</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.map((g) => (
              <TableRow key={g.id}>
                <TableCell>{g.name}</TableCell>
                <TableCell>{g.member_count}</TableCell>
                <TableCell>{g.creator_name}</TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: "monospace", color: "text.secondary" }}>
                    {g.invite_code}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
