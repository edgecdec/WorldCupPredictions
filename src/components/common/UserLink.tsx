'use client';
import { Box, Chip } from '@mui/material';
import Link from 'next/link';

interface UserLinkProps {
  username: string;
  /** When true, shows a "You" chip after the username. */
  isCurrentUser?: boolean;
  /** When true, applies bold styling. */
  bold?: boolean;
}

/**
 * Username link → /profile/[username]. Used everywhere a username appears
 * in tables / stats / leaderboards. Renders just the text + an optional "You"
 * chip; styling (color, font weight) inherits from the wrapping cell.
 */
export default function UserLink({ username, isCurrentUser, bold }: UserLinkProps) {
  return (
    <>
      <Box
        component={Link}
        href={`/profile/${encodeURIComponent(username)}`}
        sx={{
          color: 'primary.main',
          textDecoration: 'none',
          fontWeight: bold ? 700 : undefined,
          '&:hover': { textDecoration: 'underline' },
        }}
      >
        {username}
      </Box>
      {isCurrentUser && (
        <Chip
          label="You"
          size="small"
          color="primary"
          variant="outlined"
          sx={{ ml: 1, height: 18, fontSize: '0.65rem' }}
        />
      )}
    </>
  );
}
