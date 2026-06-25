import {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ComponentType,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "../types.js";
import { getLeaderboard, type LeaderboardEntry } from "../services/coinService.js";
import { buildLeaderboardEmbed } from "../utils/embeds.js";

const SORT_OPTIONS = [
  { label: "💰 Current Balance",  value: "coins",           description: "Highest coin balance" },
  { label: "📈 Lifetime Profit",  value: "lifetime_earned", description: "Most coins ever earned" },
  { label: "🎯 Win Rate",         value: "win_rate",        description: "Best win percentage (min 1 bet)" },
  { label: "🎲 Total Bets",       value: "total_bets",      description: "Most bets placed" },
] as const;

type SortKey = (typeof SORT_OPTIONS)[number]["value"];

async function buildNameMap(
  interaction: ChatInputCommandInteraction,
  entries: LeaderboardEntry[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  await Promise.all(
    entries.map(async (entry) => {
      try {
        const member = interaction.guild
          ? await interaction.guild.members.fetch(entry.id).catch(() => null)
          : null;
        if (member) {
          map.set(entry.id, member.displayName);
        } else {
          const user = await interaction.client.users.fetch(entry.id).catch(() => null);
          if (user) map.set(entry.id, user.username);
        }
      } catch {
        // fallback handled in embed builder
      }
    })
  );
  return map;
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the top 10 players on The Society Book leaderboard."),

  async execute(interaction) {
    await interaction.deferReply();

    const entries = await getLeaderboard("coins");
    const names   = await buildNameMap(interaction, entries);
    const embed   = buildLeaderboardEmbed(entries, "💰 Current Balance", names);

    const select = new StringSelectMenuBuilder()
      .setCustomId("leaderboard_sort")
      .setPlaceholder("Sort by…")
      .addOptions(
        SORT_OPTIONS.map((opt) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(opt.label)
            .setValue(opt.value)
            .setDescription(opt.description)
        )
      );

    const row   = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
    const reply = await interaction.editReply({ embeds: [embed], components: [row] });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 60_000,
      filter: (i) => i.user.id === interaction.user.id,
    });

    collector.on("collect", async (si) => {
      const sortKey    = si.values[0] as SortKey;
      const sortOption = SORT_OPTIONS.find((o) => o.value === sortKey)!;
      const newEntries = await getLeaderboard(sortKey);
      const newNames   = await buildNameMap(interaction, newEntries);
      const newEmbed   = buildLeaderboardEmbed(newEntries, sortOption.label, newNames);
      await si.update({ embeds: [newEmbed], components: [row] });
    });

    collector.on("end", async () => {
      try { await interaction.editReply({ components: [] }); } catch { /* ignored */ }
    });
  },
};

export default command;
