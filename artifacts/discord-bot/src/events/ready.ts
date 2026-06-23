import { Events, ActivityType, PermissionFlagsBits, Routes } from "discord.js";
import type { BotClient, BotEvent } from "../types.js";
import { startSettlementScheduler } from "../services/settlementService.js";
import { commands } from "../commands/index.js";

/** Register slash commands with Discord on startup */
async function registerCommands(client: BotClient): Promise<void> {
  const clientId = client.user!.id;
  const guildId  = process.env.DISCORD_GUILD_ID;
  const data      = commands.map((c) => c.data.toJSON());

  try {
    if (guildId) {
      await client.rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: data }
      );
      console.log(`[Bot] ✅ Registered ${data.length} guild commands.`);
    } else {
      await client.rest.put(Routes.applicationCommands(clientId), { body: data });
      console.log(`[Bot] ✅ Registered ${data.length} global commands.`);
    }
  } catch (err: unknown) {
    console.warn("[Bot] ⚠️  Could not register commands:", err instanceof Error ? err.message : err);
  }
}

/** Clear Integration channel restrictions for all guilds on startup */
async function clearChannelRestrictions(client: BotClient): Promise<void> {
  const clientId = client.user!.id;

  for (const [, guild] of client.guilds.cache) {
    try {
      const guildCommands = await guild.commands.fetch();
      if (guildCommands.size === 0) continue;

      const bulkPermissions = [...guildCommands.values()].map((cmd) => ({
        id: cmd.id,
        permissions: [],
      }));

      await client.rest.put(
        `/applications/${clientId}/guilds/${guild.id}/commands/permissions` as `/${string}`,
        { body: bulkPermissions }
      );

      console.log(`[Bot] ✅ Channel restrictions cleared for guild: ${guild.name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("403") || msg.includes("Missing Access")) {
        console.warn(`[Bot] ⚠️  Cannot clear channel restrictions for "${guild.name}" — bot needs re-inviting.`);
      } else {
        console.warn(`[Bot] ⚠️  Could not clear channel restrictions for "${guild.name}": ${msg}`);
      }
    }
  }
}

const readyEvent: BotEvent = {
  name: Events.ClientReady,
  once: true,
  async execute(client: BotClient) {
    console.log(`[Bot] Logged in as ${client.user!.tag}`);
    console.log(`[Bot] Serving ${client.guilds.cache.size} guild(s)`);

    const inviteUrl =
      `https://discord.com/oauth2/authorize` +
      `?client_id=${client.user!.id}` +
      `&scope=bot%20applications.commands%20applications.commands.permissions.update` +
      `&permissions=${PermissionFlagsBits.Administrator}`;
    console.log(`[Bot] Invite URL:\n  ${inviteUrl}`);

    client.user!.setPresence({
      activities: [{ name: "The Society Book 🎰", type: ActivityType.Custom, state: "Use /bet to place wagers" }],
      status: "online",
    });

    await registerCommands(client);
    await clearChannelRestrictions(client);

    startSettlementScheduler();
    console.log("[Bot] Ready — The Society Book is open for business.");
  },
};

export default readyEvent;
