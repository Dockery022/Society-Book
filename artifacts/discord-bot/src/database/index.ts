/**
 * Database — PostgreSQL via pg.Pool (Node 22+)
 * DATA_URL must be set. Persists across Railway deploys when a Postgres plugin is attached.
 */

import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("[DB] DATABASE_URL is not set. Cannot connect to PostgreSQL.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("sslmode=disable")
    ? false
    : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (err) => {
  console.error("[DB] Unexpected pool error:", err);
});

// ─── Query Helpers ────────────────────────────────────────────────────────────

export type Row = Record<string, unknown>;
export type QueryFn = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

export async function query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
  const res = await pool.query(sql, params);
  return res.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null> {
  const res = await pool.query(sql, params);
  return (res.rows[0] as T) ?? null;
}

export async function execute(sql: string, params?: unknown[]): Promise<{ rowCount: number }> {
  const res = await pool.query(sql, params);
  return { rowCount: res.rowCount ?? 0 };
}

export async function withTransaction<T>(fn: (q: QueryFn) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tq: QueryFn = async <R>(sql: string, params?: unknown[]) => {
      const res = await client.query(sql, params);
      return res.rows as R[];
    };
    const result = await fn(tq);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─── User Bootstrap ───────────────────────────────────────────────────────────

export async function ensureUser(userId: string): Promise<void> {
  await execute(
    "INSERT INTO users (id, coins, lifetime_earned) VALUES ($1, 500, 500) ON CONFLICT (id) DO NOTHING",
    [userId]
  );
}

/** No-op for PostgreSQL — kept so shutdown code compiles without changes. */
export function checkpointDb(): void {}

// ─── Schema Migrations ────────────────────────────────────────────────────────

async function initSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id               TEXT    PRIMARY KEY,
      coins            BIGINT  NOT NULL DEFAULT 500,
      lifetime_earned  BIGINT  NOT NULL DEFAULT 500,
      lifetime_lost    BIGINT  NOT NULL DEFAULT 0,
      total_bets       INTEGER NOT NULL DEFAULT 0,
      total_wins       INTEGER NOT NULL DEFAULT 0,
      created_at       BIGINT  NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );

    CREATE TABLE IF NOT EXISTS cooldowns (
      user_id         TEXT   NOT NULL,
      type            TEXT   NOT NULL,
      last_triggered  BIGINT NOT NULL,
      PRIMARY KEY (user_id, type)
    );

    CREATE TABLE IF NOT EXISTS daily_claims (
      user_id       TEXT PRIMARY KEY,
      last_claimed  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bets (
      id               BIGSERIAL PRIMARY KEY,
      user_id          TEXT             NOT NULL,
      game_id          TEXT             NOT NULL,
      sport            TEXT             NOT NULL,
      bet_type         TEXT             NOT NULL,
      team             TEXT             NOT NULL,
      line             DOUBLE PRECISION,
      odds             INTEGER          NOT NULL,
      amount           BIGINT           NOT NULL,
      potential_return  BIGINT          NOT NULL,
      status           TEXT             NOT NULL DEFAULT 'pending',
      created_at       BIGINT           NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      settled_at       BIGINT,
      home_team        TEXT             NOT NULL,
      away_team        TEXT             NOT NULL,
      commence_time    BIGINT           NOT NULL
    );

    CREATE TABLE IF NOT EXISTS games (
      id             TEXT             PRIMARY KEY,
      sport          TEXT             NOT NULL,
      home_team      TEXT             NOT NULL,
      away_team      TEXT             NOT NULL,
      commence_time  BIGINT           NOT NULL,
      completed      INTEGER          NOT NULL DEFAULT 0,
      home_score     DOUBLE PRECISION,
      away_score     DOUBLE PRECISION,
      last_updated   BIGINT           NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );

    CREATE TABLE IF NOT EXISTS admin_logs (
      id          BIGSERIAL PRIMARY KEY,
      admin_id    TEXT   NOT NULL,
      action      TEXT   NOT NULL,
      target_id   TEXT,
      details     TEXT,
      created_at  BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );

    CREATE TABLE IF NOT EXISTS bot_settings (
      key    TEXT PRIMARY KEY,
      value  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_bets_user_id ON bets(user_id);
    CREATE INDEX IF NOT EXISTS idx_bets_game_id ON bets(game_id);
    CREATE INDEX IF NOT EXISTS idx_bets_status  ON bets(status);
  `);

  await pool.query(
    "INSERT INTO bot_settings (key, value) VALUES ('bets_locked', 'false') ON CONFLICT (key) DO NOTHING"
  );
  await pool.query(
    "INSERT INTO bot_settings (key, value) VALUES ('maintenance_mode', 'false') ON CONFLICT (key) DO NOTHING"
  );
}

await initSchema().catch((err) => {
  console.error("[DB] Schema init failed:", err);
  process.exit(1);
});

console.log("[DB] Connected to PostgreSQL.");

export default pool;
