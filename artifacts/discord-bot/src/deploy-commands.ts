/**
 * deploy-commands.ts
 * Registers slash commands with Discord's API and resets channel restrictions
 * so commands are available in ALL channels (overrides Integration settings).
 *
 * Requires the bot to be invited with:
 *   - applications.commands
 *   - applications.commands.permissions.update   ← needed for channel override
 *   - bot (with Administrator permission)
 *
 * Run: pnpm --filter @workspace/discord-bot run deploy-commands
 */

import "dotenv/config";
import { REST, Routes, OAuth2Scopes, PermissionFlagsBits } from "discord.js";
import { commands } from "./commands/index.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId) {
  console.error("[Deploy] Missing DISCORD_TOKEN or DISCORD_CLIENT_ID.");
  process.exit(1);
}

// ── Invite URL (copy this if you need to re-invite with full scopes) ──────────
const inviteUrl =
  `https://discord.com/oauth2/authorize` +
  `?client_id=${clientId}` +
  `&scope=bot%20applications.commands%20applications.commands.permissions.update` +
  `&permissions=${PermissionFlagsBits.Administrator}`;

console.log(`[Deploy] Bot invite URL (re-invite if permissions changed):\n  ${inviteUrl}\n`);

const rest = new REST().setToken(token);
const commandData = commands.map((cmd) => cmd.data.toJSON());

console.log(`[Deploy] Registering ${commandData.length} slash commands…`);

if (guildId) {
  // ── Guild registration (instant) ────────────────────────────────────────────
  const registered = (await rest.put(
    Routes.applicationGuildCommands(clientId, guildId),
    { body: commandData }
  )) as Array<{ id: string; name: string }>;

  console.log(`[Deploy] ✅ Registered ${registered.length} guild commands.`);

  // ── Reset channel restrictions so commands work everywhere ──────────────────
  // Setting permissions: [] for each command removes any Integration channel
  // restrictions, making every command available in all channels.
  try {
    const bulkPermissions = registered.map((cmd) => ({
      id: cmd.id,
      permissions: [], // empty = no restrictions, available in all channels
    }));

    await rest.put(
      `/applications/${clientId}/guilds/${guildId}/commands/permissions` as `/${string}`,
      { body: bulkPermissions }
    );

    console.log(`[Deploy] ✅ Channel restrictions cleared — commands available in ALL channels.`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[Deploy] ⚠️  Could not clear channel restrictions (${msg}).\n` +
      `  → Re-invite the bot using the URL above to grant the required scope,\n` +
      `    then run deploy-commands again.`
    );
  }
} else {
  // ── Global registration (up to 1h propagation) ─────────────────────────────
  const registered = (await rest.put(
    Routes.applicationCommands(clientId),
    { body: commandData }
  )) as Array<{ id: string }>;

  console.log(
    `[Deploy] ✅ Registered ${registered.length} global application commands.\n` +
    `[Deploy] ℹ️  Global commands can only have channel restrictions cleared per-guild.\n` +
    `         Set DISCORD_GUILD_ID and re-run to also clear channel restrictions.`
  );
}
