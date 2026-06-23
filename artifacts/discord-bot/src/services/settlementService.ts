/**
 * Settlement Service
 * Auto-checks completed games and settles pending bets every 15 minutes.
 */

import cron from "node-cron";
import axios from "axios";
import db, { transaction } from "../database/index.js";
import * as coinService from "./coinService.js";
import type { Bet } from "../types.js";
import { SUPPORTED_SPORTS } from "../types.js";

function getApiKey(): string {
  const key = process.env.ODDS_API_KEY;
  if (!key) throw new Error("ODDS_API_KEY not set");
  return key;
}

// ─── Fetch Completed Scores ───────────────────────────────────────────────────

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
  } catch {
    return [];
  }
}

// ─── Determine Bet Outcome ────────────────────────────────────────────────────

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
    // Adjust scores by spread for the chosen side
    const adjustedHome = pickedHome ? homeScore + spread : homeScore;
    const adjustedAway = pickedHome ? awayScore : awayScore + Math.abs(spread);
    if (pickedHome) {
      if (adjustedHome > awayScore) return "won";
      if (adjustedHome < awayScore) return "lost";
    } else {
      if (adjustedAway > homeScore) return "won";
      if (adjustedAway < homeScore) return "lost";
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

// ─── Settle Bets for a Game ───────────────────────────────────────────────────

export function settleGameBets(
  gameId: string,
  homeScore: number,
  awayScore: number
): { settled: number; paid: number } {
  const pendingBets = db
    .prepare("SELECT * FROM bets WHERE game_id = ? AND status = 'pending'")
    .all(gameId) as Bet[];

  let settled = 0;
  let paid = 0;

  transaction(() => {
    for (const bet of pendingBets) {
      const outcome = determineBetOutcome(bet, homeScore, awayScore);
      const finalStatus = outcome === "push" ? "void" : outcome;

      db.prepare(
        "UPDATE bets SET status = ?, settled_at = unixepoch() WHERE id = ?"
      ).run(finalStatus, bet.id);

      if (outcome === "won") {
        coinService.addCoins(bet.user_id, bet.potential_return);
        coinService.recordBetWin(bet.user_id, bet.potential_return - bet.amount);
        paid += bet.potential_return;
      } else if (outcome === "push") {
        coinService.addCoins(bet.user_id, bet.amount);
        paid += bet.amount;
      }

      settled++;
    }

    db.prepare(
      "UPDATE games SET completed = 1, home_score = ?, away_score = ?, last_updated = unixepoch() WHERE id = ?"
    ).run(homeScore, awayScore, gameId);
  })();

  return { settled, paid };
}

// ─── Auto-Settlement Cron Job ─────────────────────────────────────────────────

export function startSettlementScheduler(): void {
  cron.schedule("*/15 * * * *", async () => {
    console.log("[Settlement] Checking for completed games…");

    const pendingGames = db
      .prepare("SELECT DISTINCT game_id, sport FROM bets WHERE status = 'pending'")
      .all() as { game_id: string; sport: string }[];

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

        const { settled, paid } = settleGameBets(score.id, homeScore, awayScore);
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
