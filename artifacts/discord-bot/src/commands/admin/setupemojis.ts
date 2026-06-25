/**
 * /setupemojis — registers the 6 custom coin emoji with the bot.
 *
 * If the emoji already exist on the server (manually uploaded or previously set up),
 * it reuses them without deleting/re-uploading. Only uploads from the bot's asset
 * files when an emoji with that name isn't found on the server.
 *
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
    .setDescription("[Admin] Register the 1912 coin emoji with the bot (reuses existing ones if present)."),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) return;
    if (!interaction.guild) {
      await interaction.reply({ content: "Must be used in a server.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    // Fetch the latest emoji list so the cache is up to date
    await interaction.guild.emojis.fetch();

    const tags: Partial<CoinEmojis> = {};
    const results: string[] = [];

    for (const def of COIN_DEFS) {
      // Check if an emoji with this name already exists on the server
      const existing = interaction.guild.emojis.cache.find((e) => e.name === def.name);

      if (existing) {
        // Reuse the existing emoji — no upload needed
        tags[def.key] = `<:${existing.name}:${existing.id}>`;
        results.push(`✅ <:${existing.name}:${existing.id}> \`${def.name}\` *(already on server)*`);
        continue;
      }

      // Emoji not found — upload from the bot's bundled asset
      try {
        const imgPath = join(ASSETS_DIR, def.file);
        const attachment = readFileSync(imgPath);

        const emoji = await interaction.guild.emojis.create({
          attachment,
          name: def.name,
          reason: "1912 Society Book coin emoji",
        });

        tags[def.key] = `<:${emoji.name}:${emoji.id}>`;
        results.push(`✅ <:${emoji.name}:${emoji.id}> \`${def.name}\` *(uploaded)*`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push(`❌ \`${def.name}\` — ${msg}`);
      }
    }

    if (Object.keys(tags).length === 6) {
      await saveCoinEmojis(tags as CoinEmojis);
      await interaction.editReply({
        content: [
          "**✅ Coin emoji activated!**",
          "The bot will now use these across all commands:\n",
          results.join("\n"),
        ].join("\n"),
      });
    } else {
      await clearCoinEmojis();
      await interaction.editReply({
        content: [
          "**⚠️ Some emoji couldn't be found or uploaded.** The bot will use 🪙 until all 6 are available.\n",
          results.join("\n"),
          "\nMake sure all 6 coin emoji (`coin1` through `coin100`) are on the server and the bot has **Manage Emojis** permission.",
        ].join("\n"),
      });
    }
  },
};

export default command;
