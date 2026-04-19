'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, TextField, IconButton, Typography, Paper } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import type { GroupMessage } from '@/types';

const POLL_INTERVAL_MS = 10_000;

export default function GroupChat({ groupId, currentUser }: { groupId: string; currentUser: string }) {
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/groups/messages?group_id=${groupId}`);
    const data = await res.json();
    if (data.messages) setMessages(data.messages);
  }, [groupId]);

  useEffect(() => {
    load();
    const iv = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await fetch('/api/groups/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: groupId, message: text.trim() }),
      });
      setText('');
      await load();
    } finally {
      setSending(false);
    }
  };

  return (
    <Box sx={{ mt: 1 }}>
      <Paper variant="outlined" sx={{ height: 250, overflowY: 'auto', p: 1, mb: 1, bgcolor: 'background.default' }}>
        {messages.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
            No messages yet. Start the conversation!
          </Typography>
        )}
        {messages.map((m) => (
          <Box key={m.id} sx={{ mb: 0.5 }}>
            <Typography
              variant="caption"
              color="primary"
              sx={{ fontWeight: m.username === currentUser ? 700 : 500 }}
            >
              {m.username}
            </Typography>
            <Typography variant="body2" sx={{ ml: 1, display: 'inline' }}>
              {m.message}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
              {new Date(m.created_at + 'Z').toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </Typography>
          </Box>
        ))}
        <div ref={bottomRef} />
      </Paper>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Type a message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          slotProps={{ htmlInput: { maxLength: 500 } }}
        />
        <IconButton color="primary" onClick={send} disabled={!text.trim() || sending}>
          <SendIcon />
        </IconButton>
      </Box>
    </Box>
  );
}
