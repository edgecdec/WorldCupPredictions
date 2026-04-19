"use client";
import { useState, useEffect } from "react";
import { Box, Typography } from "@mui/material";

interface CountdownTimerProps {
  targetDate: string; // ISO date string
  label?: string;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function calcTimeLeft(target: string): TimeLeft | null {
  const diff = new Date(target).getTime() - Date.now();
  if (diff <= 0) return null;
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

const UNIT_LABELS = ["Days", "Hours", "Min", "Sec"] as const;

export default function CountdownTimer({ targetDate, label }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(() => calcTimeLeft(targetDate));

  useEffect(() => {
    setTimeLeft(calcTimeLeft(targetDate));
    const id = setInterval(() => setTimeLeft(calcTimeLeft(targetDate)), 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  if (!timeLeft) {
    return (
      <Box sx={{ textAlign: "center", py: 1 }}>
        {label && (
          <Typography variant="caption" color="text.secondary" gutterBottom>
            {label}
          </Typography>
        )}
        <Typography variant="h6" color="error.main" fontWeight="bold">
          Locked
        </Typography>
      </Box>
    );
  }

  const values = [timeLeft.days, timeLeft.hours, timeLeft.minutes, timeLeft.seconds];

  return (
    <Box sx={{ textAlign: "center", py: 1 }}>
      {label && (
        <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
          {label}
        </Typography>
      )}
      <Box sx={{ display: "flex", justifyContent: "center", gap: 2 }}>
        {values.map((val, i) => (
          <Box key={UNIT_LABELS[i]} sx={{ textAlign: "center", minWidth: 48 }}>
            <Typography variant="h5" fontWeight="bold" color="primary.main">
              {String(val).padStart(2, "0")}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {UNIT_LABELS[i]}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
