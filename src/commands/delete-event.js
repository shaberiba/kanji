import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { canPublishToFacebook } from '../permissions.js';
import { deleteEvent } from '../facebook/client.js';
import { logger } from '../logger.js';

export const data = new SlashCommandBuilder()
  .setName('delete-event')
  .setDescription('Delete a Facebook Page event')
  .addStringOption((opt) =>
    opt.setName('event').setDescription('Event ID or Facebook event URL').setRequired(true)
  );

function extractEventId(input) {
  const match = input.match(/(\d{5,})/);
  return match ? match[1] : null;
}

export async function execute(interaction) {
  if (!canPublishToFacebook(interaction)) {
    await interaction.reply({
      content: "You don't have permission to delete events. Ask an admin to grant your role access with /event-role.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const raw = interaction.options.getString('event', true);
  const eventId = extractEventId(raw);
  if (!eventId) {
    await interaction.reply({
      content: `Couldn't find an event ID in "${raw}". Paste the numeric event ID or its Facebook event URL.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    await deleteEvent(eventId);
    await interaction.editReply(`Deleted Facebook event ${eventId}.`);
  } catch (error) {
    logger.error({ err: error, eventId }, 'Failed to delete Facebook event');

    if (error.isAuthError) {
      await interaction.editReply(
        'Facebook authorization has expired. An admin needs to re-run the token setup script on the server.'
      );
    } else if (error.isPermissionError) {
      await interaction.editReply("Facebook says this app doesn't have permission to delete this event.");
    } else if (error.isRateLimited) {
      await interaction.editReply('Facebook is rate-limiting us right now. Try again in a minute.');
    } else {
      await interaction.editReply(`Something went wrong deleting the event: ${error.message}`);
    }
  }
}
