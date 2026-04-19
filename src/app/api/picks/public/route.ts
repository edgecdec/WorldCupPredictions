import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Tournament } from '@/types';

interface PredictionRow {
  id: string;
  user_id: string;
  tournament_id: string;
  bracket_name: string;
  group_predictions: string;
  third_place_picks: string;
  knockout_picks: string;
  tiebreaker: number | null;
  submitted_at: string;
}

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get('username');
  if (!username) {
    return NextResponse.json({ error: 'username required' }, { status: 400 });
  }

  const db = getDb();

  const tournament = db
    .prepare('SELECT * FROM tournaments ORDER BY year DESC LIMIT 1')
    .get() as Tournament | undefined;
  if (!tournament) {
    return NextResponse.json({ ok: true, prediction: null });
  }

  const row = db
    .prepare(
      `SELECT p.* FROM predictions p
       JOIN users u ON p.user_id = u.id
       WHERE LOWER(u.username) = LOWER(?) AND p.tournament_id = ?`
    )
    .get(username, tournament.id) as PredictionRow | undefined;

  if (!row) {
    return NextResponse.json({ ok: true, prediction: null });
  }

  return NextResponse.json({
    ok: true,
    prediction: {
      bracket_name: row.bracket_name,
      group_predictions: JSON.parse(row.group_predictions),
      third_place_picks: JSON.parse(row.third_place_picks),
      knockout_picks: JSON.parse(row.knockout_picks),
      tiebreaker: row.tiebreaker,
    },
  });
}
