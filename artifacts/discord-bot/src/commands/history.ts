import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { getUserBets } from "../services/bettingService.js";
import { buildHistoryEmbed } from "../utils/embeds.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("history")
    .setDescription("View your recent betting history and profit/loss.")
    .addIntegerOption((opt) =>
      opt
        .setName("limit")
        .setDescription("How many bets to show (1–20, default: 10)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(20)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const limit = interaction.options.getInteger("limit") ?? 10;
    const bets = getUserBets(interaction.user.id, undefined, limit);
    const settled = bets.filter(
      (b) => b.status === "won" || b.status === "lost" || b.status === "void"
    );

    const embed = buildHistoryEmbed(settled, interaction.user.username);
    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
