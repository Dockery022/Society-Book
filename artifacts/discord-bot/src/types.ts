import type {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  Client,
  Collection,
} from "discord.js";

// ─── Bot Client Extension ─────────────────────────────────────────────────────

export interface BotClient extends Client {
  commands: Collection<string, Command>;
}

// ─── Command Definition ───────────────────────────────────────────────────────

export interface Command {
  data:
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
  adminOnly?: boolean;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

// ─── Event Definition ─────────────────────────────────────────────────────────

export interface BotEvent {
  name: string;
  once: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (...args: any[]) => void | Promise<void>;
}

// ─── Database Models ──────────────────────────────────────────────────────────

export interface User {
  id: string;
  coins: number;
  lifetime_earned: number;
  lifetime_lost: number;
  total_bets: number;
  total_wins: number;
  created_at: number;
}

export interface Cooldown {
  user_id: string;
  type: "message" | "reaction_given";
  last_triggered: number;
}

export interface DailyClaim {
  user_id: string;
  last_claimed: string;
}

export interface Bet {
  id: number;
  user_id: string;
  game_id: string;
  sport: string;
  bet_type: "moneyline" | "spread" | "total";
  team: string;
  line: number | null;
  odds: number;
  amount: number;
  potential_return: number;
  status: "pending" | "won" | "lost" | "cancelled" | "void";
  created_at: number;
  settled_at: number | null;
  home_team: string;
  away_team: string;
  commence_time: number;
}

export interface Game {
  id: string;
  sport: string;
  home_team: string;
  away_team: string;
  commence_time: number;
  completed: number;
  home_score: number | null;
  away_score: number | null;
  last_updated: number;
}

export interface AdminLog {
  id: number;
  admin_id: string;
  action: string;
  target_id: string | null;
  details: string | null;
  created_at: number;
}

// ─── Odds API Types ───────────────────────────────────────────────────────────

export interface OddsApiOutcome {
  name: string;
  price: number;
  point?: number;
}

export interface OddsApiMarket {
  key: "h2h" | "spreads" | "totals";
  last_update: string;
  outcomes: OddsApiOutcome[];
}

export interface OddsApiBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: OddsApiMarket[];
}

export interface OddsApiGame {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsApiBookmaker[];
}

// ─── Bet Slip ─────────────────────────────────────────────────────────────────

export interface BetSlip {
  gameId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: number;
  betType: "moneyline" | "spread" | "total";
  team: string;
  line: number | null;
  odds: number;
  amount: number;
  potentialReturn: number;
}

// ─── Supported Sports ─────────────────────────────────────────────────────────

export const SUPPORTED_SPORTS: Record<string, string> = {
  americanfootball_nfl: "NFL",
  americanfootball_ncaaf: "NCAA Football",
  basketball_nba: "NBA",
  basketball_ncaab: "NCAA Basketball",
  baseball_mlb: "MLB",
  soccer_fifa_world_cup: "FIFA World Cup",
  basketball_wnba: "WNBA",
};

export const SPORT_EMOJIS: Record<string, string> = {
  americanfootball_nfl: "🏈",
  americanfootball_ncaaf: "🏈",
  basketball_nba: "🏀",
  basketball_ncaab: "🏀",
  baseball_mlb: "⚾",
  soccer_fifa_world_cup: "⚽",
  basketball_wnba: "🏀",
};
