/**
 * Betting Service
 * Handles bet placement, retrieval, cancellation, and lock state.
 */

import { query, queryOne, execute, ensureUser, withTransaction } from "../database/index.js";
import { calcPotentialReturn } from "./oddsService.js";
import type { Bet, BetSlip } from "../types.js";

const NOW_SQL = "EXTRACT(EPOCH FROM NOW())::BIGINT";

// ─── Lock State ───────────────────────────────────────────────────────────────

export async function areBetsLocked(): Promise<boolean> {
  const row = await queryOne<{ value: string }>(
    "SELECT value FROM bot_settings WHERE key = 'bets_locked'"
  );
  return row?.value === "true";
}

export async function setBetsLocked(locked: boolean): Promise<void> {
  await execute(
    `INSERT INTO bot_settings (key, value) VALUES ('bets_locked', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [locked ? "true" : "false"]
  );
}

// ─── Place Bet ────────────────────────────────────────────────────────────────

export interface PlaceBetResult {
  success: boolean;
  error?: string;
  bet?: Bet;
}

export async function placeBet(userId: string, slip: BetSlip): Promise<PlaceBetResult> {
  if (await areBetsLocked()) {
    return { success: false, error: "Betting is currently locked by an admin." };
  }

  await ensureUser(userId);
  const balRow = await queryOne<{ coins: number }>("SELECT coins FROM users WHERE id = $1", [userId]);
  const balance = balRow?.coins ?? 0;

  if (slip.amount <= 0) {
    return { success: false, error: "Wager amount must be at least 1 coin." };
  }
  if (slip.amount > balance) {
    return {
      success: false,
      error: `Insufficient coins. You have **${Number(balance).toLocaleString()}** coins but tried to wager **${slip.amount.toLocaleString()}**.`,
    };
  }

  const potentialReturn = calcPotentialReturn(slip.odds, slip.amount);
  let betId = 0;

  await withTransaction(async (q) => {
    await q(
      "UPDATE users SET coins = GREATEST(0, coins - $1), lifetime_lost = lifetime_lost + $1 WHERE id = $2",
      [slip.amount, userId]
    );
    await q("UPDATE users SET total_bets = total_bets + 1 WHERE id = $1", [userId]);

    const rows = await q<{ id: number }>(
      `INSERT INTO bets
         (user_id, game_id, sport, bet_type, team, line, odds, amount,
          potential_return, status, home_team, away_team, commence_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, $11, $12)
       RETURNING id`,
      [
        userId,
        slip.gameId,
        slip.sport,
        slip.betType,
        slip.team,
        slip.line ?? null,
        slip.odds,
        slip.amount,
        potentialReturn,
        slip.homeTeam,
        slip.awayTeam,
        slip.commenceTime,
      ]
    );
    betId = Number(rows[0]!.id);

    await q(
      `INSERT INTO games (id, sport, home_team, away_team, commence_time)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
      [slip.gameId, slip.sport, slip.homeTeam, slip.awayTeam, slip.commenceTime]
    );
  });

  const bet = await queryOne<Bet>("SELECT * FROM bets WHERE id = $1", [betId]);
  return { success: true, bet: bet as unknown as Bet };
}

// ─── Get Bets ─────────────────────────────────────────────────────────────────

export async function getUserBets(userId: string, status?: string, limit = 10): Promise<Bet[]> {
  if (status) {
    return query<Bet>(
      "SELECT * FROM bets WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT $3",
      [userId, status, limit]
    ) as unknown as Promise<Bet[]>;
  }
  return query<Bet>(
    "SELECT * FROM bets WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
    [userId, limit]
  ) as unknown as Promise<Bet[]>;
}

export async function getBetById(betId: number): Promise<Bet | null> {
  return queryOne<Bet>(
    "SELECT * FROM bets WHERE id = $1",
    [betId]
  ) as unknown as Promise<Bet | null>;
}

export async function getPendingBetsForGame(gameId: string): Promise<Bet[]> {
  return query<Bet>(
    "SELECT * FROM bets WHERE game_id = $1 AND status = 'pending'",
    [gameId]
  ) as unknown as Promise<Bet[]>;
}

// ─── Cancel Bet ───────────────────────────────────────────────────────────────

export interface CancelBetResult {
  success: boolean;
  error?: string;
  refunded?: number;
}

export async function cancelBet(betId: number, adminId?: string): Promise<CancelBetResult> {
  const bet = await getBetById(betId);
  if (!bet) return { success: false, error: `Bet #${betId} not found.` };
  if (bet.status !== "pending") {
    return { success: false, error: `Bet #${betId} is already **${bet.status}**.` };
  }

  await withTransaction(async (q) => {
    await q(
      `UPDATE bets SET status = 'cancelled', settled_at = ${NOW_SQL} WHERE id = $1`,
      [betId]
    );
    await q(
      "UPDATE users SET coins = coins + $1, lifetime_earned = lifetime_earned + $1 WHERE id = $2",
      [bet.amount, bet.user_id]
    );
    if (adminId) {
      await q(
        "INSERT INTO admin_logs (admin_id, action, target_id, details) VALUES ($1, 'cancel_bet', $2, $3)",
        [adminId, bet.user_id, `Cancelled bet #${betId} (${bet.amount} coins refunded)`]
      );
    }
  });

  return { success: true, refunded: Number(bet.amount) };
}

// ─── Cancel All Pending Bets ──────────────────────────────────────────────────

export interface CancelAllResult {
  cancelled: number;
  totalRefunded: number;
}

export async function cancelAllPendingBets(adminId: string): Promise<CancelAllResult> {
  const pending = await query<Bet>("SELECT * FROM bets WHERE status = 'pending'") as unknown as Bet[];

  let totalRefunded = 0;
  await withTransaction(async (q) => {
    for (const bet of pending) {
      await q(`UPDATE bets SET status = 'cancelled', settled_at = ${NOW_SQL} WHERE id = $1`, [bet.id]);
      await q(
        "UPDATE users SET coins = coins + $1, lifetime_earned = lifetime_earned + $1 WHERE id = $2",
        [bet.amount, bet.user_id]
      );
      totalRefunded += Number(bet.amount);
    }
    if (pending.length > 0) {
      await q(
        "INSERT INTO admin_logs (admin_id, action, target_id, details) VALUES ($1, 'cancel_all_bets', NULL, $2)",
        [adminId, `Cancelled ${pending.length} pending bets, refunded ${totalRefunded} coins total`]
      );
    }
  });

  return { cancelled: pending.length, totalRefunded };
}

// ─── Manual Settlement ────────────────────────────────────────────────────────

export interface SettleBetResult {
  success: boolean;
  error?: string;
  outcome?: "won" | "lost" | "void";
  payout?: number;
}

export async function manualSettleBet(
  betId: number,
  outcome: "won" | "lost" | "void",
  adminId: string
): Promise<SettleBetResult> {
  const bet = await getBetById(betId);
  if (!bet) return { success: false, error: `Bet #${betId} not found.` };
  if (bet.status !== "pending") {
    return { success: false, error: `Bet #${betId} is already **${bet.status}**.` };
  }

  await withTransaction(async (q) => {
    await q(`UPDATE bets SET status = $1, settled_at = ${NOW_SQL} WHERE id = $2`, [outcome, betId]);

    if (outcome === "won") {
      await q(
        "UPDATE users SET coins = coins + $1, lifetime_earned = lifetime_earned + $1, total_wins = total_wins + 1 WHERE id = $2",
        [bet.potential_return, bet.user_id]
      );
    } else if (outcome === "void") {
      await q(
        "UPDATE users SET coins = coins + $1, lifetime_earned = lifetime_earned + $1 WHERE id = $2",
        [bet.amount, bet.user_id]
      );
    }

    await q(
      "INSERT INTO admin_logs (admin_id, action, target_id, details) VALUES ($1, 'settle_bet', $2, $3)",
      [adminId, bet.user_id, `Settled bet #${betId} as ${outcome}`]
    );
  });

  const payout =
    outcome === "won" ? Number(bet.potential_return) : outcome === "void" ? Number(bet.amount) : 0;
  return { success: true, outcome, payout };
}
