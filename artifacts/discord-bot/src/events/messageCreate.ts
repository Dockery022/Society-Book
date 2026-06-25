import { Events, type Message } from "discord.js";
import type { BotEvent } from "../types.js";
import { tryAwardMessageCoins } from "../services/coinService.js";

const messageCreateEvent: BotEvent = {
  name: Events.MessageCreate,
  once: false,
  execute(message: Message) {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (message.system) return;
    if (!message.content && message.attachments.size === 0) return;
    void tryAwardMessageCoins(message.author.id);
  },
};

export default messageCreateEvent;
