/**
 * /setupemojis — uploads the 6 custom 1912 coin images as server emoji,
 * then stores their tags so the bot uses them everywhere.
 *
 * Re-running overwrites any previously uploaded set.
 * Requires: bot has Manage Emojis permission (or Administrator).
 */

import { SlashCommandBuilder } from "discord.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import type { Command } from "../../types.js";
import { requireAdmin } from "../../utils/permissions.js";
import { saveCoinEmojis, clearCoinEmojis } from "../../services/emojiService.js";
import type { CoinEmojis } from "../../services/emojiService.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, "../../../assets");

const COIN_DEFS = [
  { key: "coin_1",   name: "coin1",   file: "coin_1.png"   },
  { key: "coin_5",   name: "coin5",   file: "coin_5.png"   },
  { key: "coin_10",  name: "coin10",  file: "coin_10.png"  },
  { key: "coin_25",  name: "coin25",  file: "coin_25.png"  },
  { key: "coin_50",  name: "coin50",  file: "coin_50.png"  },
  { key: "coin_100", name: "coin100", file: "coin_100.png" },
] as const;

const command: Command = {
  adminOnly: true,
  data: new SlashCommandBuilder()
    .setName("setupemojis")
    .setDescription("[Admin] Upload the 1912 coin images as server emoji and activate them."),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;
    if (!interaction.guild) {
      await interaction.reply({ content: "Must be used in a server.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    // Delete any previously uploaded coin emoji to avoid duplicates
    const existing = interaction.guild.emojis.cache.filter((e) =>
      COIN_DEFS.some((d) => d.name === e.name)
    );
    for (const [, emoji] of existing) {
      try { await emoji.delete("Replaced by /setupemojis"); } catch { /* ignore */ }
    }

    const tags: Partial<CoinEmojis> = {};
    const results: string[] = [];

    for (const def of COIN_DEFS) {
      try {
        const imgPath = join(ASSETS_DIR, def.file);
        const attachment = readFileSync(imgPath);

        const emoji = await interaction.guild.emojis.create({
          attachment,
          name: def.name,
          reason: "1912 Society Book coin emoji",
        });

        tags[def.key] = `<:${emoji.name}:${emoji.id}>`;
        results.push(`✅ <:${emoji.name}:${emoji.id}> \`${def.name}\``);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push(`❌ \`${def.name}\` — ${msg}`);
      }
    }

    // If all 6 uploaded successfully, save and activate
    if (Object.keys(tags).length === 6) {
      saveCoinEmojis(tags as CoinEmojis);
      await interaction.editReply({
        content: [
          "**✅ Coin emoji uploaded and activated!**",
          "The bot will now use these across all commands:\n",
          results.join("\n"),
        ].join("\n"),
      });
    } else {
      // Partial success — clear so we don't use an incomplete set
      clearCoinEmojis();
      await interaction.editReply({
        content: [
          "**⚠️ Some emoji failed to upload.** The bot will use 🪙 until all succeed.\n",
          results.join("\n"),
          "\nMake sure the bot has **Manage Emojis** permission and your server isn't at its emoji limit.",
        ].join("\n"),
      });
    }
  },
};

export default command;
