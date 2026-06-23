/**
 * Formatters — shared display helpers
 */

import type { Bet } from "../types.js";
import { SUPPORTED_SPORTS } from "../types.js";

/** Format a coin amount with thousands separators and coin emoji */
export function formatCoins(amount: number): string {
  return `🪙 ${amount.toLocaleString()} coins`;
}

/** Format American odds for display (+150 / -110) */
export function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

/** Format a unix timestamp as a Discord relative time */
export function formatRelativeTime(unixSeconds: number): string {
  return `<t:${unixSeconds}:R>`;
}

/** Format a unix timestamp as a full date+time */
export function formatDateTime(unixSeconds: number): string {
  return `<t:${unixSeconds}:f>`;
}

/** Convert ISO date string to unix seconds */
export function isoToUnix(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

/** Format win percentage */
export function formatWinRate(wins: number, total: number): string {
  if (total === 0) return "0%";
  return `${((wins / total) * 100).toFixed(1)}%`;
}

/** Format a sport key to its display name */
export function formatSport(sportKey: string): string {
  return SUPPORTED_SPORTS[sportKey] ?? sportKey;
}

/** Format bet type for display */
export function formatBetType(betType: string): string {
  switch (betType) {
    case "moneyline": return "Moneyline";
    case "spread": return "Spread";
    case "total": return "Over/Under";
    default: return betType;
  }
}

/** Format a bet's selection with line if applicable */
export function formatBetSelection(bet: Bet): string {
  if (bet.bet_type === "spread") {
    const sign = (bet.line ?? 0) > 0 ? "+" : "";
    return `${bet.team} (${sign}${bet.line})`;
  }
  if (bet.bet_type === "total") {
    const dir = bet.team.charAt(0).toUpperCase() + bet.team.slice(1);
    return `${dir} ${bet.line}`;
  }
  return bet.team;
}

/** Format bet status with emoji */
export function formatBetStatus(status: string): string {
  switch (status) {
    case "pending": return "⏳ Pending";
    case "won": return "✅ Won";
    case "lost": return "❌ Lost";
    case "cancelled": return "🚫 Cancelled";
    case "void": return "↩️ Void (Push)";
    default: return status;
  }
}

/** Truncate a string to a max length */
export function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

/** Format a duration in ms to human-readable */
export function formatDuration(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
}

/** Calculate profit/loss for a settled bet */
export function calcProfitLoss(bet: Bet): number {
  if (bet.status === "won") return bet.potential_return - bet.amount;
  if (bet.status === "lost") return -bet.amount;
  return 0;
}
