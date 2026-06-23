/**
 * Emoji Service
 * Manages custom coin emoji — stores tags in bot_settings after /setupemojis runs.
 * Falls back to the standard coin emoji if custom ones aren't set up yet.
 */

import db from "../database/index.js";

export interface CoinEmojis {
  coin_1: string;
  coin_5: string;
  coin_10: string;
  coin_25: string;
  coin_50: string;
  coin_100: string;
}

const FALLBACK = "🪙";

/** Load stored emoji tags from the DB (returns null if not set up yet) */
export function loadCoinEmojis(): CoinEmojis | null {
  const row = db
    .prepare("SELECT value FROM bot_settings WHERE key = 'coin_emojis'")
    .get() as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as CoinEmojis;
  } catch {
    return null;
  }
}

/** Save emoji tags to the DB */
export function saveCoinEmojis(emojis: CoinEmojis): void {
  db.prepare(
    "INSERT INTO bot_settings (key, value) VALUES ('coin_emojis', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(JSON.stringify(emojis));
  // Bust the in-memory cache
  cachedEmojis = emojis;
}

/** Clear stored emoji tags (resets to fallback) */
export function clearCoinEmojis(): void {
  db.prepare("DELETE FROM bot_settings WHERE key = 'coin_emojis'").run();
  cachedEmojis = null;
}

// ── In-memory cache (populated on first use or after /setupemojis) ────────────

let cachedEmojis: CoinEmojis | null | undefined = undefined;

function getEmojis(): CoinEmojis | null {
  if (cachedEmojis === undefined) cachedEmojis = loadCoinEmojis();
  return cachedEmojis;
}

/**
 * Pick the best denomination emoji for a given coin amount.
 * Uses the highest denomination that doesn't exceed the amount.
 * Falls back to 🪙 if custom emojis aren't configured.
 */
export function getCoinEmoji(amount: number): string {
  const emojis = getEmojis();
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
  return getEmojis() !== null;
}
