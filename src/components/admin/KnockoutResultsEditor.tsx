'use client';
import { useState, useCallback } from 'react';
import { Box, Typography, Button, Card, CardContent, Alert, CircularProgress } from '@mui/material';
import KnockoutBracket from '@/components/bracket/KnockoutBracket';
import { cascadeClear } from '@/lib/bracketUtils';
import type { KnockoutMatchup, KnockoutResults } from '@/types';

interface KnockoutResultsEditorProps {
  matchups: KnockoutMatchup[];
  existingResults?: KnockoutResults | null;
  onSaved: () => void;
}

export default function KnockoutResultsEditor({ matchups, existingResults, onSaved }: KnockoutResultsEditorProps) {
  const [results, setResults] = useState<KnockoutResults>(existingResults ?? {});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handlePick = useCallback(
    (matchupId: string, team: string) => {
      setResults((prev) => {
        const cleared = cascadeClear(prev, matchupId, matchups);
        return { ...cleared, [matchupId]: team };
      });
    },
    [matchups],
  );

  const handleSubmit = async () => {
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_knockout_results', knockoutResults: results }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to save knockout results');
      setSuccess('Knockout results saved!');
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const pickedCount = Object.keys(results).length;

  return (
    <Card sx={{ mb: 4 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Knockout Results
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Click on the winning team for each match to record results. ({pickedCount} of {matchups.length} matches set)
        </Typography>

        <Box sx={{ overflowX: 'auto' }}>
          <KnockoutBracket
            matchups={matchups}
            picks={results}
            onPick={handlePick}
          />
        </Box>

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mt: 2 }}>{success}</Alert>}

        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || pickedCount === 0}
          startIcon={submitting ? <CircularProgress size={20} color="inherit" /> : null}
          sx={{ mt: 2 }}
        >
          Save Knockout Results
        </Button>
      </CardContent>
    </Card>
  );
}
