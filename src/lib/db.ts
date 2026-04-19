import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { DEFAULT_SCORING } from "@/types";
import { WORLD_CUP_2026_DATA } from "@/lib/bracketData";

const DB_PATH = path.join(process.cwd(), "data", "worldcup.db");
export const EVERYONE_GROUP_ID = "everyone";
const EVERYONE_GROUP_NAME = "Everyone";

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    initDb(db);
  }
  return db;
}

function initDb(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      year INTEGER NOT NULL,
      lock_time_groups TEXT,
      lock_time_knockout TEXT,
      bracket_data TEXT NOT NULL DEFAULT '{}',
      results_data TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tournament_id TEXT NOT NULL,
      bracket_name TEXT NOT NULL DEFAULT 'My Bracket',
      group_predictions TEXT NOT NULL DEFAULT '[]',
      third_place_picks TEXT NOT NULL DEFAULT '[]',
      knockout_picks TEXT NOT NULL DEFAULT '{}',
      tiebreaker INTEGER DEFAULT NULL,
      submitted_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
    );

    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      invite_code TEXT UNIQUE NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      scoring_settings TEXT NOT NULL DEFAULT '{}',
      max_brackets INTEGER DEFAULT NULL,
      submissions_locked INTEGER DEFAULT 0,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL,
      prediction_id TEXT NOT NULL,
      PRIMARY KEY (group_id, prediction_id),
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (prediction_id) REFERENCES predictions(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  ensureEveryoneGroup(db);
  migrateEspnIds(db);

  // Auto-assign any existing unassigned predictions to Everyone
  try {
    const unassigned = db.prepare(
      `SELECT p.id FROM predictions p
       WHERE NOT EXISTS (SELECT 1 FROM group_members gm WHERE gm.prediction_id = p.id AND gm.group_id = ?)`
    ).all(EVERYONE_GROUP_ID) as { id: string }[];
    const ins = db.prepare("INSERT OR IGNORE INTO group_members (group_id, prediction_id) VALUES (?, ?)");
    for (const row of unassigned) ins.run(EVERYONE_GROUP_ID, row.id);
  } catch { /* ignore migration errors */ }
}

function migrateEspnIds(db: Database.Database) {
  try {
    const row = db.prepare("SELECT id, bracket_data FROM tournaments ORDER BY year DESC LIMIT 1").get() as
      | { id: string; bracket_data: string }
      | undefined;
    if (!row) return;
    const data = JSON.parse(row.bracket_data);
    if (!data.groups?.length) return;
    // Check if first team already has espnId
    if (data.groups[0].teams[0]?.espnId) return;
    // Update with current WORLD_CUP_2026_DATA which includes espnIds
    db.prepare("UPDATE tournaments SET bracket_data = ? WHERE id = ?").run(
      JSON.stringify(WORLD_CUP_2026_DATA),
      row.id,
    );
  } catch { /* ignore migration errors */ }
}

export function ensureEveryoneGroup(db: Database.Database): string {
  const existing = db.prepare("SELECT id FROM groups WHERE id = ?").get(EVERYONE_GROUP_ID) as { id: string } | undefined;
  if (!existing) {
    const admin = db.prepare("SELECT id FROM users WHERE is_admin = 1 LIMIT 1").get() as { id: string } | undefined;
    const creator = admin?.id || "system";
    db.prepare(
      "INSERT OR IGNORE INTO groups (id, name, invite_code, created_by, scoring_settings) VALUES (?, ?, ?, ?, ?)"
    ).run(EVERYONE_GROUP_ID, EVERYONE_GROUP_NAME, EVERYONE_GROUP_ID, creator, JSON.stringify(DEFAULT_SCORING));
  }
  return EVERYONE_GROUP_ID;
}

export function joinEveryoneGroup(db: Database.Database, userId: string) {
  // No-op for now — group_members uses prediction_id, not user_id.
  // Users join Everyone when they create a prediction via autoAssignPredictionToEveryone.
  ensureEveryoneGroup(db);
  void userId;
}

export function autoAssignPredictionToEveryone(db: Database.Database, predictionId: string) {
  ensureEveryoneGroup(db);
  db.prepare("INSERT OR IGNORE INTO group_members (group_id, prediction_id) VALUES (?, ?)").run(EVERYONE_GROUP_ID, predictionId);
}
