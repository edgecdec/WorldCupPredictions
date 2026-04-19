"use client";
import { useState } from "react";
import {
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Tabs,
  Tab,
  Alert,
  CircularProgress,
} from "@mui/material";
import { useAuth } from "@/hooks/useAuth";

const USERNAME_MAX_LENGTH = 32;
const PASSWORD_MAX_LENGTH = 128;

export default function AuthForm() {
  const { login, register } = useAuth();
  const [tab, setTab] = useState(0);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!username.trim() || !password) return;
    setError("");
    setSubmitting(true);
    try {
      if (tab === 0) await login(username.trim(), password);
      else await register(username.trim(), password);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card sx={{ width: "100%", maxWidth: 400, mx: "auto" }}>
      <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Typography variant="h5" align="center">
          ⚽ World Cup Predictions
        </Typography>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} centered>
          <Tab label="Login" />
          <Tab label="Register" />
        </Tabs>
        <TextField
          fullWidth
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          slotProps={{ htmlInput: { maxLength: USERNAME_MAX_LENGTH } }}
          disabled={submitting}
        />
        <TextField
          fullWidth
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          slotProps={{ htmlInput: { maxLength: PASSWORD_MAX_LENGTH } }}
          disabled={submitting}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />
        {error && <Alert severity="error">{error}</Alert>}
        <Button
          fullWidth
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || !username.trim() || !password}
          startIcon={submitting ? <CircularProgress size={20} color="inherit" /> : null}
        >
          {tab === 0 ? "Login" : "Register"}
        </Button>
      </CardContent>
    </Card>
  );
}
