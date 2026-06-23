/**
 * Betting Service
 * Handles bet placement, retrieval, cancellation, and lock state.
 */

import db, { ensureUser, transaction } from "../database/index.js";
import * as coinService from "./coinService.js";
import { calcPotentialReturn } from "./oddsService.js";
import type { Bet, BetSlip } from "../types.js";

// ─── Lock State ───────────────────────────────────────────────────────────────

export function areBetsLocked(): boolean {
  const row = db
    .prepare("SELECT value FROM bot_settings WHERE key = ?")
    .get("bets_locked") as { value: string } | undefined;
  return row?.value === "true";
}

export function setBetsLocked(locked: boolean): void {
  db.prepare(
    "INSERT INTO bot_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run("bets_locked", locked ? "true" : "false");
}

// ─── Place Bet ────────────────────────────────────────────────────────────────

export interface PlaceBetResult {
  success: boolean;
  error?: string;
  bet?: Bet;
}

export function placeBet(userId: string, slip: BetSlip): PlaceBetResult {
  if (areBetsLocked()) {
    return { success: false, error: "Betting is currently locked by an admin." };
  }

  ensureUser(userId);
  const balance = coinService.getBalance(userId);

  if (slip.amount <= 0) {
    return { success: false, error: "Wager amount must be at least 1 coin." };
  }
  if (slip.amount > balance) {
    return {
      success: false,
      error: `Insufficient coins. You have **${balance.toLocaleString()}** coins but tried to wager **${slip.amount.toLocaleString()}**.`,
    };
  }

  const potentialReturn = calcPotentialReturn(slip.odds, slip.amount);

  let betId: number;

  transaction(() => {
    coinService.removeCoins(userId, slip.amount);
    coinService.recordBetPlace(userId);

    const result = db.prepare(`
      INSERT INTO bets (user_id, game_id, sport, bet_type, team, line, odds, amount,
        potential_return, status, home_team, away_team, commence_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(
      userId, slip.gameId, slip.sport, slip.betType, slip.team,
      slip.line ?? null, slip.odds, slip.amount, potentialReturn,
      slip.homeTeam, slip.awayTeam, slip.commenceTime
    );

    betId = Number(result.lastInsertRowid);

    db.prepare(
      "INSERT OR IGNORE INTO games (id, sport, home_team, away_team, commence_time) VALUES (?, ?, ?, ?, ?)"
    ).run(slip.gameId, slip.sport, slip.homeTeam, slip.awayTeam, slip.commenceTime);
  })();

  const bet = db.prepare("SELECT * FROM bets WHERE id = ?").get(betId!) as Bet;
  return { success: true, bet };
}

// ─── Get Bets ─────────────────────────────────────────────────────────────────

export function getUserBets(userId: string, status?: string, limit = 10): Bet[] {
  if (status) {
    return db
      .prepare("SELECT * FROM bets WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT ?")
      .all(userId, status, limit) as Bet[];
  }
  return db
    .prepare("SELECT * FROM bets WHERE user_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(userId, limit) as Bet[];
}

export function getBetById(betId: number): Bet | null {
  return (db.prepare("SELECT * FROM bets WHERE id = ?").get(betId) as Bet | undefined) ?? null;
}

export function getPendingBetsForGame(gameId: string): Bet[] {
  return db
    .prepare("SELECT * FROM bets WHERE game_id = ? AND status = 'pending'")
    .all(gameId) as Bet[];
}

// ─── Cancel Bet ───────────────────────────────────────────────────────────────

export interface CancelBetResult {
  success: boolean;
  error?: string;
  refunded?: number;
}

export function cancelBet(betId: number, adminId?: string): CancelBetResult {
  const bet = getBetById(betId);
  if (!bet) return { success: false, error: `Bet #${betId} not found.` };
  if (bet.status !== "pending") {
    return { success: false, error: `Bet #${betId} is already **${bet.status}**.` };
  }

  transaction(() => {
    db.prepare("UPDATE bets SET status = 'cancelled', settled_at = unixepoch() WHERE id = ?").run(betId);
    coinService.addCoins(bet.user_id, bet.amount);

    if (adminId) {
      db.prepare(
        "INSERT INTO admin_logs (admin_id, action, target_id, details) VALUES (?, 'cancel_bet', ?, ?)"
      ).run(adminId, bet.user_id, `Cancelled bet #${betId} (${bet.amount} coins refunded)`);
    }
  })();

  return { success: true, refunded: bet.amount };
}

// ─── Manual Settlement ────────────────────────────────────────────────────────

export interface SettleBetResult {
  success: boolean;
  error?: string;
  outcome?: "won" | "lost" | "void";
  payout?: number;
}

export function manualSettleBet(
  betId: number,
  outcome: "won" | "lost" | "void",
  adminId: string
): SettleBetResult {
  const bet = getBetById(betId);
  if (!bet) return { success: false, error: `Bet #${betId} not found.` };
  if (bet.status !== "pending") {
    return { success: false, error: `Bet #${betId} is already **${bet.status}**.` };
  }

  transaction(() => {
    db.prepare("UPDATE bets SET status = ?, settled_at = unixepoch() WHERE id = ?").run(outcome, betId);

    if (outcome === "won") {
      coinService.addCoins(bet.user_id, bet.potential_return);
      coinService.recordBetWin(bet.user_id, bet.potential_return - bet.amount);
    } else if (outcome === "void") {
      coinService.addCoins(bet.user_id, bet.amount);
    }

    db.prepare(
      "INSERT INTO admin_logs (admin_id, action, target_id, details) VALUES (?, 'settle_bet', ?, ?)"
    ).run(adminId, bet.user_id, `Settled bet #${betId} as ${outcome}`);
  })();

  const payout =
    outcome === "won" ? bet.potential_return : outcome === "void" ? bet.amount : 0;
  return { success: true, outcome, payout };
}
