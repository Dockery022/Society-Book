/**
 * Emoji Service
 * Manages custom coin emoji — stores tags in bot_settings after /setupemojis runs.
 * Falls back to the standard coin emoji if custom ones aren't set up yet.
 */

import { queryOne, execute } from "../database/index.js";

export interface CoinEmojis {
  coin_1: string;
  coin_5: string;
  coin_10: string;
  coin_25: string;
  coin_50: string;
  coin_100: string;
}

const FALLBACK = "🪙";

/** In-memory cache — null = not configured, undefined = not yet loaded */
let cachedEmojis: CoinEmojis | null | undefined = undefined;

/** Load stored emoji tags from the DB (returns null if not set up yet) */
export async function loadCoinEmojis(): Promise<CoinEmojis | null> {
  const row = await queryOne<{ value: string }>(
    "SELECT value FROM bot_settings WHERE key = 'coin_emojis'"
  );
  if (!row) return null;
  try {
    return JSON.parse(row.value) as CoinEmojis;
  } catch {
    return null;
  }
}

/** Populate the in-memory cache at startup */
export async function initEmojiCache(): Promise<void> {
  cachedEmojis = await loadCoinEmojis();
}

/** Save emoji tags to the DB and bust the cache */
export async function saveCoinEmojis(emojis: CoinEmojis): Promise<void> {
  await execute(
    `INSERT INTO bot_settings (key, value) VALUES ('coin_emojis', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(emojis)]
  );
  cachedEmojis = emojis;
}

/** Clear stored emoji tags (resets to fallback) */
export async function clearCoinEmojis(): Promise<void> {
  await execute("DELETE FROM bot_settings WHERE key = 'coin_emojis'");
  cachedEmojis = null;
}

// ─── Sync helpers (use cached value set at startup) ───────────────────────────

/**
 * Pick the best denomination emoji for a given coin amount.
 * Uses the highest denomination that doesn't exceed the amount.
 * Falls back to 🪙 if custom emojis aren't configured.
 */
export function getCoinEmoji(amount: number): string {
  const emojis = cachedEmojis ?? null;
  if (!emojis) return FALLBACK;

  if (Math.abs(amount) >= 100) return emojis.coin_100;
  if (Math.abs(amount) >= 50) return emojis.coin_50;
  if (Math.abs(amount) >= 25) return emojis.coin_25;
  if (Math.abs(amount) >= 10) return emojis.coin_10;
  if (Math.abs(amount) >= 5) return emojis.coin_5;
  return emojis.coin_1;
}

/** True if custom coin emojis have been configured */
export function hasCustomEmojis(): boolean {
  return cachedEmojis !== null && cachedEmojis !== undefined;
}
