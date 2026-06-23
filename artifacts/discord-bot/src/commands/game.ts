import {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ComponentType,
  EmbedBuilder,
} from "discord.js";
import type { Command } from "../types.js";
import { SUPPORTED_SPORTS, SPORT_EMOJIS } from "../types.js";
import { getGamesWithOdds } from "../services/oddsService.js";
import { buildGameEmbed, buildErrorEmbed } from "../utils/embeds.js";
import { isoToUnix } from "../utils/formatters.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("game")
    .setDescription("Browse upcoming games and view live betting odds.")
    .addStringOption((opt) =>
      opt
        .setName("sport")
        .setDescription("Pick a sport to browse")
        .setRequired(true)
        .addChoices(
          ...Object.entries(SUPPORTED_SPORTS).map(([key, name]) => ({
            name,
            value: key,
          }))
        )
    ),

  async execute(interaction) {
    const sportKey = interaction.options.getString("sport", true);
    await interaction.deferReply();

    let games;
    try {
      games = await getGamesWithOdds(sportKey);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      await interaction.editReply({
        embeds: [buildErrorEmbed(`Failed to fetch odds: ${msg}`)],
      });
      return;
    }

    // Filter to upcoming games only (next 7 days)
    const now = Date.now();
    const upcoming = games
      .filter((g) => new Date(g.commence_time).getTime() > now)
      .sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime())
      .slice(0, 25); // Discord select menu max

    if (upcoming.length === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x95a5a6)
            .setTitle("No Upcoming Games")
            .setDescription(`No upcoming ${SUPPORTED_SPORTS[sportKey]} games with odds available right now.`)
            .setFooter({ text: "The 1912 Society Book" }),
        ],
      });
      return;
    }

    // Build game select menu
    const sportEmoji = SPORT_EMOJIS[sportKey] ?? "🏟️";
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("game_select")
      .setPlaceholder(`${sportEmoji} Select a game to view odds…`)
      .addOptions(
        upcoming.map((g) => {
          const gameTime = new Date(g.commence_time);
          const dateStr = gameTime.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZone: "America/New_York",
          });
          return new StringSelectMenuOptionBuilder()
            .setLabel(`${g.away_team} @ ${g.home_team}`)
            .setValue(g.id)
            .setDescription(dateStr + " ET");
        })
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    // Show first game by default
    const firstGame = upcoming[0]!;
    const firstEmbed = buildGameEmbed(firstGame);

    const reply = await interaction.editReply({
      embeds: [firstEmbed],
      components: [row],
    });

    // Listen for game selection
    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 120_000,
      filter: (i) => i.user.id === interaction.user.id,
    });

    collector.on("collect", async (selectInteraction) => {
      const gameId = selectInteraction.values[0]!;
      const selectedGame = upcoming.find((g) => g.id === gameId);
      if (!selectedGame) {
        await selectInteraction.update({
          embeds: [buildErrorEmbed("Game not found.")],
          components: [row],
        });
        return;
      }

      const gameEmbed = buildGameEmbed(selectedGame);
      await selectInteraction.update({ embeds: [gameEmbed], components: [row] });
    });

    collector.on("end", async () => {
      try {
        await interaction.editReply({ components: [] });
      } catch {
        // Ignored
      }
    });
  },
};

export default command;
