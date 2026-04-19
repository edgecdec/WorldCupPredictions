import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { Tournament } from "@/types";

export async function GET() {
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
