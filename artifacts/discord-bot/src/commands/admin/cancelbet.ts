import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../../types.js";
import { cancelBet } from "../../services/bettingService.js";
import { requireAdmin } from "../../utils/permissions.js";
import { buildSuccessEmbed, buildErrorEmbed } from "../../utils/embeds.js";
import { formatCoins } from "../../utils/formatters.js";

const command: Command = {
  adminOnly: true,
  data: new SlashCommandBuilder()
    .setName("cancelbet")
    .setDescription("[Admin] Cancel a pending bet and refund the wager.")
    .addIntegerOption((opt) =>
      opt.setName("bet_id").setDescription("Bet ID to cancel").setRequired(true).setMinValue(1)
    ),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;
    await interaction.deferReply({ ephemeral: true });

    const betId  = interaction.options.getInteger("bet_id", true);
    const result = await cancelBet(betId, interaction.user.id);

    if (!result.success) {
      await interaction.editReply({ embeds: [buildErrorEmbed(result.error ?? "Failed.")] });
      return;
    }

    await interaction.editReply({
      embeds: [
        buildSuccessEmbed(
          "Bet Cancelled",
          `Bet **#${betId}** has been cancelled and **${formatCoins(result.refunded ?? 0)}** refunded to the user.`
        ),
      ],
    });
  },
};

export default command;
