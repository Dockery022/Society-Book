import { Events, type MessageReaction, type User } from "discord.js";
import type { BotEvent } from "../types.js";
import {
  tryAwardReactionGivenCoins,
  awardReactionReceivedCoins,
} from "../services/coinService.js";

const messageReactionAddEvent: BotEvent = {
  name: Events.MessageReactionAdd,
  once: false,
  async execute(reaction: MessageReaction, user: User) {
    if (user.bot) return;

    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch {
        return;
      }
    }

    if (!reaction.message.guild) return;

    const fullMessage = reaction.message.partial
      ? await reaction.message.fetch().catch(() => null)
      : reaction.message;
    if (!fullMessage) return;

    const author = fullMessage.author;

    void tryAwardReactionGivenCoins(user.id);

    if (author && !author.bot && author.id !== user.id) {
      void awardReactionReceivedCoins(author.id);
    }
  },
};

export default messageReactionAddEvent;
