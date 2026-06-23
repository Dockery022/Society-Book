/**
 * Odds Service
 * Fetches game odds from The Odds API (https://the-odds-api.com/v4/)
 */

import axios from "axios";
import type { OddsApiGame, OddsApiMarket } from "../types.js";
import { SUPPORTED_SPORTS } from "../types.js";

const BASE_URL = "https://api.the-odds-api.com/v4";
const PREFERRED_BOOKMAKER = "draftkings";
const FALLBACK_BOOKMAKERS = ["fanduel", "betmgm", "pointsbet", "bovada"];

function getApiKey(): string {
  const key = process.env.ODDS_API_KEY;
  if (!key) throw new Error("ODDS_API_KEY environment variable is not set.");
  return key;
}

// ─── Fetch Games with Odds ────────────────────────────────────────────────────

export async function getGamesWithOdds(sportKey: string): Promise<OddsApiGame[]> {
  const apiKey = getApiKey();

  const resp = await axios.get<OddsApiGame[]>(
    `${BASE_URL}/sports/${sportKey}/odds`,
    {
      params: {
        apiKey,
        regions: "us",
        markets: "h2h,spreads,totals",
        oddsFormat: "american",
        dateFormat: "iso",
      },
      timeout: 10_000,
    }
  );

  return resp.data;
}

export async function getGameById(
  sportKey: string,
  gameId: string
): Promise<OddsApiGame | null> {
  const games = await getGamesWithOdds(sportKey);
  return games.find((g) => g.id === gameId) ?? null;
}

// ─── Extract Best Available Odds ──────────────────────────────────────────────

export function getBestBookmaker(game: OddsApiGame): OddsApiGame["bookmakers"][0] | null {
  if (!game.bookmakers || game.bookmakers.length === 0) return null;

  const preferred = game.bookmakers.find((b) => b.key === PREFERRED_BOOKMAKER);
  if (preferred) return preferred;

  for (const key of FALLBACK_BOOKMAKERS) {
    const bm = game.bookmakers.find((b) => b.key === key);
    if (bm) return bm;
  }

  return game.bookmakers[0] ?? null;
}

export function getMarket(
  game: OddsApiGame,
  marketKey: "h2h" | "spreads" | "totals"
): OddsApiMarket | null {
  const bookmaker = getBestBookmaker(game);
  if (!bookmaker) return null;
  return bookmaker.markets.find((m) => m.key === marketKey) ?? null;
}

// ─── Odds Helpers ─────────────────────────────────────────────────────────────

/** Calculate potential return from American odds + wager amount */
export function calcPotentialReturn(americanOdds: number, wagerAmount: number): number {
  let profit: number;
  if (americanOdds > 0) {
    profit = (wagerAmount * americanOdds) / 100;
  } else {
    profit = (wagerAmount / Math.abs(americanOdds)) * 100;
  }
  return Math.floor(wagerAmount + profit);
}

/** Format American odds for display (+150 / -110) */
export function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

// ─── Sport Listing ────────────────────────────────────────────────────────────

export function getSupportedSports(): Array<{ key: string; name: string }> {
  return Object.entries(SUPPORTED_SPORTS).map(([key, name]) => ({ key, name }));
}

/** Check if a sport key is supported */
export function isSupportedSport(key: string): boolean {
  return key in SUPPORTED_SPORTS;
}
