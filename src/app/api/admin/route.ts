import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuthUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { parseBracketData } from "@/lib/bracketData";
import { generateKnockoutBracket } from "@/lib/knockoutBracket";
import { GroupStageResults, TournamentResults } from "@/types";

export async function POST(request: Request) {
  const user = getAuthUser(request);
  if (!user?.isAdmin) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { name, year, lock_time_groups, lock_time_knockout, bracket_data } =
    await request.json();

  if (!name || !year) {
    return NextResponse.json(
      { ok: false, error: "Name and year are required" },
      { status: 400 }
    );
  }

  const db = getDb();
  const id = randomUUID();
  const bracketJson = typeof bracket_data === "string"
    ? bracket_data
    : JSON.stringify(bracket_data ?? {});

  db.prepare(
    `INSERT INTO tournaments (id, name, year, lock_time_groups, lock_time_knockout, bracket_data)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, name, year, lock_time_groups ?? null, lock_time_knockout ?? null, bracketJson);

  const tournament = {
    id,
    name,
    year,
    lock_time_groups: lock_time_groups ?? null,
    lock_time_knockout: lock_time_knockout ?? null,
    bracket_data: typeof bracket_data === "object" ? bracket_data : JSON.parse(bracketJson),
    results_data: {},
  };

  return NextResponse.json({ ok: true, tournament });
}

const EXPECTED_GROUPS = 12;
const TEAMS_PER_GROUP = 4;
const ADVANCING_THIRD_PLACE_COUNT = 8;

export async function PUT(request: Request) {
  const user = getAuthUser(request);
  if (!user?.isAdmin) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { action } = body;

  if (action === "save_group_results") {
    return saveGroupResults(body);
  }

  if (action === "update_bracket_data") {
    return updateBracketData(body);
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}

function updateBracketData(body: { bracket_data: unknown }) {
  const { bracket_data } = body;
  if (!bracket_data || typeof bracket_data !== "object") {
    return NextResponse.json({ ok: false, error: "bracket_data required" }, { status: 400 });
  }
  const db = getDb();
  const row = db.prepare("SELECT id FROM tournaments ORDER BY year DESC LIMIT 1").get() as
    | { id: string }
    | undefined;
  if (!row) {
    return NextResponse.json({ ok: false, error: "No tournament found" }, { status: 404 });
  }
  db.prepare("UPDATE tournaments SET bracket_data = ? WHERE id = ?").run(
    JSON.stringify(bracket_data),
    row.id,
  );
  return NextResponse.json({ ok: true });
}

function saveGroupResults(body: {
  groupResults: GroupStageResults["groupResults"];
  advancingThirdPlace: string[];
}) {
  const { groupResults, advancingThirdPlace } = body;

  if (!Array.isArray(groupResults) || groupResults.length !== EXPECTED_GROUPS) {
    return NextResponse.json(
      { ok: false, error: `Expected ${EXPECTED_GROUPS} group results` },
      { status: 400 },
    );
  }

  if (!Array.isArray(advancingThirdPlace) || advancingThirdPlace.length !== ADVANCING_THIRD_PLACE_COUNT) {
    return NextResponse.json(
      { ok: false, error: `Expected ${ADVANCING_THIRD_PLACE_COUNT} advancing third-place teams` },
      { status: 400 },
    );
  }

  for (const gr of groupResults) {
    if (!gr.groupName || !Array.isArray(gr.order) || gr.order.length !== TEAMS_PER_GROUP) {
      return NextResponse.json(
        { ok: false, error: `Invalid group result for ${gr.groupName ?? "unknown"}` },
        { status: 400 },
      );
    }
  }

  // Verify all advancing 3rd-place teams are actually 3rd in their group
  const thirdPlaceTeams = groupResults.map((gr) => gr.order[2]);
  for (const team of advancingThirdPlace) {
    if (!thirdPlaceTeams.includes(team)) {
      return NextResponse.json(
        { ok: false, error: `${team} is not a third-place team` },
        { status: 400 },
      );
    }
  }

  const db = getDb();
  const row = db.prepare("SELECT * FROM tournaments ORDER BY year DESC LIMIT 1").get() as
    | { id: string; bracket_data: string; results_data: string | null }
    | undefined;

  if (!row) {
    return NextResponse.json({ ok: false, error: "No tournament found" }, { status: 404 });
  }

  const bracketData = parseBracketData(row.bracket_data);
  const gsResults: GroupStageResults = { groupResults, advancingThirdPlace };
  const knockoutBracket = generateKnockoutBracket(gsResults, bracketData);

  const existingResults: TournamentResults = row.results_data
    ? JSON.parse(row.results_data)
    : {};

  const updatedResults: TournamentResults = {
    ...existingResults,
    groupStage: gsResults,
    knockoutBracket,
  };

  db.prepare("UPDATE tournaments SET results_data = ? WHERE id = ?").run(
    JSON.stringify(updatedResults),
    row.id,
  );

  return NextResponse.json({ ok: true, results: updatedResults });
}
