/**
 * messageReactionAdd event — awards coins for reactions (given and received).
 * Enforces a 30-second cooldown for reaction-given to prevent farming.
 */

import { Events, type MessageReaction, type User } from "discord.js";
import {
  tryAwardReactionGivenCoins,
  awardReactionReceivedCoins,
} from "../services/coinService.js";

export default {
  name: Events.MessageReactionAdd,
  once: false,
  async execute(reaction: MessageReaction, user: User) {
    // Ignore bots
    if (user.bot) return;

    // Fetch partial reaction if needed
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch {
        return;
      }
    }

    const message = reaction.message;
    if (!message.guild) return; // DMs only — ignore

    // Fetch full message if partial
    const fullMessage = message.partial ? await message.fetch().catch(() => null) : message;
    if (!fullMessage) return;

    const reactor = user;
    const author = fullMessage.author;

    // Don't award coins for reacting to your own message or bots
    if (!author || author.bot || author.id === reactor.id) {
      // Still award the giver coins (it's engagement either way)
      tryAwardReactionGivenCoins(reactor.id);
      return;
    }

    // Award the person giving the reaction (subject to 30s cooldown)
    tryAwardReactionGivenCoins(reactor.id);

    // Award the person who received the reaction (no cooldown — passive income)
    awardReactionReceivedCoins(author.id);
  },
};
