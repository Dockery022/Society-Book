/**
 * ready event — fires once when the bot connects to Discord.
 */

import { Events, ActivityType } from "discord.js";
import type { BotClient } from "../types.js";
import { startSettlementScheduler } from "../services/settlementService.js";

export default {
  name: Events.ClientReady,
  once: true,
  execute(client: BotClient) {
    console.log(`[Bot] Logged in as ${client.user!.tag}`);
    console.log(`[Bot] Serving ${client.guilds.cache.size} guild(s)`);

    // Set bot activity status
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

    // Start the auto-settlement cron job
    startSettlementScheduler();

    console.log("[Bot] Ready — The Society Book is open for business.");
  },
};
