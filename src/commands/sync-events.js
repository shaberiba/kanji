import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { isOwnerOrAdmin } from '../permissions.js';
import { syncEvents } from '../facebook/eventSync.js';
import { logger } from '../logger.js';

export const data = new SlashCommandBuilder()
  .setName('sync-events')
  .setDescription('Manually check the Facebook Page for new events and post them (admin only)');

export async function execute(interaction) {
  if (!isOwnerOrAdmin(interaction)) {
    await interaction.reply({
      content: "You don't have permission to do this.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const result = await syncEvents(interaction.client);
    if (result.skipped === 'no_channel') {
      await interaction.editReply('No events channel configured yet - run /events-channel set first.');
      return;
    }
    await interaction.editReply(
      `Checked ${result.checked} event(s) on the Page, posted ${result.posted} new one(s).`
    );
  } catch (error) {
    logger.error({ err: error }, 'Manual event sync failed');
    await interaction.editReply(
      `Couldn't read events from Facebook: ${error.message}\n` +
        "This may mean the app doesn't have read access to the Page's events - see the plan's feasibility notes."
    );
  }
}
