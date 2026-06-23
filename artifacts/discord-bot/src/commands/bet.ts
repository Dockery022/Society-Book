/**
 * /bet command — multi-step flow for placing wagers.
 *
 * Flow:
 *   1. /bet → pick a sport
 *   2. Pick a game
 *   3. Pick a market (Moneyline / Spread / Over-Under)
 *   4. Pick a selection → enter amount via modal → bet placed
 *
 * Selection and amount steps are shared with /game via betFlow.ts.
 */

import {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import type { Command, OddsApiGame } from "../types.js";
import { SUPPORTED_SPORTS, SPORT_EMOJIS } from "../types.js";
import { getGamesWithOdds } from "../services/oddsService.js";
import { areBetsLocked } from "../services/bettingService.js";
import { buildErrorEmbed } from "../utils/embeds.js";
import { isoToUnix, formatDateTime } from "../utils/formatters.js";
import { showSelectionMenu, type MarketKey } from "../utils/betFlow.js";

const TIMEOUT_MS = 180_000;

// ─── Step 1: Sport selection ──────────────────────────────────────────────────

async function showSportSelect(interaction: ChatInputCommandInteraction): Promise<void> {
  const select = new StringSelectMenuBuilder()
    .setCustomId("bet_sport")
    .setPlaceholder("Choose a sport…")
    .addOptions(
      Object.entries(SUPPORTED_SPORTS).map(([key, name]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(name)
          .setValue(key)
          .setEmoji(SPORT_EMOJIS[key] ?? "🏟️")
      )
    );

  const embed = new EmbedBuilder()
    .setColor(0x1a2332)
    .setTitle("🎰 Place a Bet — Step 1 of 4")
    .setDescription("Select a **sport** to browse upcoming games.")
    .setFooter({ text: "The 1912 Society Book • This menu expires in 3 minutes" });

  const reply = await interaction.editReply({
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
  });

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: TIMEOUT_MS,
    max: 1,
    filter: (i) => i.customId === "bet_sport" && i.user.id === interaction.user.id,
  });

  collector.on("collect", async (i) => {
    await showGameSelect(i, i.values[0]!, interaction);
  });

  collector.on("end", async (_, reason) => {
    if (reason === "time") {
      try { await interaction.editReply({ components: [] }); } catch { /* ignored */ }
    }
  });
}

// ─── Step 2: Game selection ───────────────────────────────────────────────────

async function showGameSelect(
  interaction: StringSelectMenuInteraction,
  sportKey: string,
  originalInteraction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor(0x1a2332)
        .setTitle("🎰 Place a Bet — Step 2 of 4")
        .setDescription(`Fetching **${SUPPORTED_SPORTS[sportKey]}** games…`),
    ],
    components: [],
  });

  let games: OddsApiGame[];
  try {
    games = await getGamesWithOdds(sportKey);
  } catch {
    await originalInteraction.editReply({
      embeds: [buildErrorEmbed("Failed to fetch games. Please try again.")],
      components: [],
    });
    return;
  }

  const now = Date.now();
  const upcoming = games
    .filter((g) => new Date(g.commence_time).getTime() > now)
    .sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime())
    .slice(0, 25);

  if (upcoming.length === 0) {
    await originalInteraction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x95a5a6)
          .setDescription(`No upcoming ${SUPPORTED_SPORTS[sportKey]} games available.`),
      ],
      components: [],
    });
    return;
  }

  const gameSelect = new StringSelectMenuBuilder()
    .setCustomId("bet_game")
    .setPlaceholder("Choose a game…")
    .addOptions(
      upcoming.map((g) => {
        const dt = new Date(g.commence_time).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: "America/New_York",
        });
        return new StringSelectMenuOptionBuilder()
          .setLabel(`${g.away_team} @ ${g.home_team}`)
          .setValue(g.id)
          .setDescription(dt + " ET");
      })
    );

  const reply = await originalInteraction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x1a2332)
        .setTitle("🎰 Place a Bet — Step 2 of 4")
        .setDescription(`**${SUPPORTED_SPORTS[sportKey]}** — Select a game to bet on.`)
        .setFooter({ text: "The 1912 Society Book" }),
    ],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(gameSelect)],
  });

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: TIMEOUT_MS,
    max: 1,
    filter: (i) => i.customId === "bet_game" && i.user.id === originalInteraction.user.id,
  });

  collector.on("collect", async (i) => {
    const game = upcoming.find((g) => g.id === i.values[0]!)!;
    await showMarketSelect(i, game, sportKey, originalInteraction);
  });
}

// ─── Step 3: Market (bet type) selection ─────────────────────────────────────

async function showMarketSelect(
  interaction: StringSelectMenuInteraction,
  game: OddsApiGame,
  sportKey: string,
  originalInteraction: ChatInputCommandInteraction
): Promise<void> {
  const commence = isoToUnix(game.commence_time);

  const embed = new EmbedBuilder()
    .setColor(0x1a2332)
    .setTitle("🎰 Place a Bet — Step 3 of 4")
    .setDescription(
      `**${game.away_team} @ ${game.home_team}**\n${formatDateTime(commence)}\n\nSelect a **market** to bet on.`
    )
    .setFooter({ text: "The 1912 Society Book" });

  const moneylineBtn = new ButtonBuilder()
    .setCustomId("bet_market_moneyline")
    .setLabel("💵 Moneyline")
    .setStyle(ButtonStyle.Primary);

  const spreadBtn = new ButtonBuilder()
    .setCustomId("bet_market_spread")
    .setLabel("📊 Spread")
    .setStyle(ButtonStyle.Primary);

  const totalBtn = new ButtonBuilder()
    .setCustomId("bet_market_total")
    .setLabel("🔢 Over/Under")
    .setStyle(ButtonStyle.Primary);

  const backBtn = new ButtonBuilder()
    .setCustomId("bet_back")
    .setLabel("← Back")
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    moneylineBtn,
    spreadBtn,
    totalBtn,
    backBtn
  );

  const reply = await interaction.update({ embeds: [embed], components: [row] });

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: TIMEOUT_MS,
    max: 1,
    filter: (i) =>
      (i.customId.startsWith("bet_market_") || i.customId === "bet_back") &&
      i.user.id === originalInteraction.user.id,
  });

  collector.on("collect", async (btnInteraction) => {
    if (btnInteraction.customId === "bet_back") {
      await showSportSelect(originalInteraction);
      return;
    }

    const marketKey = btnInteraction.customId.replace("bet_market_", "") as MarketKey;
    await showSelectionMenu(btnInteraction, game, sportKey, marketKey, originalInteraction);
  });
}

// ─── Command Definition ───────────────────────────────────────────────────────

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("bet")
    .setDescription("Place a wager on an upcoming game using 1912 Coins."),

  async execute(interaction) {
    if (areBetsLocked()) {
      await interaction.reply({
        content: "🔒 Betting is currently **locked** by an admin. Check back soon!",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: false });
    await showSportSelect(interaction);
  },
};

export default command;
