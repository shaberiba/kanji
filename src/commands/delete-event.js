import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { canPublishToFacebook } from '../permissions.js';
import { deleteEvent } from '../facebook/client.js';
import { logger } from '../logger.js';

export const data = new SlashCommandBuilder()
  .setName('delete-event')
  .setDescription('Delete a Facebook Page event or post')
  .addStringOption((opt) =>
    opt
      .setName('event')
      .setDescription('Event ID, Facebook event URL, or a post ID (e.g. "<page-id>_<post-id>")')
      .setRequired(true)
  );

/**
 * A bare ID - either a plain numeric event ID or a composite post ID like
 * "<page-id>_<post-id>" - is used as-is. Otherwise the input is treated as
 * a Facebook URL and the first numeric path segment is pulled out (for a
 * recurring event's /events/<parent-id>/<instance-id>/ URL, that's the
 * parent/series ID).
 */
function extractEventId(input) {
  const trimmed = input.trim();
  if (/^\d+(_\d+)?$/.test(trimmed)) return trimmed;

  const match = trimmed.match(/\d{5,}/);
  return match ? match[0] : null;
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
    } else if (error.isDeprecatedEdge) {
      await interaction.editReply(
        "Facebook's events management API is deprecated platform-wide, so no app can delete events this way " +
          `(this isn't a permissions issue). Delete it manually: https://www.facebook.com/events/${eventId}/`
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
