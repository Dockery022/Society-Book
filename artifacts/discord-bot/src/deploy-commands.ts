/**
 * deploy-commands.ts
 * Registers slash commands with Discord's API.
 *
 * Guild registration (instant — recommended for dev):
 *   Set DISCORD_GUILD_ID in your .env/.secrets
 *
 * Global registration (up to 1h propagation):
 *   Remove DISCORD_GUILD_ID
 *
 * Run: pnpm --filter @workspace/discord-bot run deploy-commands
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

console.log(`[Deploy] Registering ${commandData.length} slash commands…`);

if (guildId) {
  const data = (await rest.put(
    Routes.applicationGuildCommands(clientId, guildId),
    { body: commandData }
  )) as unknown[];
  console.log(`[Deploy] ✅ Registered ${data.length} guild commands to guild ${guildId}.`);
} else {
  const data = (await rest.put(
    Routes.applicationCommands(clientId),
    { body: commandData }
  )) as unknown[];
  console.log(`[Deploy] ✅ Registered ${data.length} global application commands.`);
}
