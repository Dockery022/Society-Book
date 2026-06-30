/**
 * /cancelmybet — lets a user cancel one of their own pending bets and get
 * their wager refunded. Only works on bets that still have status = 'pending'.
 */

import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { getBetById, cancelBet } from "../services/bettingService.js";
import { buildSuccessEmbed, buildErrorEmbed } from "../utils/embeds.js";
import { formatCoins, formatBetType, formatBetSelection, formatOdds } from "../utils/formatters.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("cancelmybet")
    .setDescription("Cancel one of your open bets and get your wager refunded.")
    .addIntegerOption((opt) =>
      opt
        .setName("bet_id")
        .setDescription("The bet ID to cancel (find it with /mybets)")
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const betId = interaction.options.getInteger("bet_id", true);
    const bet = await getBetById(betId);

    if (!bet) {
      await interaction.editReply({ embeds: [buildErrorEmbed(`Bet **#${betId}** not found.`)] });
      return;
    }

    if (bet.user_id !== interaction.user.id) {
      await interaction.editReply({ embeds: [buildErrorEmbed(`Bet **#${betId}** doesn't belong to you.`)] });
      return;
    }

    if (bet.status !== "pending") {
      await interaction.editReply({
        embeds: [buildErrorEmbed(`Bet **#${betId}** can't be cancelled — it's already **${bet.status}**.`)],
      });
      return;
    }

    const result = await cancelBet(betId);

    if (!result.success) {
      await interaction.editReply({ embeds: [buildErrorEmbed(result.error ?? "Failed to cancel bet.")] });
      return;
    }

    const matchup = `${bet.away_team} @ ${bet.home_team}`;
    const selection = `${formatBetType(bet.bet_type)} · ${formatBetSelection(bet)} · ${formatOdds(bet.odds)}`;

    await interaction.editReply({
      embeds: [
        buildSuccessEmbed(
          "Bet Cancelled",
          [
            `**#${betId}** — ${matchup}`,
            `${selection}`,
            ``,
            `**${formatCoins(result.refunded ?? 0)}** returned to your balance.`,
          ].join("\n")
        ),
      ],
    });
  },
};

export default command;
