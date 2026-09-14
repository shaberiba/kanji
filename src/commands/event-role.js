import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { isOwnerOrAdmin, canPublishToFacebook } from '../permissions.js';
import { addAllowedRole, removeAllowedRole, listAllowedRoles } from '../db/roleStore.js';

export const data = new SlashCommandBuilder()
  .setName('event-role')
  .setDescription('Manage which Discord roles can create Facebook events')
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Allow a role to create events')
      .addRoleOption((opt) => opt.setName('role').setDescription('Role to allow').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Revoke a role\'s ability to create events')
      .addRoleOption((opt) => opt.setName('role').setDescription('Role to revoke').setRequired(true))
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('List roles allowed to create events'));

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'list') {
    if (!canPublishToFacebook(interaction)) {
      await interaction.reply({
        content: "You don't have permission to view this.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const roles = listAllowedRoles(interaction.guildId);
    const content =
      roles.length === 0
        ? 'No roles are currently allowed to create events (only the owner and server admins can).'
        : `Roles allowed to create events:\n${roles.map((r) => `<@&${r.role_id}>`).join('\n')}`;

    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    return;
  }

  if (!isOwnerOrAdmin(interaction)) {
    await interaction.reply({
      content: "Only the bot owner or server admins can manage event-creation roles.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const role = interaction.options.getRole('role', true);

  if (subcommand === 'add') {
    addAllowedRole(interaction.guildId, role.id, interaction.user.id);
    await interaction.reply({
      content: `<@&${role.id}> can now create Facebook events.`,
      flags: MessageFlags.Ephemeral,
    });
  } else if (subcommand === 'remove') {
    const removed = removeAllowedRole(interaction.guildId, role.id);
    await interaction.reply({
      content: removed
        ? `<@&${role.id}> can no longer create Facebook events.`
        : `<@&${role.id}> wasn't in the allowlist.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
