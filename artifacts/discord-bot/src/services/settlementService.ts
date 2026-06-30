/**
 * Settlement Service
 * Auto-checks completed games and settles pending bets every 15 minutes.
 */

import cron from "node-cron";
import axios from "axios";
import { query, withTransaction } from "../database/index.js";
import type { Bet } from "../types.js";
import { SUPPORTED_SPORTS } from "../types.js";

const NOW_SQL = "EXTRACT(EPOCH FROM NOW())::BIGINT";

function getApiKey(): string {
  const key = process.env.ODDS_API_KEY;
  if (!key) throw new Error("ODDS_API_KEY not set");
  return key;
}

interface ScoreEvent {
  id: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: Array<{ name: string; score: string }> | null;
}

async function fetchCompletedScores(sportKey: string): Promise<ScoreEvent[]> {
  try {
    const resp = await axios.get<ScoreEvent[]>(
      `https://api.the-odds-api.com/v4/sports/${sportKey}/scores`,
      { params: { apiKey: getApiKey(), daysFrom: 3 }, timeout: 10_000 }
    );
    return resp.data.filter((e) => e.completed && e.scores && e.scores.length > 0);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Settlement] ⚠️  Failed to fetch scores for ${sportKey}: ${msg}`);
    return [];
  }
}

/**
 * Void all pending bets whose game started more than 4 days ago.
 * These are permanently outside the Odds API's 3-day scores window and
 * can never be auto-settled — refund the wager so users aren't stuck.
 */
async function voidStaleBets(): Promise<void> {
  const stale = await query<Bet>(
    `SELECT * FROM bets WHERE status = 'pending'
     AND TO_TIMESTAMP(commence_time) < NOW() - INTERVAL '4 days'`
  ) as unknown as Bet[];

  if (stale.length === 0) return;

  console.warn(`[Settlement] ⚠️  Found ${stale.length} stale bet(s) older than 4 days — voiding and refunding.`);

  await withTransaction(async (q) => {
    for (const bet of stale) {
      await q(`UPDATE bets SET status = 'void', settled_at = ${NOW_SQL} WHERE id = $1`, [bet.id]);
      await q(
        "UPDATE users SET coins = coins + $1, lifetime_earned = lifetime_earned + $1 WHERE id = $2",
        [bet.amount, bet.user_id]
      );
      console.warn(
        `[Settlement] ↩️  Voided stale bet #${bet.id} (${bet.away_team} @ ${bet.home_team}, ${bet.sport}) — refunded ${bet.amount} coins to user ${bet.user_id}`
      );
    }
  });
}

function determineBetOutcome(
  bet: Bet,
  homeScore: number,
  awayScore: number
): "won" | "lost" | "push" {
  const { bet_type, team, line, home_team } = bet;

  if (bet_type === "moneyline") {
    if (homeScore === awayScore) return "push";
    const pickedHome = team === home_team;
    const homeWon = homeScore > awayScore;
    return pickedHome === homeWon ? "won" : "lost";
  }

  if (bet_type === "spread") {
    const spread = line ?? 0;
    const pickedHome = team === home_team;
    if (pickedHome) {
      const adj = homeScore + spread;
      if (adj > awayScore) return "won";
      if (adj < awayScore) return "lost";
    } else {
      const adj = awayScore + Math.abs(spread);
      if (adj > homeScore) return "won";
      if (adj < homeScore) return "lost";
    }
    return "push";
  }

  if (bet_type === "total") {
    const totalLine = line ?? 0;
    const actual = homeScore + awayScore;
    if (actual === totalLine) return "push";
    const isOver = team.toLowerCase() === "over";
    return (isOver && actual > totalLine) || (!isOver && actual < totalLine) ? "won" : "lost";
  }

  return "lost";
}

export async function settleGameBets(
  gameId: string,
  homeScore: number,
  awayScore: number
): Promise<{ settled: number; paid: number }> {
  const pendingBets = (await query<Bet>(
    "SELECT * FROM bets WHERE game_id = $1 AND status = 'pending'",
    [gameId]
  )) as unknown as Bet[];

  let settled = 0;
  let paid = 0;

  await withTransaction(async (q) => {
    for (const bet of pendingBets) {
      const outcome = determineBetOutcome(bet, homeScore, awayScore);
      const finalStatus = outcome === "push" ? "void" : outcome;

      await q(`UPDATE bets SET status = $1, settled_at = ${NOW_SQL} WHERE id = $2`, [finalStatus, bet.id]);

      if (outcome === "won") {
        await q(
          "UPDATE users SET coins = coins + $1, lifetime_earned = lifetime_earned + $1, total_wins = total_wins + 1 WHERE id = $2",
          [bet.potential_return, bet.user_id]
        );
        paid += Number(bet.potential_return);
      } else if (outcome === "push") {
        await q(
          "UPDATE users SET coins = coins + $1, lifetime_earned = lifetime_earned + $1 WHERE id = $2",
          [bet.amount, bet.user_id]
        );
        paid += Number(bet.amount);
      }

      settled++;
    }

    await q(
      `UPDATE games SET completed = 1, home_score = $1, away_score = $2, last_updated = ${NOW_SQL} WHERE id = $3`,
      [homeScore, awayScore, gameId]
    );
  });

  return { settled, paid };
}

export function startSettlementScheduler(): void {
  cron.schedule("*/15 * * * *", async () => {
    console.log("[Settlement] Checking for completed games…");

    // Void any bets that have aged past the Odds API's 3-day scores window
    await voidStaleBets();

    const pendingGames = await query<{ game_id: string; sport: string }>(
      "SELECT DISTINCT game_id, sport FROM bets WHERE status = 'pending'"
    );

    if (pendingGames.length === 0) return;

    const bySport: Record<string, string[]> = {};
    for (const { game_id, sport } of pendingGames) {
      if (!bySport[sport]) bySport[sport] = [];
      bySport[sport]!.push(game_id);
    }

    for (const [sportKey, gameIds] of Object.entries(bySport)) {
      if (!(sportKey in SUPPORTED_SPORTS)) continue;
      const scores = await fetchCompletedScores(sportKey);

      for (const score of scores) {
        if (!gameIds.includes(score.id) || !score.scores) continue;

        const homeScore = parseFloat(
          score.scores.find((s) => s.name === score.home_team)?.score ?? "0"
        );
        const awayScore = parseFloat(
          score.scores.find((s) => s.name === score.away_team)?.score ?? "0"
        );

        const { settled, paid } = await settleGameBets(score.id, homeScore, awayScore);
        if (settled > 0) {
          console.log(
            `[Settlement] ${score.home_team} vs ${score.away_team}: ${settled} bets settled, ${paid} coins paid out`
          );
        }
      }
    }
  });

  console.log("[Settlement] Scheduler started (every 15 minutes).");
}
