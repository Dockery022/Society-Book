import {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ComponentType,
  EmbedBuilder,
} from "discord.js";
import type { Command, OddsApiGame } from "../types.js";
import { SUPPORTED_SPORTS, SPORT_EMOJIS } from "../types.js";
import { getGamesWithOdds } from "../services/oddsService.js";
import { areBetsLocked } from "../services/bettingService.js";
import { buildGameEmbed, buildErrorEmbed } from "../utils/embeds.js";
import { isoToUnix } from "../utils/formatters.js";
import { showSelectionMenu, type MarketKey } from "../utils/betFlow.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("game")
    .setDescription("Browse upcoming games, view live odds, and place a bet.")
    .addStringOption((opt) =>
      opt
        .setName("sport")
        .setDescription("Pick a sport to browse")
        .setRequired(true)
        .addChoices(
          ...Object.entries(SUPPORTED_SPORTS).map(([key, name]) => ({ name, value: key }))
        )
    ),

  async execute(interaction) {
    const sportKey = interaction.options.getString("sport", true);
    await interaction.deferReply();

    let games: OddsApiGame[];
    try {
      games = await getGamesWithOdds(sportKey);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      await interaction.editReply({
        embeds: [buildErrorEmbed(`Failed to fetch odds: ${msg}`)],
      });
      return;
    }

    const now = Date.now();
    const upcoming = games
      .filter((g) => new Date(g.commence_time).getTime() > now)
      .sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime())
      .slice(0, 25);

    if (upcoming.length === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x95a5a6)
            .setTitle("No Upcoming Games")
            .setDescription(
              `No upcoming ${SUPPORTED_SPORTS[sportKey]} games with odds available right now.`
            )
            .setFooter({ text: "The 1912 Society Book" }),
        ],
      });
      return;
    }

    // ── Build game select row ──────────────────────────────────────────────────
    const sportEmoji = SPORT_EMOJIS[sportKey] ?? "🏟️";
    const buildGameRow = (selectedId?: string) =>
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("game_select")
          .setPlaceholder(`${sportEmoji} Select a game to view odds…`)
          .addOptions(
            upcoming.map((g) => {
              const dateStr = new Date(g.commence_time).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZone: "America/New_York",
              });
              const opt = new StringSelectMenuOptionBuilder()
                .setLabel(`${g.away_team} @ ${g.home_team}`)
                .setValue(g.id)
                .setDescription(dateStr + " ET");
              if (g.id === selectedId) opt.setDefault(true);
              return opt;
            })
          )
      );

    // ── Build market select row ────────────────────────────────────────────────
    const marketRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("game_market")
        .setPlaceholder("💰 Place a bet — select a market…")
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel("💵 Moneyline")
            .setValue("moneyline")
            .setDescription("Pick a team to win outright"),
          new StringSelectMenuOptionBuilder()
            .setLabel("📊 Spread")
            .setValue("spread")
            .setDescription("Bet against the point spread"),
          new StringSelectMenuOptionBuilder()
            .setLabel("🔢 Over/Under")
            .setValue("total")
            .setDescription("Bet on the combined total score")
        )
    );

    // Show first game by default
    let currentGame = upcoming[0]!;
    const reply = await interaction.editReply({
      embeds: [buildGameEmbed(currentGame)],
      components: [buildGameRow(currentGame.id), marketRow],
    });

    // ── Collector for both dropdowns ───────────────────────────────────────────
    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 120_000,
      filter: (i) => i.user.id === interaction.user.id,
    });

    collector.on("collect", async (selectInteraction) => {
      // Game switcher
      if (selectInteraction.customId === "game_select") {
        const gameId = selectInteraction.values[0]!;
        currentGame = upcoming.find((g) => g.id === gameId) ?? currentGame;
        await selectInteraction.update({
          embeds: [buildGameEmbed(currentGame)],
          components: [buildGameRow(currentGame.id), marketRow],
        });
        return;
      }

      // Market picker — hand off to the shared bet flow
      if (selectInteraction.customId === "game_market") {
        if (areBetsLocked()) {
          await selectInteraction.update({
            embeds: [buildErrorEmbed("🔒 Betting is currently **locked** by an admin.")],
            components: [],
          });
          collector.stop();
          return;
        }

        const marketKey = selectInteraction.values[0]! as MarketKey;
        collector.stop("market_selected");
        await showSelectionMenu(
          selectInteraction,
          currentGame,
          sportKey,
          marketKey,
          interaction
        );
      }
    });

    collector.on("end", async (_, reason) => {
      if (reason === "time") {
        try {
          await interaction.editReply({ components: [] });
        } catch { /* ignored */ }
      }
    });
  },
};

export default command;
