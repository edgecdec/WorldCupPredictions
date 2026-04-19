"use client";
import { useState, useEffect } from "react";
import { Alert, AlertTitle, Box, IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import type { Tournament, UserPrediction, BracketData } from "@/types";

const HOURS_BEFORE_LOCK = 24;
const DISMISS_KEY = "pick-reminder-dismissed";

function isWithinWindow(lockTime: string | null): boolean {
  if (!lockTime) return false;
  const lock = new Date(lockTime).getTime();
  const now = Date.now();
  return now < lock && lock - now < HOURS_BEFORE_LOCK * 60 * 60 * 1000;
}

function groupsIncomplete(prediction: UserPrediction | null, bracketData: BracketData | null): boolean {
  if (!prediction || !bracketData) return true;
  const groupCount = bracketData.groups?.length ?? 0;
  if (!prediction.group_predictions || prediction.group_predictions.length < groupCount) return true;
  if (!prediction.third_place_picks || prediction.third_place_picks.length < 8) return true;
  return false;
}

function knockoutIncomplete(prediction: UserPrediction | null, hasKnockout: boolean): boolean {
  if (!hasKnockout) return false; // knockout not available yet
  if (!prediction) return true;
  const picks = prediction.knockout_picks;
  return !picks || Object.keys(picks).length === 0;
}

export default function PickReminderBanner() {
  const { user, loading: authLoading } = useAuth();
  const [dismissed, setDismissed] = useState(true);
  const [message, setMessage] = useState<{ text: string; href: string } | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem(DISMISS_KEY);
    setDismissed(stored === "true");
  }, []);

  useEffect(() => {
    if (authLoading || !user || dismissed) return;

    let cancelled = false;

    async function check() {
      try {
        const [tRes, pRes] = await Promise.all([
          fetch("/api/tournaments").then((r) => r.json()),
          fetch("/api/picks").then((r) => r.json()),
        ]);

        if (cancelled) return;

        const tournament: Tournament | null = tRes.tournament ?? null;
        if (!tournament) return;

        const bracketData = typeof tournament.bracket_data === "string"
          ? JSON.parse(tournament.bracket_data || "{}")
          : tournament.bracket_data;

        const prediction: UserPrediction | null = pRes.prediction ?? null;
        const resultsData = typeof tournament.results_data === "string"
          ? JSON.parse(tournament.results_data || "{}")
          : tournament.results_data;
        const hasKnockout = !!resultsData?.groupStage;

        if (isWithinWindow(tournament.lock_time_groups) && groupsIncomplete(prediction, bracketData)) {
          setMessage({ text: "Group stage predictions lock soon! Complete your picks before time runs out.", href: "/bracket" });
        } else if (isWithinWindow(tournament.lock_time_knockout) && knockoutIncomplete(prediction, hasKnockout)) {
          setMessage({ text: "Knockout bracket predictions lock soon! Complete your picks before time runs out.", href: "/bracket/knockout" });
        }
      } catch {
        // silently ignore
      }
    }

    check();
    return () => { cancelled = true; };
  }, [user, authLoading, dismissed]);

  if (dismissed || !message) return null;

  return (
    <Box sx={{ px: 2, pt: 1 }}>
      <Alert
        severity="warning"
        action={
          <IconButton
            aria-label="dismiss"
            size="small"
            onClick={() => {
              setDismissed(true);
              sessionStorage.setItem(DISMISS_KEY, "true");
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        }
      >
        <AlertTitle>Reminder</AlertTitle>
        {message.text}{" "}
        <Link href={message.href} style={{ fontWeight: "bold", color: "inherit" }}>
          Go to predictions →
        </Link>
      </Alert>
    </Box>
  );
}
