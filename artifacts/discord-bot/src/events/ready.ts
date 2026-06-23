import { Events, ActivityType } from "discord.js";
import type { BotClient, BotEvent } from "../types.js";
import { startSettlementScheduler } from "../services/settlementService.js";

const readyEvent: BotEvent = {
  name: Events.ClientReady,
  once: true,
  execute(client: BotClient) {
    console.log(`[Bot] Logged in as ${client.user!.tag}`);
    console.log(`[Bot] Serving ${client.guilds.cache.size} guild(s)`);

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

    startSettlementScheduler();
    console.log("[Bot] Ready — The Society Book is open for business.");
  },
};

export default readyEvent;
