import { Events } from "discord.js";
import type { BotEvent } from "../types.js";
import { addCoins } from "../services/coinService.js";

const guildMemberAddEvent: BotEvent = {
  name: Events.GuildMemberAdd,
  once: false,
  async execute(member) {
    if (member.user.bot) return;
    await addCoins(member.id, 500, "welcome bonus");
    console.log(`[Bot] New member ${member.user.username} — granted 500 welcome coins.`);
  },
};

export default guildMemberAddEvent;
