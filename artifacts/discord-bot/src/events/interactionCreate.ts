import { Events, type Interaction } from "discord.js";
import type { BotClient, BotEvent } from "../types.js";
import { buildErrorEmbed } from "../utils/embeds.js";

const interactionCreateEvent: BotEvent = {
  name: Events.InteractionCreate,
  once: false,
  async execute(interaction: Interaction, client: BotClient) {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      await interaction.reply({ content: "Unknown command.", ephemeral: true });
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`[Commands] Error executing /${interaction.commandName}:`, error);
      const errorEmbed = buildErrorEmbed(
        "Something went wrong while processing your command. Please try again."
      );
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
        } else {
          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
      } catch {
        // Could not send error response
      }
    }
  },
};

export default interactionCreateEvent;
