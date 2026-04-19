import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "worldcup.db");

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
}
