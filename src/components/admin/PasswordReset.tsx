'use client';
import { useState } from 'react';
import {
  Box, Card, CardContent, Typography, TextField, Button, Alert, CircularProgress,
} from '@mui/material';

const MIN_LEN = 4;

export default function PasswordReset() {
  const [username, setUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);

  const canSubmit = username.trim().length > 0 && newPassword.length >= MIN_LEN && !submitting;

  const handleSubmit = async () => {
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset_password',
          username: username.trim(),
          new_password: newPassword,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setResult({ kind: 'success', msg: `Password reset for "${username.trim()}".` });
        setUsername('');
        setNewPassword('');
      } else {
        setResult({ kind: 'error', msg: data.error ?? 'Failed to reset password.' });
      }
    } catch {
      setResult({ kind: 'error', msg: 'Network error.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card sx={{ mb: 4 }}>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box>
          <Typography variant="h6">Reset User Password</Typography>
          <Typography variant="body2" color="text.secondary">
            Sets a new password for a non-admin user. Admins and your own account cannot be reset here.
          </Typography>
        </Box>
        <TextField
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          size="small"
          autoComplete="off"
          disabled={submitting}
        />
        <TextField
          label="New password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          size="small"
          // Not autocomplete="new-password" because we're not the user setting their own;
          // an admin types a password they intend to hand over verbally.
          autoComplete="off"
          disabled={submitting}
          helperText={`Minimum ${MIN_LEN} characters`}
        />
        <Button
          variant="contained"
          color="warning"
          onClick={handleSubmit}
          disabled={!canSubmit}
          startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : null}
          sx={{ alignSelf: 'flex-start' }}
        >
          Reset Password
        </Button>
        {result && (
          <Alert severity={result.kind} onClose={() => setResult(null)}>{result.msg}</Alert>
        )}
      </CardContent>
    </Card>
  );
}
