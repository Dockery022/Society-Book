/**
 * Emoji Service
 * Coin emoji helpers — reads from the guild emoji cache populated at startup.
 * The guild cache (emojiCache.ts) is built from server emojis named coin1…coin100,
 * so no /setupemojis run is required as long as those emojis exist on the server.
 */

import { getEmoji } from "../utils/emojiCache.js";

const FALLBACK = "🪙";

/**
 * Pick the best denomination emoji for a given coin amount.
 * Looks up coin100/coin50/coin25/coin10/coin5/coin1 from the guild emoji cache.
 * Falls back to 🪙 if the server doesn't have the custom emojis.
 */
export function getCoinEmoji(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 100) return getEmoji("coin100", FALLBACK);
  if (abs >= 50)  return getEmoji("coin50",  FALLBACK);
  if (abs >= 25)  return getEmoji("coin25",  FALLBACK);
  if (abs >= 10)  return getEmoji("coin10",  FALLBACK);
  if (abs >= 5)   return getEmoji("coin5",   FALLBACK);
  return getEmoji("coin1", FALLBACK);
}
