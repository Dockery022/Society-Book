import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../../types.js";
import { requireAdmin } from "../../utils/permissions.js";
import { buildSuccessEmbed, buildErrorEmbed } from "../../utils/embeds.js";
import { addCoinsToAllUsers } from "../../services/coinService.js";
import { cancelAllPendingBets } from "../../services/bettingService.js";
import { formatCoins } from "../../utils/formatters.js";

const command: Command = {
  adminOnly: true,
  data: new SlashCommandBuilder()
    .setName("serverbonus")
    .setDescription("[Admin] Give all users coins and optionally cancel all open bets.")
    .addIntegerOption((opt) =>
      opt
        .setName("coins")
        .setDescription("Coins to give every user (default: 500)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(100_000)
    )
    .addBooleanOption((opt) =>
      opt
        .setName("cancel_bets")
        .setDescription("Also cancel all pending bets and refund wagers? (default: true)")
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;
    await interaction.deferReply({ ephemeral: true });

    const amount     = interaction.options.getInteger("coins") ?? 500;
    const cancelBets = interaction.options.getBoolean("cancel_bets") ?? true;

    let userCount = 0;
    let cancelledCount = 0;
    let totalRefunded = 0;

    try {
      userCount = addCoinsToAllUsers(amount, interaction.user.id);

      if (cancelBets) {
        const result = cancelAllPendingBets(interaction.user.id);
        cancelledCount = result.cancelled;
        totalRefunded  = result.totalRefunded;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      await interaction.editReply({ embeds: [buildErrorEmbed(`Operation failed: ${msg}`)] });
      return;
    }

    const lines = [
      `💰 Gave **${formatCoins(amount)}** to **${userCount}** users.`,
    ];
    if (cancelBets) {
      lines.push(
        cancelledCount > 0
          ? `🔒 Cancelled **${cancelledCount}** pending bets and refunded **${formatCoins(totalRefunded)}** in wagers.`
          : `🔒 No pending bets to cancel.`
      );
    }

    await interaction.editReply({
      embeds: [buildSuccessEmbed("Server Bonus Applied", lines.join("\n"))],
    });
  },
};

export default command;
