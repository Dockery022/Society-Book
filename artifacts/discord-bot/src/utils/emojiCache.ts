/**
 * Runtime cache of guild custom emojis, keyed by emoji name.
 * Populated once in the ready event. Used in embed builders.
 */

const cache = new Map<string, string>();

/** Store a resolved emoji string like <:DK:123456789> */
export function setEmoji(name: string, formatted: string): void {
  cache.set(name.toLowerCase(), formatted);
}

/** Return the formatted custom emoji string, or a fallback if not found */
export function getEmoji(name: string, fallback = ""): string {
  return cache.get(name.toLowerCase()) ?? fallback;
}
