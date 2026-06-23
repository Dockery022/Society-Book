/**
 * Permissions — helper functions for role-based access
 */

import type { GuildMember, ChatInputCommandInteraction } from "discord.js";

/** Check if a member has the premium role */
export function isPremium(member: GuildMember): boolean {
  const premiumRoleId = process.env.PREMIUM_ROLE_ID;
  if (!premiumRoleId) return false;
  return member.roles.cache.has(premiumRoleId);
}

/** Check if a member has administrator permissions */
export function isAdmin(member: GuildMember): boolean {
  return (
    member.permissions.has("Administrator") ||
    member.permissions.has("ManageGuild")
  );
}

/** Ensure interaction is in a guild — returns member or null */
export async function requireGuildMember(
  interaction: ChatInputCommandInteraction
): Promise<GuildMember | null> {
  if (!interaction.guild || !interaction.member) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true,
    });
    return null;
  }

  // Fetch full member to get up-to-date roles
  try {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    return member;
  } catch {
    await interaction.reply({
      content: "Could not verify your server membership.",
      ephemeral: true,
    });
    return null;
  }
}

/** Ensure the user running the command is an admin */
export async function requireAdmin(
  interaction: ChatInputCommandInteraction
): Promise<boolean> {
  const member = await requireGuildMember(interaction);
  if (!member) return false;

  if (!isAdmin(member)) {
    await interaction.reply({
      content: "❌ You need **Administrator** or **Manage Server** permission to use this command.",
      ephemeral: true,
    });
    return false;
  }

  return true;
}
