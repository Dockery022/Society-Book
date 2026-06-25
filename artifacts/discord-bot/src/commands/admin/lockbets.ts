import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../../types.js";
import { setBetsLocked } from "../../services/bettingService.js";
import { execute } from "../../database/index.js";
import { requireAdmin } from "../../utils/permissions.js";
import { buildSuccessEmbed } from "../../utils/embeds.js";

const command: Command = {
  adminOnly: true,
  data: new SlashCommandBuilder()
    .setName("lockbets")
    .setDescription("[Admin] Lock betting — prevents all new wagers from being placed."),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;
    await interaction.deferReply({ ephemeral: true });

    await setBetsLocked(true);
    await execute(
      "INSERT INTO admin_logs (admin_id, action, details) VALUES ($1, 'lock_bets', $2)",
      [interaction.user.id, "Bets locked by admin"]
    );

    await interaction.editReply({
      embeds: [
        buildSuccessEmbed(
          "Betting Locked 🔒",
          "No new bets can be placed until an admin unlocks betting with `/unlockbets`."
        ),
      ],
    });
  },
};

export default command;
