import { PermissionFlagsBits } from 'discord.js';
import { config } from './config.js';
import { listAllowedRoles } from './db/roleStore.js';

export function isOwnerOrAdmin(interaction) {
  if (interaction.user.id === config.discord.ownerId) return true;
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

/**
 * Phase 1: owner/admin only.
 * Phase 2: also allow anyone holding a role from the guild's allowlist.
 */
export function canCreateEvent(interaction) {
  if (isOwnerOrAdmin(interaction)) return true;

  const allowedRoleIds = new Set(
    listAllowedRoles(interaction.guildId).map((row) => row.role_id)
  );
  if (allowedRoleIds.size === 0) return false;

  return interaction.member.roles.cache.some((role) => allowedRoleIds.has(role.id));
}
