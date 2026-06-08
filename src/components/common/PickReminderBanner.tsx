"use client";
import { useState, useEffect } from "react";
import { Alert, AlertTitle, Box } from "@mui/material";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import type { Tournament, UserPrediction, BracketData, GroupPrediction } from "@/types";

const HOURS_BEFORE_LOCK = 24;

const KNOCKOUT_MATCH_COUNT = 31; // 16 R32 + 8 R16 + 4 QF + 2 SF + 1 3rd + 1 Final
const THIRD_PLACE_PICK_COUNT = 8;

interface BannerState {
  severity: 'error' | 'warning';
  title: string;
  /** Specific list of missing items, e.g. ["3rd-place teams: 8 needed, you've picked 5"] */
  details: string[];
  href: string;
  cta: string;
}

function isWithinLockWindow(lockTime: string | null): boolean {
  if (!lockTime) return false;
  const lock = new Date(lockTime).getTime();
  const now = Date.now();
  return now < lock && lock - now < HOURS_BEFORE_LOCK * 60 * 60 * 1000;
}

function isLocked(lockTime: string | null): boolean {
  if (!lockTime) return false;
  return Date.now() >= new Date(lockTime).getTime();
}

/** Check group predictions: each of N groups must have a complete order of 4. */
function findIncompleteGroups(
  prediction: UserPrediction | null,
  bracketData: BracketData | null,
): string[] {
  if (!bracketData?.groups?.length) return [];
  const predByGroup = new Map<string, GroupPrediction>();
  for (const gp of prediction?.group_predictions ?? []) {
    predByGroup.set(gp.groupName, gp);
  }
  const missing: string[] = [];
  for (const g of bracketData.groups) {
    const p = predByGroup.get(g.name);
    if (!p || !Array.isArray(p.order) || p.order.length < 4) {
      missing.push(g.name);
    }
  }
  return missing;
}

function thirdPlacePicksMissing(prediction: UserPrediction | null): number {
  const picks = prediction?.third_place_picks ?? [];
  return Math.max(0, THIRD_PLACE_PICK_COUNT - picks.length);
}

function knockoutPicksMissing(prediction: UserPrediction | null): number {
  const picks = prediction?.knockout_picks ?? {};
  return Math.max(0, KNOCKOUT_MATCH_COUNT - Object.keys(picks).length);
}

function buildBannerState(
  prediction: UserPrediction | null,
  bracketData: BracketData | null,
  tournament: Tournament,
  hasKnockoutBracket: boolean,
): BannerState | null {
  const groupsLockTime = tournament.lock_time_groups;
  const koLockTime = tournament.lock_time_knockout;

  // GROUP STAGE: still pickable until groupsLockTime passes.
  if (!isLocked(groupsLockTime)) {
    const incompleteGroups = findIncompleteGroups(prediction, bracketData);
    const thirdMissing = thirdPlacePicksMissing(prediction);
    if (incompleteGroups.length > 0 || thirdMissing > 0) {
      const details: string[] = [];
      if (incompleteGroups.length > 0) {
        details.push(
          `Group order missing for: ${incompleteGroups.join(', ')}`,
        );
      }
      if (thirdMissing > 0) {
        details.push(
          `Third-place picks: ${THIRD_PLACE_PICK_COUNT - thirdMissing}/${THIRD_PLACE_PICK_COUNT} selected — pick ${thirdMissing} more`,
        );
      }
      return {
        severity: isWithinLockWindow(groupsLockTime) ? 'error' : 'warning',
        title: isWithinLockWindow(groupsLockTime)
          ? '⏰ Group predictions lock soon — your picks are incomplete'
          : 'Your group predictions are incomplete',
        details,
        href: '/bracket',
        cta: 'Finish my picks →',
      };
    }
  }

  // KNOCKOUT: only check after groups are locked AND bracket is generated.
  if (isLocked(groupsLockTime) && hasKnockoutBracket && !isLocked(koLockTime)) {
    const koMissing = knockoutPicksMissing(prediction);
    if (koMissing > 0) {
      return {
        severity: isWithinLockWindow(koLockTime) ? 'error' : 'warning',
        title: isWithinLockWindow(koLockTime)
          ? '⏰ Knockout bracket locks soon — your picks are incomplete'
          : 'Your knockout bracket is incomplete',
        details: [`Knockout matches: ${KNOCKOUT_MATCH_COUNT - koMissing}/${KNOCKOUT_MATCH_COUNT} picked — pick ${koMissing} more`],
        href: '/bracket/knockout',
        cta: 'Finish my bracket →',
      };
    }
  }

  return null;
}

export default function PickReminderBanner() {
  const { user, loading: authLoading } = useAuth();
  const [banner, setBanner] = useState<BannerState | null>(null);

  useEffect(() => {
    if (authLoading || !user) {
      setBanner(null);
      return;
    }

    let cancelled = false;

    async function check() {
      try {
        const [tRes, pRes] = await Promise.all([
          fetch("/api/tournaments").then((r) => r.json()),
          fetch("/api/picks").then((r) => r.json()),
        ]);

        if (cancelled) return;

        const tournament: Tournament | null = tRes.tournament ?? null;
        if (!tournament) {
          setBanner(null);
          return;
        }

        const bracketData = typeof tournament.bracket_data === "string"
          ? JSON.parse(tournament.bracket_data || "{}")
          : tournament.bracket_data;

        const prediction: UserPrediction | null = pRes.prediction ?? null;
        const resultsData = typeof tournament.results_data === "string"
          ? JSON.parse(tournament.results_data || "{}")
          : tournament.results_data;
        const hasKnockoutBracket = !!resultsData?.knockoutBracket;

        setBanner(buildBannerState(prediction, bracketData, tournament, hasKnockoutBracket));
      } catch {
        // silently ignore
      }
    }

    check();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  if (!banner) return null;

  return (
    <Box sx={{ px: 2, pt: 1 }}>
      <Alert severity={banner.severity}>
        <AlertTitle sx={{ fontWeight: 700 }}>{banner.title}</AlertTitle>
        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
          {banner.details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </Box>
        <Box sx={{ mt: 1 }}>
          <Link href={banner.href} style={{ fontWeight: 700, color: 'inherit' }}>
            {banner.cta}
          </Link>
        </Box>
      </Alert>
    </Box>
  );
}
