import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import type { Tournament, GroupPrediction, TournamentResults } from "@/types";

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

function getActiveTournament(): Tournament | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM tournaments ORDER BY year DESC LIMIT 1")
    .get() as Tournament | undefined;
  if (!row) return null;
  return {
    ...row,
    bracket_data: JSON.parse(row.bracket_data as string),
    results_data: JSON.parse(row.results_data as string),
  };
}

export async function GET(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tournament = getActiveTournament();
  if (!tournament) {
    return NextResponse.json({ ok: true, prediction: null });
  }

  const db = getDb();
  const row = db
    .prepare("SELECT * FROM predictions WHERE user_id = ? AND tournament_id = ?")
    .get(authUser.userId, tournament.id) as PredictionRow | undefined;

  if (!row) {
    return NextResponse.json({ ok: true, prediction: null });
  }

  return NextResponse.json({
    ok: true,
    prediction: {
      ...row,
      group_predictions: JSON.parse(row.group_predictions),
      third_place_picks: JSON.parse(row.third_place_picks),
      knockout_picks: JSON.parse(row.knockout_picks),
    },
  });
}

export async function POST(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tournament = getActiveTournament();
  if (!tournament) {
    return NextResponse.json({ error: "No active tournament" }, { status: 404 });
  }

  const body = await req.json();
  const { action } = body;

  if (action === "save_groups") {
    return saveGroups(authUser.userId, tournament, body);
  }

  if (action === "save_knockout") {
    return saveKnockout(authUser.userId, tournament, body);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

function saveGroups(
  userId: string,
  tournament: Tournament,
  body: {
    bracket_name?: string;
    group_predictions: GroupPrediction[];
    third_place_picks: string[];
  }
) {
  const { lock_time_groups } = tournament;
  if (lock_time_groups && new Date() > new Date(lock_time_groups)) {
    return NextResponse.json({ error: "Group predictions are locked" }, { status: 403 });
  }

  const { bracket_name, group_predictions, third_place_picks } = body;
  if (!Array.isArray(group_predictions) || !Array.isArray(third_place_picks)) {
    return NextResponse.json({ error: "Invalid prediction data" }, { status: 400 });
  }

  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM predictions WHERE user_id = ? AND tournament_id = ?")
    .get(userId, tournament.id) as { id: string } | undefined;

  const groupPredStr = JSON.stringify(group_predictions);
  const thirdPlaceStr = JSON.stringify(third_place_picks);
  const name = bracket_name || "My Bracket";

  if (existing) {
    db.prepare(
      `UPDATE predictions
       SET bracket_name = ?, group_predictions = ?, third_place_picks = ?, submitted_at = datetime('now')
       WHERE id = ?`
    ).run(name, groupPredStr, thirdPlaceStr, existing.id);

    const updated = db.prepare("SELECT * FROM predictions WHERE id = ?").get(existing.id) as PredictionRow;
    return NextResponse.json({
      ok: true,
      prediction: {
        ...updated,
        group_predictions: JSON.parse(updated.group_predictions),
        third_place_picks: JSON.parse(updated.third_place_picks),
        knockout_picks: JSON.parse(updated.knockout_picks),
      },
    });
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO predictions (id, user_id, tournament_id, bracket_name, group_predictions, third_place_picks)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, userId, tournament.id, name, groupPredStr, thirdPlaceStr);

  const inserted = db.prepare("SELECT * FROM predictions WHERE id = ?").get(id) as PredictionRow;
  return NextResponse.json({
    ok: true,
    prediction: {
      ...inserted,
      group_predictions: JSON.parse(inserted.group_predictions),
      third_place_picks: JSON.parse(inserted.third_place_picks),
      knockout_picks: JSON.parse(inserted.knockout_picks),
    },
  });
}

function saveKnockout(
  userId: string,
  tournament: Tournament,
  body: { knockout_picks: Record<string, string>; tiebreaker?: number }
) {
  const { lock_time_knockout } = tournament;
  if (lock_time_knockout && new Date() > new Date(lock_time_knockout)) {
    return NextResponse.json({ error: "Knockout predictions are locked" }, { status: 403 });
  }

  const resultsData = tournament.results_data as TournamentResults;
  if (!resultsData?.groupStage) {
    return NextResponse.json({ error: "Group stage results not yet available" }, { status: 400 });
  }

  const { knockout_picks, tiebreaker } = body;
  if (!knockout_picks || typeof knockout_picks !== "object") {
    return NextResponse.json({ error: "Invalid knockout picks data" }, { status: 400 });
  }

  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM predictions WHERE user_id = ? AND tournament_id = ?")
    .get(userId, tournament.id) as { id: string } | undefined;

  if (!existing) {
    return NextResponse.json({ error: "Submit group predictions first" }, { status: 400 });
  }

  const knockoutStr = JSON.stringify(knockout_picks);
  const tiebreakerVal = tiebreaker != null ? Math.max(0, Math.round(tiebreaker)) : null;

  db.prepare(
    `UPDATE predictions
     SET knockout_picks = ?, tiebreaker = ?, submitted_at = datetime('now')
     WHERE id = ?`
  ).run(knockoutStr, tiebreakerVal, existing.id);

  const updated = db.prepare("SELECT * FROM predictions WHERE id = ?").get(existing.id) as PredictionRow;
  return NextResponse.json({
    ok: true,
    prediction: {
      ...updated,
      group_predictions: JSON.parse(updated.group_predictions),
      third_place_picks: JSON.parse(updated.third_place_picks),
      knockout_picks: JSON.parse(updated.knockout_picks),
    },
  });
}
