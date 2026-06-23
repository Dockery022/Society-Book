import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { getUser } from "../services/coinService.js";
import { buildBalanceEmbed } from "../utils/embeds.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("coins")
    .setDescription("Check your current 1912 Coins balance and betting stats."),

  async execute(interaction) {
    await interaction.deferReply();

    const user = getUser(interaction.user.id);
    const embed = buildBalanceEmbed(user, interaction.user.username);
    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
