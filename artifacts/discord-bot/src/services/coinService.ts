/**
 * Coin Service
 * Handles all coin balance operations, cooldowns, and daily rewards.
 */

import db, { ensureUser, transaction } from "../database/index.js";
import type { User, DailyClaim } from "../types.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const MESSAGE_REWARD = 10;
const MESSAGE_COOLDOWN_MS = 60 * 1000;

const REACTION_GIVEN_REWARD = 2;
const REACTION_RECEIVED_REWARD = 5;
const REACTION_COOLDOWN_MS = 30 * 1000;

const DAILY_FREE = 25;
const DAILY_PREMIUM = 100;

const MAX_WAGER_FREE = 1000;
const MAX_WAGER_PREMIUM = 5000;

// ─── Balance Operations ───────────────────────────────────────────────────────

export function getBalance(userId: string): number {
  ensureUser(userId);
  const row = db.prepare("SELECT coins FROM users WHERE id = ?").get(userId) as
    | { coins: number }
    | undefined;
  return row?.coins ?? 500;
}

export function getUser(userId: string): User {
  ensureUser(userId);
  return db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as unknown as User;
}

export function addCoins(userId: string, amount: number, _reason?: string): void {
  ensureUser(userId);
  db.prepare(
    "UPDATE users SET coins = coins + ?, lifetime_earned = lifetime_earned + ? WHERE id = ?"
  ).run(amount, amount, userId);
}

export function removeCoins(userId: string, amount: number, _reason?: string): void {
  ensureUser(userId);
  db.prepare(
    "UPDATE users SET coins = MAX(0, coins - ?), lifetime_lost = lifetime_lost + ? WHERE id = ?"
  ).run(amount, amount, userId);
}

export function recordBetWin(userId: string, profit: number): void {
  db.prepare(
    "UPDATE users SET total_wins = total_wins + 1, lifetime_earned = lifetime_earned + ? WHERE id = ?"
  ).run(profit, userId);
}

export function recordBetPlace(userId: string): void {
  db.prepare("UPDATE users SET total_bets = total_bets + 1 WHERE id = ?").run(userId);
}

export function getMaxWager(isPremium: boolean): number {
  return isPremium ? MAX_WAGER_PREMIUM : MAX_WAGER_FREE;
}

// ─── Cooldowns ────────────────────────────────────────────────────────────────

type CooldownType = "message" | "reaction_given";

function checkCooldown(
  userId: string,
  type: CooldownType,
  cooldownMs: number
): { allowed: boolean } {
  const now = Date.now();
  const row = db
    .prepare("SELECT last_triggered FROM cooldowns WHERE user_id = ? AND type = ?")
    .get(userId, type) as { last_triggered: number } | undefined;

  if (!row) return { allowed: true };
  return { allowed: now - row.last_triggered >= cooldownMs };
}

function updateCooldown(userId: string, type: CooldownType): void {
  db.prepare(
    "INSERT INTO cooldowns (user_id, type, last_triggered) VALUES (?, ?, ?) ON CONFLICT(user_id, type) DO UPDATE SET last_triggered = excluded.last_triggered"
  ).run(userId, type, Date.now());
}

// ─── Reward Triggers ──────────────────────────────────────────────────────────

export function tryAwardMessageCoins(userId: string): boolean {
  if (!checkCooldown(userId, "message", MESSAGE_COOLDOWN_MS).allowed) return false;
  ensureUser(userId);
  addCoins(userId, MESSAGE_REWARD);
  updateCooldown(userId, "message");
  return true;
}

export function tryAwardReactionGivenCoins(userId: string): boolean {
  if (!checkCooldown(userId, "reaction_given", REACTION_COOLDOWN_MS).allowed) return false;
  ensureUser(userId);
  addCoins(userId, REACTION_GIVEN_REWARD);
  updateCooldown(userId, "reaction_given");
  return true;
}

export function awardReactionReceivedCoins(userId: string): void {
  ensureUser(userId);
  addCoins(userId, REACTION_RECEIVED_REWARD);
}

// ─── Daily Rewards ────────────────────────────────────────────────────────────

function todayDateString(): string {
  return new Date().toISOString().split("T")[0]!;
}

export function claimDaily(
  userId: string,
  isPremium: boolean
): { success: boolean; amount: number; alreadyClaimed: boolean } {
  ensureUser(userId);
  const today = todayDateString();
  const claim = db
    .prepare("SELECT last_claimed FROM daily_claims WHERE user_id = ?")
    .get(userId) as DailyClaim | undefined;

  if (claim?.last_claimed === today) {
    return { success: false, amount: 0, alreadyClaimed: true };
  }

  const amount = isPremium ? DAILY_PREMIUM : DAILY_FREE;
  addCoins(userId, amount);

  db.prepare(
    "INSERT INTO daily_claims (user_id, last_claimed) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET last_claimed = excluded.last_claimed"
  ).run(userId, today);

  return { success: true, amount, alreadyClaimed: false };
}

export function getNextDailyReset(userId: string): Date | null {
  const claim = db
    .prepare("SELECT last_claimed FROM daily_claims WHERE user_id = ?")
    .get(userId) as DailyClaim | undefined;
  if (!claim) return null;
  const next = new Date(claim.last_claimed);
  next.setDate(next.getDate() + 1);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  id: string;
  coins: number;
  lifetime_earned: number;
  lifetime_lost: number;
  total_bets: number;
  total_wins: number;
}

export function getLeaderboard(
  sortBy: "coins" | "lifetime_earned" | "win_rate" | "total_bets",
  limit = 10
): LeaderboardEntry[] {
  const orderMap: Record<string, string> = {
    coins: "coins DESC",
    lifetime_earned: "lifetime_earned DESC",
    win_rate: "CAST(total_wins AS REAL) / MAX(total_bets, 1) DESC, total_bets DESC",
    total_bets: "total_bets DESC",
  };
  const order = orderMap[sortBy] ?? "coins DESC";
  return db
    .prepare(
      `SELECT id, coins, lifetime_earned, lifetime_lost, total_bets, total_wins
       FROM users ORDER BY ${order} LIMIT ?`
    )
    .all(limit) as unknown as LeaderboardEntry[];
}
