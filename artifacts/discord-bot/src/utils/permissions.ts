/**
 * Permissions — helper functions for role-based access
 * Supports multiple premium role IDs via PREMIUM_ROLE_IDS (comma-separated)
 * or the legacy PREMIUM_ROLE_ID variable.
 */

import type { GuildMember, ChatInputCommandInteraction } from "discord.js";

/** Return all configured premium role IDs */
function getPremiumRoleIds(): string[] {
  // Support comma-separated list: PREMIUM_ROLE_IDS=123456,789012
  const multi = process.env.PREMIUM_ROLE_IDS;
  if (multi) {
    return multi
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  }
  // Legacy single-role fallback
  const single = process.env.PREMIUM_ROLE_ID;
  return single ? [single] : [];
}

/** Check if a member has any premium role */
export function isPremium(member: GuildMember): boolean {
  const premiumRoleIds = getPremiumRoleIds();
  if (premiumRoleIds.length === 0) return false;
  return premiumRoleIds.some((id) => member.roles.cache.has(id));
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
      content:
        "❌ You need **Administrator** or **Manage Server** permission to use this command.",
      ephemeral: true,
    });
    return false;
  }

  return true;
}
