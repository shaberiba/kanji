import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { canCreateEvent } from '../permissions.js';
import { parseLocalDateTime } from '../dateParsing.js';
import { createEvent } from '../facebook/client.js';
import { logger } from '../logger.js';
import { config } from '../config.js';

export const data = new SlashCommandBuilder()
  .setName('create-event')
  .setDescription('Create a Facebook Page event')
  .addStringOption((opt) =>
    opt.setName('name').setDescription('Event name').setRequired(true)
  )
  .addStringOption((opt) =>
    opt
      .setName('start_time')
      .setDescription(`Start time, e.g. "2026-10-05 19:00" (${config.defaultTimezone})`)
      .setRequired(true)
  )
  .addStringOption((opt) =>
    opt
      .setName('end_time')
      .setDescription(`End time, e.g. "2026-10-05 21:00" (${config.defaultTimezone})`)
      .setRequired(false)
  )
  .addStringOption((opt) =>
    opt.setName('description').setDescription('Event description').setRequired(false)
  )
  .addStringOption((opt) =>
    opt.setName('location').setDescription('Event location').setRequired(false)
  );

export async function execute(interaction) {
  if (!canCreateEvent(interaction)) {
    await interaction.reply({
      content: "You don't have permission to create events. Ask an admin to grant your role access with /event-role.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const name = interaction.options.getString('name', true);
  const startTimeRaw = interaction.options.getString('start_time', true);
  const endTimeRaw = interaction.options.getString('end_time');
  const description = interaction.options.getString('description');
  const location = interaction.options.getString('location');

  const startTimeIso = parseLocalDateTime(startTimeRaw);
  if (!startTimeIso) {
    await interaction.reply({
      content: `Couldn't parse start_time "${startTimeRaw}". Try a format like "2026-10-05 19:00".`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  let endTimeIso = null;
  if (endTimeRaw) {
    endTimeIso = parseLocalDateTime(endTimeRaw);
    if (!endTimeIso) {
      await interaction.reply({
        content: `Couldn't parse end_time "${endTimeRaw}". Try a format like "2026-10-05 21:00".`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const result = await createEvent({ name, startTimeIso, endTimeIso, description, location });

    if (result.status === 'created') {
      await interaction.editReply(`Event created: ${result.eventUrl}`);
    } else if (result.status === 'posted_fallback') {
      await interaction.editReply(
        "Facebook wouldn't let this app create a native event, so I posted the details to the Page's feed instead. " +
          `Post ID: ${result.postId}`
      );
    } else {
      await interaction.editReply(
        "Facebook wouldn't let this app create the event automatically. Please create it manually:\n" +
          `${result.pageEventsUrl}\n\n${result.details}`
      );
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to create Facebook event');

    if (error.isAuthError) {
      await interaction.editReply(
        'Facebook authorization has expired. An admin needs to re-run the token setup script on the server.'
      );
    } else if (error.isRateLimited) {
      await interaction.editReply("Facebook is rate-limiting us right now. Try again in a minute.");
    } else if (error.isValidationError) {
      await interaction.editReply(`Facebook rejected the event details: ${error.message}`);
    } else {
      await interaction.editReply(`Something went wrong creating the event: ${error.message}`);
    }
  }
}
