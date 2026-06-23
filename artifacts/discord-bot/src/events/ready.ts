import { Events, ActivityType, PermissionFlagsBits } from "discord.js";
import type { BotClient, BotEvent } from "../types.js";
import { startSettlementScheduler } from "../services/settlementService.js";

/** Clear Integration channel restrictions for all guilds on startup */
async function clearChannelRestrictions(client: BotClient): Promise<void> {
  const clientId = client.user!.id;

  for (const [, guild] of client.guilds.cache) {
    try {
      const guildCommands = await guild.commands.fetch();
      if (guildCommands.size === 0) continue;

      const bulkPermissions = [...guildCommands.values()].map((cmd) => ({
        id: cmd.id,
        permissions: [], // empty = no channel restrictions
      }));

      await client.rest.put(
        `/applications/${clientId}/guilds/${guild.id}/commands/permissions` as `/${string}`,
        { body: bulkPermissions }
      );

      console.log(
        `[Bot] ✅ Channel restrictions cleared for guild: ${guild.name}`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // 403 = missing applications.commands.permissions.update scope
      if (msg.includes("403") || msg.includes("Missing Access")) {
        console.warn(
          `[Bot] ⚠️  Cannot clear channel restrictions for "${guild.name}" — bot needs re-inviting.\n` +
          `     Run: pnpm --filter @workspace/discord-bot run deploy-commands\n` +
          `     and use the printed invite URL to re-add the bot with full scopes.`
        );
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

    // Print invite URL with all required scopes
    const inviteUrl =
      `https://discord.com/oauth2/authorize` +
      `?client_id=${client.user!.id}` +
      `&scope=bot%20applications.commands%20applications.commands.permissions.update` +
      `&permissions=${PermissionFlagsBits.Administrator}`;
    console.log(`[Bot] Invite URL (use this if commands are missing from channels):\n  ${inviteUrl}`);

    client.user!.setPresence({
      activities: [
        {
          name: "The Society Book 🎰",
          type: ActivityType.Custom,
          state: "Use /bet to place wagers",
        },
      ],
      status: "online",
    });

    // Attempt to clear channel restrictions so commands work everywhere
    await clearChannelRestrictions(client);

    startSettlementScheduler();
    console.log("[Bot] Ready — The Society Book is open for business.");
  },
};

export default readyEvent;
