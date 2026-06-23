import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../../types.js";
import { setBetsLocked } from "../../services/bettingService.js";
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

    setBetsLocked(true);

    // Log
    const db = (await import("../../database/index.js")).default;
    db.prepare(
      "INSERT INTO admin_logs (admin_id, action, details) VALUES (?, 'lock_bets', ?)"
    ).run(interaction.user.id, "Bets locked by admin");

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
