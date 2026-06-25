import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../../types.js";
import { addCoins, getBalance } from "../../services/coinService.js";
import { execute } from "../../database/index.js";
import { requireModerator } from "../../utils/permissions.js";
import { buildSuccessEmbed, buildErrorEmbed } from "../../utils/embeds.js";
import { formatCoins } from "../../utils/formatters.js";

const command: Command = {
  adminOnly: true,
  data: new SlashCommandBuilder()
    .setName("addcoins")
    .setDescription("[Admin] Add coins to a user's balance.")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("Target user").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("amount")
        .setDescription("Number of coins to add")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100_000)
    )
    .addStringOption((opt) =>
      opt.setName("reason").setDescription("Reason for adding coins").setRequired(false)
    ),

  async execute(interaction) {
    if (!(await requireModerator(interaction))) return;
    await interaction.deferReply({ ephemeral: true });

    const target = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("amount", true);
    const reason = interaction.options.getString("reason") ?? "Admin adjustment";

    await addCoins(target.id, amount, reason);
    const newBalance = await getBalance(target.id);

    await execute(
      "INSERT INTO admin_logs (admin_id, action, target_id, details) VALUES ($1, 'add_coins', $2, $3)",
      [interaction.user.id, target.id, `Added ${amount} coins. Reason: ${reason}. New balance: ${newBalance}`]
    );

    await interaction.editReply({
      embeds: [
        buildSuccessEmbed(
          "Coins Added",
          `Added **${formatCoins(amount)}** to **${target.username}**.\nNew balance: **${formatCoins(newBalance)}**\nReason: ${reason}`
        ),
      ],
    });
  },
};

export default command;
