import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../../types.js";
import { removeCoins, getBalance } from "../../services/coinService.js";
import { requireModerator } from "../../utils/permissions.js";
import { buildSuccessEmbed } from "../../utils/embeds.js";
import { formatCoins } from "../../utils/formatters.js";
import db from "../../database/index.js";

const command: Command = {
  adminOnly: true,
  data: new SlashCommandBuilder()
    .setName("removecoins")
    .setDescription("[Admin] Remove coins from a user's balance.")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("Target user").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("amount")
        .setDescription("Number of coins to remove")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100_000)
    )
    .addStringOption((opt) =>
      opt.setName("reason").setDescription("Reason for removing coins").setRequired(false)
    ),

  async execute(interaction) {
    if (!(await requireModerator(interaction))) return;
    await interaction.deferReply({ ephemeral: true });

    const target = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("amount", true);
    const reason = interaction.options.getString("reason") ?? "Admin adjustment";

    const before = getBalance(target.id);
    removeCoins(target.id, amount, reason);
    const newBalance = getBalance(target.id);
    const actualRemoved = before - newBalance;

    db.prepare(
      "INSERT INTO admin_logs (admin_id, action, target_id, details) VALUES (?, 'remove_coins', ?, ?)"
    ).run(
      interaction.user.id,
      target.id,
      `Removed ${actualRemoved} coins (requested ${amount}). Reason: ${reason}. New balance: ${newBalance}`
    );

    await interaction.editReply({
      embeds: [
        buildSuccessEmbed(
          "Coins Removed",
          `Removed **${formatCoins(actualRemoved)}** from **${target.username}**.\nNew balance: **${formatCoins(newBalance)}**\nReason: ${reason}`
        ),
      ],
    });
  },
};

export default command;
