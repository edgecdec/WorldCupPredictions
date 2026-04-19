import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuthUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

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
