/**
 * Embeds — pre-built Discord embed builders for consistent UI
 */

import {
  EmbedBuilder,
  Colors,
} from "discord.js";
import type { Bet, User } from "../types.js";
import type { LeaderboardEntry } from "../services/coinService.js";
import { OddsApiGame } from "../types.js";
import {
  formatCoins,
  formatOdds,
  formatBetType,
  formatBetSelection,
  formatBetStatus,
  formatDateTime,
  formatRelativeTime,
  formatWinRate,
  formatSport,
  isoToUnix,
  calcProfitLoss,
} from "./formatters.js";
import { getMarket, getBestBookmaker } from "../services/oddsService.js";

const BRAND_COLOR = 0x1a2332; // Deep navy — The 1912 Society
const WIN_COLOR = 0x2ecc71;
const LOSS_COLOR = 0xe74c3c;
const NEUTRAL_COLOR = 0x95a5a6;

// ─── Balance Embed ────────────────────────────────────────────────────────────

export function buildBalanceEmbed(user: User, username: string): EmbedBuilder {
  const winRate = formatWinRate(user.total_wins, user.total_bets);
  const profit = user.lifetime_earned - user.lifetime_lost - 500; // subtract starting balance

  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle("🏦 The Society Book — Wallet")
    .setDescription(`**${username}'s** account`)
    .addFields(
      { name: "Current Balance", value: formatCoins(user.coins), inline: true },
      { name: "Lifetime Earned", value: formatCoins(user.lifetime_earned), inline: true },
      { name: "\u200b", value: "\u200b", inline: true },
      { name: "Total Bets", value: user.total_bets.toLocaleString(), inline: true },
      { name: "Win Rate", value: winRate, inline: true },
      { name: "Net Profit", value: `${profit >= 0 ? "+" : ""}${formatCoins(profit)}`, inline: true }
    )
    .setFooter({ text: "The 1912 Society Book" })
    .setTimestamp();
}

// ─── Bet Slip Embed ───────────────────────────────────────────────────────────

export function buildBetSlipEmbed(bet: Bet): EmbedBuilder {
  const colorMap: Record<string, number> = {
    pending: BRAND_COLOR,
    won: WIN_COLOR,
    lost: LOSS_COLOR,
    cancelled: NEUTRAL_COLOR,
    void: NEUTRAL_COLOR,
  };

  const embed = new EmbedBuilder()
    .setColor(colorMap[bet.status] ?? BRAND_COLOR)
    .setTitle(`📋 Bet Slip — #${bet.id}`)
    .addFields(
      {
        name: "Matchup",
        value: `${bet.home_team} vs ${bet.away_team}`,
        inline: false,
      },
      { name: "Sport", value: formatSport(bet.sport), inline: true },
      { name: "Market", value: formatBetType(bet.bet_type), inline: true },
      { name: "Selection", value: formatBetSelection(bet), inline: true },
      { name: "Odds", value: formatOdds(bet.odds), inline: true },
      { name: "Wager", value: formatCoins(bet.amount), inline: true },
      { name: "Potential Return", value: formatCoins(bet.potential_return), inline: true },
      { name: "Status", value: formatBetStatus(bet.status), inline: true },
      {
        name: "Game Time",
        value: formatDateTime(bet.commence_time),
        inline: true,
      }
    )
    .setFooter({ text: "The 1912 Society Book" })
    .setTimestamp(bet.created_at * 1000);

  if (bet.status === "won") {
    const profit = bet.potential_return - bet.amount;
    embed.addFields({ name: "Profit", value: `+${formatCoins(profit)}`, inline: true });
  }

  return embed;
}

// ─── My Bets Embed ────────────────────────────────────────────────────────────

export function buildBetsListEmbed(bets: Bet[], username: string, title: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(title)
    .setDescription(bets.length === 0 ? "No bets found." : null)
    .setFooter({ text: `${username} • The 1912 Society Book` })
    .setTimestamp();

  for (const bet of bets.slice(0, 10)) {
    const matchup = `${bet.home_team} vs ${bet.away_team}`;
    const selection = formatBetSelection(bet);
    embed.addFields({
      name: `#${bet.id} — ${formatBetStatus(bet.status)}`,
      value: [
        `**${matchup}**`,
        `${formatBetType(bet.bet_type)} · **${selection}** · ${formatOdds(bet.odds)}`,
        `Wager: **${formatCoins(bet.amount)}** → **${formatCoins(bet.potential_return)}**`,
        `Game: ${formatDateTime(bet.commence_time)}`,
      ].join("\n"),
      inline: false,
    });
  }

  return embed;
}

// ─── History Embed ────────────────────────────────────────────────────────────

export function buildHistoryEmbed(bets: Bet[], username: string): EmbedBuilder {
  const settled = bets.filter((b) => b.status === "won" || b.status === "lost");
  const totalProfit = settled.reduce((sum, b) => sum + calcProfitLoss(b), 0);

  const embed = new EmbedBuilder()
    .setColor(totalProfit >= 0 ? WIN_COLOR : LOSS_COLOR)
    .setTitle("📊 Betting History")
    .setDescription(
      bets.length === 0
        ? "No settled bets yet."
        : `Net P&L: **${totalProfit >= 0 ? "+" : ""}${formatCoins(totalProfit)}**`
    )
    .setFooter({ text: `${username} • The 1912 Society Book` })
    .setTimestamp();

  for (const bet of bets.slice(0, 10)) {
    const matchup = `${bet.home_team} vs ${bet.away_team}`;
    const pl = calcProfitLoss(bet);
    embed.addFields({
      name: `#${bet.id} — ${formatBetStatus(bet.status)}`,
      value: [
        `**${matchup}**`,
        `${formatBetType(bet.bet_type)} · ${formatBetSelection(bet)} · ${formatOdds(bet.odds)}`,
        `Wager: ${formatCoins(bet.amount)} | P&L: **${pl >= 0 ? "+" : ""}${formatCoins(pl)}**`,
      ].join("\n"),
      inline: false,
    });
  }

  return embed;
}

// ─── Leaderboard Embed ────────────────────────────────────────────────────────

export function buildLeaderboardEmbed(
  entries: LeaderboardEntry[],
  sortLabel: string,
  client: import("discord.js").Client
): EmbedBuilder {
  const medals = ["🥇", "🥈", "🥉"];

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f) // Gold
    .setTitle("🏆 The Society Book — Leaderboard")
    .setDescription(`**Sorted by:** ${sortLabel}`)
    .setFooter({ text: "The 1912 Society Book" })
    .setTimestamp();

  if (entries.length === 0) {
    embed.setDescription("No users on the leaderboard yet.");
    return embed;
  }

  const lines = entries.map((entry, i) => {
    const medal = medals[i] ?? `**${i + 1}.**`;
    const user = client.users.cache.get(entry.id);
    const name = user?.username ?? `User ${entry.id.slice(-4)}`;
    const winRate = formatWinRate(entry.total_wins, entry.total_bets);
    return [
      `${medal} **${name}**`,
      `Balance: ${formatCoins(entry.coins)} | Bets: ${entry.total_bets} | WR: ${winRate}`,
    ].join("\n");
  });

  embed.setDescription(`**Sorted by:** ${sortLabel}\n\n${lines.join("\n\n")}`);
  return embed;
}

// ─── Game Odds Embed ──────────────────────────────────────────────────────────

export function buildGameEmbed(game: OddsApiGame): EmbedBuilder {
  const commence = isoToUnix(game.commence_time);
  const bm = getBestBookmaker(game);

  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(`🎰 ${game.away_team} @ ${game.home_team}`)
    .setDescription(
      `**${formatSport(game.sport_key)}** · ${formatDateTime(commence)} (${formatRelativeTime(commence)})`
    )
    .setFooter({ text: "The 1912 Society Book" })
    .setTimestamp();

  if (!bm) {
    embed.addFields({ name: "Odds", value: "No odds available yet.", inline: false });
    return embed;
  }

  // Moneyline
  const h2h = bm.markets.find((m) => m.key === "h2h");
  if (h2h) {
    const away = h2h.outcomes.find((o) => o.name === game.away_team);
    const home = h2h.outcomes.find((o) => o.name === game.home_team);
    embed.addFields({
      name: "💵 Moneyline",
      value: `${game.away_team}: **${formatOdds(away?.price ?? 0)}**\n${game.home_team}: **${formatOdds(home?.price ?? 0)}**`,
      inline: true,
    });
  }

  // Spread
  const spreads = bm.markets.find((m) => m.key === "spreads");
  if (spreads) {
    const away = spreads.outcomes.find((o) => o.name === game.away_team);
    const home = spreads.outcomes.find((o) => o.name === game.home_team);
    const awayPts = away?.point ?? 0;
    const homePts = home?.point ?? 0;
    embed.addFields({
      name: "📊 Spread",
      value: `${game.away_team}: **${awayPts > 0 ? "+" : ""}${awayPts}** (${formatOdds(away?.price ?? 0)})\n${game.home_team}: **${homePts > 0 ? "+" : ""}${homePts}** (${formatOdds(home?.price ?? 0)})`,
      inline: true,
    });
  }

  // Total
  const totals = bm.markets.find((m) => m.key === "totals");
  if (totals) {
    const over = totals.outcomes.find((o) => o.name === "Over");
    const under = totals.outcomes.find((o) => o.name === "Under");
    embed.addFields({
      name: "🔢 Over/Under",
      value: `O${over?.point}: **${formatOdds(over?.price ?? 0)}**\nU${under?.point}: **${formatOdds(under?.price ?? 0)}**`,
      inline: true,
    });
  }

  embed.addFields({ name: "\u200b", value: `Via **${bm.title}**`, inline: false });
  return embed;
}

// ─── Error Embed ──────────────────────────────────────────────────────────────

export function buildErrorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(LOSS_COLOR)
    .setTitle("❌ Error")
    .setDescription(message)
    .setFooter({ text: "The 1912 Society Book" });
}

// ─── Success Embed ────────────────────────────────────────────────────────────

export function buildSuccessEmbed(title: string, message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(WIN_COLOR)
    .setTitle(`✅ ${title}`)
    .setDescription(message)
    .setFooter({ text: "The 1912 Society Book" });
}
