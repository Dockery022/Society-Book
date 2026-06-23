/**
 * deploy-commands.ts
 *
 * Registers slash commands with Discord's API.
 * Run this script whenever you add, modify, or remove slash commands.
 *
 * Usage:
 *   pnpm --filter @workspace/discord-bot run deploy-commands
 *
 * Guild registration (instant, recommended for development/testing):
 *   Set DISCORD_GUILD_ID in your .env file.
 *
 * Global registration (takes up to 1 hour to propagate):
 *   Remove DISCORD_GUILD_ID from your .env file.
 */

import "dotenv/config";
import { REST, Routes } from "discord.js";
import { commands } from "./commands/index.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId) {
  console.error("[Deploy] Missing DISCORD_TOKEN or DISCORD_CLIENT_ID.");
  process.exit(1);
}

const rest = new REST().setToken(token);

const commandData = commands.map((cmd) => cmd.data.toJSON());

try {
  console.log(`[Deploy] Registering ${commandData.length} slash commands…`);

  if (guildId) {
    // Guild-specific registration (instant) — great for dev/testing
    const data = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commandData }
    );
    console.log(
      `[Deploy] ✅ Successfully registered ${(data as unknown[]).length} guild commands to guild ${guildId}.`
    );
  } else {
    // Global registration (up to 1h propagation)
    const data = await rest.put(
      Routes.applicationCommands(clientId),
      { body: commandData }
    );
    console.log(
      `[Deploy] ✅ Successfully registered ${(data as unknown[]).length} global application commands.`
    );
  }
} catch (error) {
  console.error("[Deploy] Failed to register commands:", error);
  process.exit(1);
}
