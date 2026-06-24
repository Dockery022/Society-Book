/**
 * Embeds — pre-built Discord embed builders for consistent UI
 */

import {
  EmbedBuilder,
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
import { withFlag } from "./countryFlags.js";
import { withTeamEmoji } from "./teamEmojis.js";
import { getEmoji } from "./emojiCache.js";

const MONEY_GREEN = 0x2ecc71; // Money green — used for all embeds
const WIN_COLOR   = 0x2ecc71;
const LOSS_COLOR  = 0xe74c3c;
const NEUTRAL_COLOR = 0x95a5a6;

const FOOTER_TEXT = "The 1912 Society Book • Odds provided by The Odds API";

// ─── Balance Embed ────────────────────────────────────────────────────────────

export function buildBalanceEmbed(user: User, username: string): EmbedBuilder {
  const winRate = formatWinRate(user.total_wins, user.total_bets);
  const profit = user.lifetime_earned - user.lifetime_lost - 500;

  return new EmbedBuilder()
    .setColor(MONEY_GREEN)
    .setTitle("🏦 The Society Book — Wallet")
    .setDescription(`**${username}'s** account`)
    .addFields(
      { name: "Current Balance",  value: formatCoins(user.coins),          inline: true },
      { name: "Lifetime Earned",  value: formatCoins(user.lifetime_earned), inline: true },
      { name: "\u200b",           value: "\u200b",                          inline: true },
      { name: "Total Bets",       value: user.total_bets.toLocaleString(),  inline: true },
      { name: "Win Rate",         value: winRate,                           inline: true },
      {
        name: "Net Profit",
        value: `${profit >= 0 ? "+" : ""}${formatCoins(profit)}`,
        inline: true,
      }
    )
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp();
}

// ─── Bet Slip Embed ───────────────────────────────────────────────────────────

export function buildBetSlipEmbed(bet: Bet): EmbedBuilder {
  const colorMap: Record<string, number> = {
    pending:   MONEY_GREEN,
    won:       WIN_COLOR,
    lost:      LOSS_COLOR,
    cancelled: NEUTRAL_COLOR,
    void:      NEUTRAL_COLOR,
  };

  const awayD    = decorateTeam(bet.away_team, bet.sport);
  const homeD    = decorateTeam(bet.home_team, bet.sport);
  const selRaw   = formatBetSelection(bet);
  const selValue = bet.bet_type === "h2h" ? decorateTeam(selRaw, bet.sport) : selRaw;

  const embed = new EmbedBuilder()
    .setColor(colorMap[bet.status] ?? MONEY_GREEN)
    .setTitle(`📋 Bet Slip — #${bet.id}`)
    .addFields(
      { name: "Matchup",          value: `${homeD} vs ${awayD}`,    inline: false },
      { name: "Sport",            value: formatSport(bet.sport),     inline: true  },
      { name: "Market",           value: formatBetType(bet.bet_type), inline: true  },
      { name: "Selection",        value: selValue,                   inline: true  },
      { name: "Odds",             value: formatOdds(bet.odds),                    inline: true  },
      { name: "Wager",            value: formatCoins(bet.amount),                 inline: true  },
      { name: "Potential Return", value: formatCoins(bet.potential_return),        inline: true  },
      { name: "Status",           value: formatBetStatus(bet.status),             inline: true  },
      { name: "Game Time",        value: formatDateTime(bet.commence_time),       inline: true  },
    )
    .setFooter({ text: FOOTER_TEXT })
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
    .setColor(MONEY_GREEN)
    .setTitle(title)
    .setDescription(bets.length === 0 ? "No bets found." : null)
    .setFooter({ text: `${username} • ${FOOTER_TEXT}` })
    .setTimestamp();

  for (const bet of bets.slice(0, 10)) {
    const matchup   = `${decorateTeam(bet.home_team, bet.sport)} vs ${decorateTeam(bet.away_team, bet.sport)}`;
    const selRaw    = formatBetSelection(bet);
    const selection = bet.bet_type === "h2h" ? decorateTeam(selRaw, bet.sport) : selRaw;
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
  const settled    = bets.filter((b) => b.status === "won" || b.status === "lost");
  const totalProfit = settled.reduce((sum, b) => sum + calcProfitLoss(b), 0);

  const embed = new EmbedBuilder()
    .setColor(totalProfit >= 0 ? WIN_COLOR : LOSS_COLOR)
    .setTitle("📊 Betting History")
    .setDescription(
      bets.length === 0
        ? "No settled bets yet."
        : `Net P&L: **${totalProfit >= 0 ? "+" : ""}${formatCoins(totalProfit)}**`
    )
    .setFooter({ text: `${username} • ${FOOTER_TEXT}` })
    .setTimestamp();

  for (const bet of bets.slice(0, 10)) {
    const matchup = `${decorateTeam(bet.home_team, bet.sport)} vs ${decorateTeam(bet.away_team, bet.sport)}`;
    const pl      = calcProfitLoss(bet);
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
  names: Map<string, string>
): EmbedBuilder {
  const medals = ["🥇", "🥈", "🥉"];

  const embed = new EmbedBuilder()
    .setColor(MONEY_GREEN)
    .setTitle("🏆 The Society Book — Leaderboard")
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp();

  if (entries.length === 0) {
    embed.setDescription("No users on the leaderboard yet.");
    return embed;
  }

  const lines = entries.map((entry, i) => {
    const medal   = medals[i] ?? `**${i + 1}.**`;
    const name    = names.get(entry.id) ?? `User ${entry.id.slice(-4)}`;
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

function decorateTeam(teamName: string, sportKey: string): string {
  if (sportKey.startsWith("soccer_")) return withFlag(teamName);
  return teamName;
}

export function buildGameEmbed(game: OddsApiGame): EmbedBuilder {
  const commence  = isoToUnix(game.commence_time);
  const bm        = getBestBookmaker(game);
  const awayLabel = decorateTeam(game.away_team, game.sport_key);
  const homeLabel = decorateTeam(game.home_team, game.sport_key);

  const embed = new EmbedBuilder()
    .setColor(MONEY_GREEN)
    .setTitle(`🎰 ${awayLabel} @ ${homeLabel}`)
    .setDescription(
      `**${formatSport(game.sport_key)}** · ${formatDateTime(commence)} (${formatRelativeTime(commence)})`
    )
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp();

  if (!bm) {
    embed.addFields({ name: "Odds", value: "No odds available yet.", inline: false });
    return embed;
  }

  const h2h = bm.markets.find((m) => m.key === "h2h");
  if (h2h) {
    const away = h2h.outcomes.find((o) => o.name === game.away_team);
    const home = h2h.outcomes.find((o) => o.name === game.home_team);
    embed.addFields({
      name: "💵 Moneyline",
      value: `${awayLabel}: **${formatOdds(away?.price ?? 0)}**\n${homeLabel}: **${formatOdds(home?.price ?? 0)}**`,
      inline: true,
    });
  }

  const spreads = bm.markets.find((m) => m.key === "spreads");
  if (spreads) {
    const away    = spreads.outcomes.find((o) => o.name === game.away_team);
    const home    = spreads.outcomes.find((o) => o.name === game.home_team);
    const awayPts = away?.point ?? 0;
    const homePts = home?.point ?? 0;
    embed.addFields({
      name: "📊 Spread",
      value: `${awayLabel}: **${awayPts > 0 ? "+" : ""}${awayPts}** (${formatOdds(away?.price ?? 0)})\n${homeLabel}: **${homePts > 0 ? "+" : ""}${homePts}** (${formatOdds(home?.price ?? 0)})`,
      inline: true,
    });
  }

  const totals = bm.markets.find((m) => m.key === "totals");
  if (totals) {
    const over  = totals.outcomes.find((o) => o.name === "Over");
    const under = totals.outcomes.find((o) => o.name === "Under");
    embed.addFields({
      name: "🔢 Over/Under",
      value: `O${over?.point}: **${formatOdds(over?.price ?? 0)}**\nU${under?.point}: **${formatOdds(under?.price ?? 0)}**`,
      inline: true,
    });
  }

  const BOOKMAKER_EMOJI_NAMES: Record<string, string> = {
    draftkings: "DK",
    fanduel: "FD",
    betmgm: "BetMGM",
    pointsbet: "PointsBet",
    bovada: "Bovada",
  };
  const emojiName = BOOKMAKER_EMOJI_NAMES[bm.key] ?? bm.key;
  const bmEmoji = getEmoji(emojiName, "");
  const bmLabel = bmEmoji ? `${bmEmoji} **${bm.title}**` : `**${bm.title}**`;
  embed.addFields({ name: "\u200b", value: `Via ${bmLabel}`, inline: false });
  return embed;
}

// ─── Error Embed ──────────────────────────────────────────────────────────────

export function buildErrorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(LOSS_COLOR)
    .setTitle("❌ Error")
    .setDescription(message)
    .setFooter({ text: FOOTER_TEXT });
}

// ─── Success Embed ────────────────────────────────────────────────────────────

export function buildSuccessEmbed(title: string, message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(MONEY_GREEN)
    .setTitle(`✅ ${title}`)
    .setDescription(message)
    .setFooter({ text: FOOTER_TEXT });
}
