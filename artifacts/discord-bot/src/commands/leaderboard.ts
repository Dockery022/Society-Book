import {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ComponentType,
} from "discord.js";
import type { Command } from "../types.js";
import { getLeaderboard } from "../services/coinService.js";
import { buildLeaderboardEmbed } from "../utils/embeds.js";

const SORT_OPTIONS = [
  { label: "💰 Current Balance", value: "coins", description: "Highest coin balance" },
  { label: "📈 Lifetime Profit", value: "lifetime_earned", description: "Most coins ever earned" },
  { label: "🎯 Win Rate", value: "win_rate", description: "Best win percentage (min 1 bet)" },
  { label: "🎲 Total Bets", value: "total_bets", description: "Most bets placed" },
] as const;

type SortKey = (typeof SORT_OPTIONS)[number]["value"];

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the top 10 players on The Society Book leaderboard."),

  async execute(interaction) {
    await interaction.deferReply();

    // Build default embed (sorted by balance)
    const entries = getLeaderboard("coins");
    const embed = buildLeaderboardEmbed(entries, "Current Balance", interaction.client);

    // Sort selector
    const select = new StringSelectMenuBuilder()
      .setCustomId("leaderboard_sort")
      .setPlaceholder("Sort by…")
      .addOptions(
        SORT_OPTIONS.map((opt) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(opt.label)
            .setValue(opt.value)
            .setDescription(opt.description)
        )
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

    const reply = await interaction.editReply({
      embeds: [embed],
      components: [row],
    });

    // Listen for sort changes for 60 seconds
    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 60_000,
      filter: (i) => i.user.id === interaction.user.id,
    });

    collector.on("collect", async (selectInteraction) => {
      const sortKey = selectInteraction.values[0] as SortKey;
      const sortOption = SORT_OPTIONS.find((o) => o.value === sortKey)!;

      const newEntries = getLeaderboard(sortKey);
      const newEmbed = buildLeaderboardEmbed(
        newEntries,
        sortOption.label,
        interaction.client
      );

      await selectInteraction.update({ embeds: [newEmbed], components: [row] });
    });

    collector.on("end", async () => {
      try {
        await interaction.editReply({ components: [] });
      } catch {
        // Message may have been deleted
      }
    });
  },
};

export default command;
