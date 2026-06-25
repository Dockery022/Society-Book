import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../../types.js";
import { setBetsLocked } from "../../services/bettingService.js";
import { execute } from "../../database/index.js";
import { requireAdmin } from "../../utils/permissions.js";
import { buildSuccessEmbed } from "../../utils/embeds.js";

const command: Command = {
  adminOnly: true,
  data: new SlashCommandBuilder()
    .setName("unlockbets")
    .setDescription("[Admin] Unlock betting — allows users to place new wagers again."),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;
    await interaction.deferReply({ ephemeral: true });

    await setBetsLocked(false);
    await execute(
      "INSERT INTO admin_logs (admin_id, action, details) VALUES ($1, 'unlock_bets', $2)",
      [interaction.user.id, "Bets unlocked by admin"]
    );

    await interaction.editReply({
      embeds: [
        buildSuccessEmbed(
          "Betting Unlocked 🔓",
          "Betting is now open. Users can place wagers again."
        ),
      ],
    });
  },
};

export default command;
