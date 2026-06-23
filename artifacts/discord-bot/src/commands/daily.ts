import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import type { Command } from "../types.js";
import { claimDaily, getNextDailyReset } from "../services/coinService.js";
import { isPremium, requireGuildMember } from "../utils/permissions.js";
import { formatCoins, formatRelativeTime } from "../utils/formatters.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily 1912 Coin reward (resets at midnight UTC)."),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    const member = await requireGuildMember(interaction);
    if (!member) return;

    const premium = isPremium(member);
    const result = claimDaily(interaction.user.id, premium);

    if (result.alreadyClaimed) {
      const resetTime = getNextDailyReset(interaction.user.id);
      const resetUnix = resetTime ? Math.floor(resetTime.getTime() / 1000) : null;

      const embed = new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle("📅 Daily Reward")
        .setDescription(
          `You've already claimed your daily reward today!\n\nCome back ${resetUnix ? formatRelativeTime(resetUnix) : "tomorrow"}.`
        )
        .setFooter({ text: "The 1912 Society Book" });

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const tierLabel = premium ? "💎 Premium Member" : "Free Member";

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle("🎁 Daily Reward Claimed!")
      .setDescription(
        `You received **${formatCoins(result.amount)}**!\n\n*Tier: ${tierLabel}*`
      )
      .addFields({
        name: "Tip",
        value: premium
          ? "As a Premium Member you earn 4× the daily reward."
          : "Upgrade to Premium for 100 coins per day instead of 25!",
      })
      .setFooter({ text: "The 1912 Society Book" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
