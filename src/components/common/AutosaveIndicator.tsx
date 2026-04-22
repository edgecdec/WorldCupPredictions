import { Box, Typography, CircularProgress } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import EditIcon from '@mui/icons-material/Edit';
import type { AutosaveStatus } from '@/hooks/useAutosave';

const STATUS_CONFIG: Record<AutosaveStatus, { icon: React.ReactNode; label: string; color: string } | null> = {
  idle: null,
  unsaved: { icon: <EditIcon sx={{ fontSize: 16 }} />, label: 'Unsaved changes', color: 'warning.main' },
  saving: { icon: <CircularProgress size={14} />, label: 'Saving…', color: 'text.secondary' },
  saved: { icon: <CheckCircleIcon sx={{ fontSize: 16 }} />, label: 'Saved', color: 'success.main' },
  error: { icon: <ErrorOutlineIcon sx={{ fontSize: 16 }} />, label: 'Save failed', color: 'error.main' },
};

export default function AutosaveIndicator({ status }: { status: AutosaveStatus }) {
  const config = STATUS_CONFIG[status];
  if (!config) return null;

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: config.color }}>
      {config.icon}
      <Typography variant="caption" color="inherit">{config.label}</Typography>
    </Box>
  );
}
