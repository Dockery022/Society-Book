/**
 * Coin Service
 * Handles all coin balance operations, cooldowns, and daily rewards.
 */

import { query, queryOne, execute, ensureUser } from "../database/index.js";
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

export async function getAllUserIds(): Promise<string[]> {
  const rows = await query<{ id: string }>("SELECT id FROM users");
  return rows.map((r) => r.id);
}

export async function addCoinsToAllUsers(amount: number, adminId: string): Promise<number> {
  const ids = await getAllUserIds();
  await execute(
    "UPDATE users SET coins = coins + $1, lifetime_earned = lifetime_earned + $1",
    [amount]
  );
  await execute(
    "INSERT INTO admin_logs (admin_id, action, target_id, details) VALUES ($1, 'server_bonus', NULL, $2)",
    [adminId, `Gave ${amount} coins to all ${ids.length} users`]
  );
  return ids.length;
}

export async function getBalance(userId: string): Promise<number> {
  await ensureUser(userId);
  const row = await queryOne<{ coins: number }>("SELECT coins FROM users WHERE id = $1", [userId]);
  return row?.coins ?? 500;
}

export async function getUser(userId: string): Promise<User> {
  await ensureUser(userId);
  return (await queryOne<User>("SELECT * FROM users WHERE id = $1", [userId])) as unknown as User;
}

export async function addCoins(userId: string, amount: number, _reason?: string): Promise<void> {
  await ensureUser(userId);
  await execute(
    "UPDATE users SET coins = coins + $1, lifetime_earned = lifetime_earned + $1 WHERE id = $2",
    [amount, userId]
  );
}

export async function removeCoins(userId: string, amount: number, _reason?: string): Promise<void> {
  await ensureUser(userId);
  await execute(
    "UPDATE users SET coins = GREATEST(0, coins - $1), lifetime_lost = lifetime_lost + $1 WHERE id = $2",
    [amount, userId]
  );
}

export async function recordBetWin(userId: string, profit: number): Promise<void> {
  await execute(
    "UPDATE users SET total_wins = total_wins + 1, lifetime_earned = lifetime_earned + $1 WHERE id = $2",
    [profit, userId]
  );
}

export async function recordBetPlace(userId: string): Promise<void> {
  await execute("UPDATE users SET total_bets = total_bets + 1 WHERE id = $1", [userId]);
}

export function getMaxWager(isPremium: boolean): number {
  return isPremium ? MAX_WAGER_PREMIUM : MAX_WAGER_FREE;
}

// ─── Cooldowns ────────────────────────────────────────────────────────────────

type CooldownType = "message" | "reaction_given";

async function checkCooldown(
  userId: string,
  type: CooldownType,
  cooldownMs: number
): Promise<{ allowed: boolean }> {
  const now = Date.now();
  const row = await queryOne<{ last_triggered: number }>(
    "SELECT last_triggered FROM cooldowns WHERE user_id = $1 AND type = $2",
    [userId, type]
  );
  if (!row) return { allowed: true };
  return { allowed: now - Number(row.last_triggered) >= cooldownMs };
}

async function updateCooldown(userId: string, type: CooldownType): Promise<void> {
  await execute(
    `INSERT INTO cooldowns (user_id, type, last_triggered) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, type) DO UPDATE SET last_triggered = EXCLUDED.last_triggered`,
    [userId, type, Date.now()]
  );
}

// ─── Reward Triggers ──────────────────────────────────────────────────────────

export async function tryAwardMessageCoins(userId: string): Promise<boolean> {
  if (!(await checkCooldown(userId, "message", MESSAGE_COOLDOWN_MS)).allowed) return false;
  await ensureUser(userId);
  await addCoins(userId, MESSAGE_REWARD);
  await updateCooldown(userId, "message");
  return true;
}

export async function tryAwardReactionGivenCoins(userId: string): Promise<boolean> {
  if (!(await checkCooldown(userId, "reaction_given", REACTION_COOLDOWN_MS)).allowed) return false;
  await ensureUser(userId);
  await addCoins(userId, REACTION_GIVEN_REWARD);
  await updateCooldown(userId, "reaction_given");
  return true;
}

export async function awardReactionReceivedCoins(userId: string): Promise<void> {
  await ensureUser(userId);
  await addCoins(userId, REACTION_RECEIVED_REWARD);
}

// ─── Daily Rewards ────────────────────────────────────────────────────────────

function todayDateString(): string {
  return new Date().toISOString().split("T")[0]!;
}

export async function claimDaily(
  userId: string,
  isPremium: boolean
): Promise<{ success: boolean; amount: number; alreadyClaimed: boolean }> {
  await ensureUser(userId);
  const today = todayDateString();
  const claim = await queryOne<DailyClaim>(
    "SELECT last_claimed FROM daily_claims WHERE user_id = $1",
    [userId]
  );

  if (claim?.last_claimed === today) {
    return { success: false, amount: 0, alreadyClaimed: true };
  }

  const amount = isPremium ? DAILY_PREMIUM : DAILY_FREE;
  await addCoins(userId, amount);

  await execute(
    `INSERT INTO daily_claims (user_id, last_claimed) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET last_claimed = EXCLUDED.last_claimed`,
    [userId, today]
  );

  return { success: true, amount, alreadyClaimed: false };
}

export async function getNextDailyReset(userId: string): Promise<Date | null> {
  const claim = await queryOne<DailyClaim>(
    "SELECT last_claimed FROM daily_claims WHERE user_id = $1",
    [userId]
  );
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

export async function getLeaderboard(
  sortBy: "coins" | "lifetime_earned" | "win_rate" | "total_bets",
  limit = 10
): Promise<LeaderboardEntry[]> {
  const orderMap: Record<string, string> = {
    coins:           "coins DESC",
    lifetime_earned: "lifetime_earned DESC",
    win_rate:        "CAST(total_wins AS FLOAT) / GREATEST(total_bets, 1) DESC, total_bets DESC",
    total_bets:      "total_bets DESC",
  };
  const order = orderMap[sortBy] ?? "coins DESC";
  return query<LeaderboardEntry>(
    `SELECT id, coins, lifetime_earned, lifetime_lost, total_bets, total_wins
     FROM users ORDER BY ${order} LIMIT $1`,
    [limit]
  ) as unknown as Promise<LeaderboardEntry[]>;
}
