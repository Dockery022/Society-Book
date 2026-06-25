/**
 * Database — SQLite via Node.js built-in node:sqlite (Node 22+)
 * No native compilation required. Structured for easy PostgreSQL migration.
 */

import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const DB_PATH = process.env.DB_PATH ?? "./data/society_book.db";

// Ensure data directory exists
const dbDir = path.dirname(path.resolve(DB_PATH));
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Open the database
const db = new DatabaseSync(path.resolve(DB_PATH));

// Enable WAL mode; checkpoint every 100 pages (~400 KB) instead of default 1000
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA wal_autocheckpoint = 100;");
db.exec("PRAGMA synchronous = NORMAL;");

/** Flush all pending WAL writes to the main DB file. Call before shutdown. */
export function checkpointDb(): void {
  try {
    db.exec("PRAGMA wal_checkpoint(FULL);");
  } catch {
    // best-effort
  }
}

// ─── Transaction Helper ───────────────────────────────────────────────────────
// Mimics better-sqlite3's db.transaction() pattern.

export function transaction<T>(fn: () => T): () => T {
  return (): T => {
    db.exec("BEGIN");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  };
}

// ─── Schema Migrations ────────────────────────────────────────────────────────

function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      coins INTEGER NOT NULL DEFAULT 500,
      lifetime_earned INTEGER NOT NULL DEFAULT 500,
      lifetime_lost INTEGER NOT NULL DEFAULT 0,
      total_bets INTEGER NOT NULL DEFAULT 0,
      total_wins INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS cooldowns (
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      last_triggered INTEGER NOT NULL,
      PRIMARY KEY (user_id, type)
    );

    CREATE TABLE IF NOT EXISTS daily_claims (
      user_id TEXT PRIMARY KEY,
      last_claimed TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      game_id TEXT NOT NULL,
      sport TEXT NOT NULL,
      bet_type TEXT NOT NULL,
      team TEXT NOT NULL,
      line REAL,
      odds INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      potential_return INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      settled_at INTEGER,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      commence_time INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      sport TEXT NOT NULL,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      commence_time INTEGER NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      home_score REAL,
      away_score REAL,
      last_updated INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS admin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_id TEXT,
      details TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS bot_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_bets_user_id ON bets(user_id);
    CREATE INDEX IF NOT EXISTS idx_bets_game_id ON bets(game_id);
    CREATE INDEX IF NOT EXISTS idx_bets_status ON bets(status);
  `);

  // Seed default bot settings
  db.prepare(
    "INSERT OR IGNORE INTO bot_settings (key, value) VALUES (?, ?)"
  ).run("bets_locked", "false");
  db.prepare(
    "INSERT OR IGNORE INTO bot_settings (key, value) VALUES (?, ?)"
  ).run("maintenance_mode", "false");
}

initSchema();

export default db;

// ─── Helper: ensure user row exists ──────────────────────────────────────────

export function ensureUser(userId: string): void {
  db.prepare(
    "INSERT OR IGNORE INTO users (id, coins, lifetime_earned) VALUES (?, 500, 500)"
  ).run(userId);
}
