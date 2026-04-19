import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import type { ScoringSettings } from '@/types';
import { DEFAULT_SCORING } from '@/types';

interface PredictionRow {
  id: string;
  user_id: string;
  bracket_name: string;
  group_predictions: string;
  third_place_picks: string;
  knockout_picks: string;
  tiebreaker: number | null;
  username: string;
}

interface GroupRow {
  scoring_settings: string;
}

interface TournamentRow {
  bracket_data: string;
  results_data: string;
}

export async function GET(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const groupId = req.nextUrl.searchParams.get('group_id');
  if (!groupId) {
    return NextResponse.json({ error: 'group_id required' }, { status: 400 });
  }

  const db = getDb();

  const group = db
    .prepare('SELECT scoring_settings FROM groups WHERE id = ?')
    .get(groupId) as GroupRow | undefined;
  if (!group) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  }

  const parsed = JSON.parse(group.scoring_settings) as ScoringSettings;
  const settings = parsed.groupStage && parsed.knockout ? parsed : DEFAULT_SCORING;

  const tournament = db
    .prepare('SELECT bracket_data, results_data FROM tournaments ORDER BY year DESC LIMIT 1')
    .get() as TournamentRow | undefined;
  if (!tournament) {
    return NextResponse.json({ error: 'No tournament found' }, { status: 404 });
  }

  const predictions = db
    .prepare(
      `SELECT p.id, p.user_id, p.bracket_name, p.group_predictions,
              p.third_place_picks, p.knockout_picks, p.tiebreaker, u.username
       FROM predictions p
       JOIN users u ON p.user_id = u.id
       JOIN group_members gm ON gm.prediction_id = p.id
       WHERE gm.group_id = ?`
    )
    .all(groupId) as PredictionRow[];

  const entries = predictions.map((p) => ({
    username: p.username,
    bracket_name: p.bracket_name,
    group_predictions: JSON.parse(p.group_predictions),
    third_place_picks: JSON.parse(p.third_place_picks),
    knockout_picks: JSON.parse(p.knockout_picks),
    tiebreaker: p.tiebreaker,
  }));

  return NextResponse.json({
    scoring: settings,
    bracket_data: JSON.parse(tournament.bracket_data),
    results: JSON.parse(tournament.results_data),
    entries,
  });
}
