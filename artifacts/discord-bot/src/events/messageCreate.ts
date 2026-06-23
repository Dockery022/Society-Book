/**
 * messageCreate event — awards coins for user activity.
 * Enforces a 60-second cooldown per user to prevent farming.
 */

import { Events, type Message } from "discord.js";
import { tryAwardMessageCoins } from "../services/coinService.js";

export default {
  name: Events.MessageCreate,
  once: false,
  execute(message: Message) {
    // Ignore bots, DMs, system messages, and empty messages
    if (message.author.bot) return;
    if (!message.guild) return;
    if (message.system) return;
    if (!message.content && message.attachments.size === 0) return;

    // Award coins (returns false if on cooldown — silently ignored)
    tryAwardMessageCoins(message.author.id);
  },
};
