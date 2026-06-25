/**
 * /setupemojis — verifies all 6 coin emoji are present on the server.
 *
 * The bot now reads coin emoji directly from the guild emoji cache at startup,
 * so no DB setup is needed. This command just confirms the emoji are there
 * and tells you their current Discord tags.
 *
 * If any are missing, it uploads them from the bot's bundled assets.
 */

import { SlashCommandBuilder } from "discord.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import type { Command } from "../../types.js";
import { requireAdmin } from "../../utils/permissions.js";
import { setEmoji } from "../../utils/emojiCache.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, "../../../assets");

const COIN_DEFS = [
  { name: "coin1",   file: "coin_1.png"   },
  { name: "coin5",   file: "coin_5.png"   },
  { name: "coin10",  file: "coin_10.png"  },
  { name: "coin25",  file: "coin_25.png"  },
  { name: "coin50",  file: "coin_50.png"  },
  { name: "coin100", file: "coin_100.png" },
] as const;

const command: Command = {
  adminOnly: true,
  data: new SlashCommandBuilder()
    .setName("setupemojis")
    .setDescription("[Admin] Verify coin emoji are on the server (uploads missing ones from bot assets)."),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;
    if (!interaction.guild) {
      await interaction.reply({ content: "Must be used in a server.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    // Fetch latest emoji list
    await interaction.guild.emojis.fetch();

    const results: string[] = [];
    let allOk = true;

    for (const def of COIN_DEFS) {
      const existing = interaction.guild.emojis.cache.find((e) => e.name === def.name);

      if (existing) {
        const tag = `<:${existing.name}:${existing.id}>`;
        setEmoji(existing.name!, tag);
        results.push(`✅ ${tag} \`${def.name}\``);
        continue;
      }

      // Not found — upload from bot assets
      try {
        const attachment = readFileSync(join(ASSETS_DIR, def.file));
        const emoji = await interaction.guild.emojis.create({
          attachment,
          name: def.name,
          reason: "1912 Society Book coin emoji",
        });
        const tag = `<:${emoji.name}:${emoji.id}>`;
        setEmoji(emoji.name!, tag);
        results.push(`✅ ${tag} \`${def.name}\` *(uploaded)*`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push(`❌ \`${def.name}\` — ${msg}`);
        allOk = false;
      }
    }

    await interaction.editReply({
      content: allOk
        ? ["**✅ All coin emoji are active!**\n", results.join("\n")].join("\n")
        : ["**⚠️ Some emoji are missing.** Make sure the bot has **Manage Emojis** permission.\n", results.join("\n")].join("\n"),
    });
  },
};

export default command;
