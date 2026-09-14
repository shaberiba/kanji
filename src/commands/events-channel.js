import { SlashCommandBuilder, ChannelType, MessageFlags } from 'discord.js';
import { isOwnerOrAdmin } from '../permissions.js';
import { getConfigValue, setConfigValue, EVENTS_CHANNEL_ID_KEY } from '../db/configStore.js';

export const data = new SlashCommandBuilder()
  .setName('events-channel')
  .setDescription('Configure which channel Facebook Page events get posted to (admin only)')
  .addSubcommand((sub) =>
    sub
      .setName('set')
      .setDescription('Set the events announcement channel')
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Channel to post new Facebook events to')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) => sub.setName('show').setDescription('Show the current events announcement channel'));

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'show') {
    const channelId = getConfigValue(EVENTS_CHANNEL_ID_KEY);
    await interaction.reply({
      content: channelId ? `Events are posted to <#${channelId}>.` : 'No events channel is configured yet.',
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
  setConfigValue(EVENTS_CHANNEL_ID_KEY, channel.id);
  await interaction.reply({
    content: `New Facebook events will be posted to <#${channel.id}>.`,
    flags: MessageFlags.Ephemeral,
  });
}
