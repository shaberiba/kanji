import { SlashCommandBuilder, ChannelType, MessageFlags } from 'discord.js';
import { isOwnerOrAdmin } from '../permissions.js';
import { getEventsChannel, setEventsChannel } from '../db/guildConfigStore.js';

export const data = new SlashCommandBuilder()
  .setName('events-channel')
  .setDescription('Configure which channel gets 48h/24h event reminders in this server (admin only)')
  .addSubcommand((sub) =>
    sub
      .setName('set')
      .setDescription('Set this server\'s reminder channel')
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Channel to post event reminders to')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) => sub.setName('show').setDescription('Show this server\'s current reminder channel'));

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'show') {
    const channelId = getEventsChannel(interaction.guildId);
    await interaction.reply({
      content: channelId ? `Event reminders are posted to <#${channelId}>.` : 'No reminder channel is configured yet for this server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!isOwnerOrAdmin(interaction)) {
    await interaction.reply({
      content: 'Only the bot owner or server admins can change this.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const channel = interaction.options.getChannel('channel', true);
  setEventsChannel(interaction.guildId, channel.id);
  await interaction.reply({
    content: `Event reminders (48h/24h before) will now be posted to <#${channel.id}> in this server.`,
    flags: MessageFlags.Ephemeral,
  });
}
