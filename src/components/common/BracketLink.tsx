'use client';
import { Box } from '@mui/material';
import Link from 'next/link';

interface BracketLinkProps {
  username: string;
  bracketName: string;
}

/**
 * Bracket name → /bracket/[username] (the user's public picks page).
 * Used in tables alongside UserLink. Bracket name is the display, the route
 * targets the username (we don't have per-bracket routes; users have one
 * bracket on this site).
 */
export default function BracketLink({ username, bracketName }: BracketLinkProps) {
  return (
    <Box
      component={Link}
      href={`/bracket/${encodeURIComponent(username)}`}
      sx={{
        color: 'primary.main',
        textDecoration: 'none',
        '&:hover': { textDecoration: 'underline' },
      }}
    >
      {bracketName}
    </Box>
  );
}
