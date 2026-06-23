import {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ComponentType,
} from "discord.js";
import type { Command } from "../types.js";
import { getUserBets } from "../services/bettingService.js";
import { buildBetsListEmbed } from "../utils/embeds.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("mybets")
    .setDescription("View your current open/pending wagers.")
    .addStringOption((opt) =>
      opt
        .setName("status")
        .setDescription("Filter by bet status (default: pending)")
        .setRequired(false)
        .addChoices(
          { name: "⏳ Pending", value: "pending" },
          { name: "✅ Won", value: "won" },
          { name: "❌ Lost", value: "lost" },
          { name: "🚫 Cancelled", value: "cancelled" }
        )
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    const status = interaction.options.getString("status") ?? "pending";
    const bets = getUserBets(interaction.user.id, status, 10);

    const statusLabels: Record<string, string> = {
      pending: "⏳ Open Bets",
      won: "✅ Winning Bets",
      lost: "❌ Lost Bets",
      cancelled: "🚫 Cancelled Bets",
    };

    const embed = buildBetsListEmbed(
      bets,
      interaction.user.username,
      `📋 ${statusLabels[status] ?? "Your Bets"}`
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
