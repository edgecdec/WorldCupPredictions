import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { syncEspnResults } from "@/lib/syncResults";
import type { Tournament } from "@/types";

export async function GET() {
  // Fire-and-forget auto-sync from ESPN. Debounced server-side, so calling
  // this on every page load is safe — at most one ESPN fetch per minute.
  // Errors are swallowed; we still return whatever data is in the DB.
  try {
    await syncEspnResults();
  } catch {
    // Ignore sync failures so they don't break tournament loads
  }

  const db = getDb();
  const row = db
    .prepare("SELECT * FROM tournaments ORDER BY year DESC LIMIT 1")
    .get() as Tournament | undefined;

  if (!row) {
    return NextResponse.json({ ok: true, tournament: null });
  }

  const tournament: Tournament = {
    ...row,
    bracket_data: JSON.parse(row.bracket_data as string),
    results_data: JSON.parse(row.results_data as string),
  };

  return NextResponse.json({ ok: true, tournament });
}
