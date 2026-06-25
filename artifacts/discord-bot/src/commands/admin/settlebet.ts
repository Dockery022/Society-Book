import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../../types.js";
import { manualSettleBet } from "../../services/bettingService.js";
import { requireAdmin } from "../../utils/permissions.js";
import { buildSuccessEmbed, buildErrorEmbed } from "../../utils/embeds.js";
import { formatCoins } from "../../utils/formatters.js";

const command: Command = {
  adminOnly: true,
  data: new SlashCommandBuilder()
    .setName("settlebet")
    .setDescription("[Admin] Manually settle a specific bet.")
    .addIntegerOption((opt) =>
      opt.setName("bet_id").setDescription("Bet ID to settle").setRequired(true).setMinValue(1)
    )
    .addStringOption((opt) =>
      opt
        .setName("outcome")
        .setDescription("Outcome of the bet")
        .setRequired(true)
        .addChoices(
          { name: "✅ Won",          value: "won"  },
          { name: "❌ Lost",         value: "lost" },
          { name: "↩️ Void (Push)", value: "void" }
        )
    ),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;
    await interaction.deferReply({ ephemeral: true });

    const betId   = interaction.options.getInteger("bet_id", true);
    const outcome = interaction.options.getString("outcome", true) as "won" | "lost" | "void";
    const result  = await manualSettleBet(betId, outcome, interaction.user.id);

    if (!result.success) {
      await interaction.editReply({ embeds: [buildErrorEmbed(result.error ?? "Failed.")] });
      return;
    }

    const payoutStr =
      outcome === "won"
        ? `Payout: **${formatCoins(result.payout ?? 0)}**`
        : outcome === "void"
        ? `Refunded: **${formatCoins(result.payout ?? 0)}**`
        : "No payout (loss).";

    await interaction.editReply({
      embeds: [
        buildSuccessEmbed(
          "Bet Settled",
          `Bet **#${betId}** settled as **${outcome.toUpperCase()}**.\n${payoutStr}`
        ),
      ],
    });
  },
};

export default command;
