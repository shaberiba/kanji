import { EmbedBuilder } from 'discord.js';
import { DateTime } from 'luxon';
import { listPageEvents } from './client.js';
import { isEventPosted, markEventPosted } from '../db/eventSyncStore.js';
import { getConfigValue, EVENTS_CHANNEL_ID_KEY } from '../db/configStore.js';
import { logger } from '../logger.js';

function buildEventEmbed(event) {
  const embed = new EmbedBuilder()
    .setTitle(event.name || 'Untitled event')
    .setURL(`https://www.facebook.com/events/${event.id}`)
    .setColor(0x3d2f7a);

  if (event.description) {
    embed.setDescription(
      event.description.length > 500 ? `${event.description.slice(0, 497)}...` : event.description
    );
  }

  if (event.start_time) {
    const start = DateTime.fromISO(event.start_time);
    if (start.isValid) {
      let when = `<t:${Math.floor(start.toSeconds())}:F>`;
      if (event.end_time) {
        const end = DateTime.fromISO(event.end_time);
        if (end.isValid) when += ` - <t:${Math.floor(end.toSeconds())}:t>`;
      }
      embed.addFields({ name: 'When', value: when });
    }
  }

  if (event.place?.name) {
    embed.addFields({ name: 'Where', value: event.place.name });
  }

  return embed;
}

/**
 * Fetches events from the Facebook Page and posts any not already announced
 * to the configured Discord channel. Safe to call repeatedly (on a timer or
 * via /sync-events) - already-posted events are skipped via posted_events.
 * Returns { checked, posted } or throws on Facebook/Discord API failure.
 */
export async function syncEvents(discordClient) {
  const channelId = getConfigValue(EVENTS_CHANNEL_ID_KEY);
  if (!channelId) {
    logger.debug('No events channel configured, skipping sync');
    return { checked: 0, posted: 0, skipped: 'no_channel' };
  }

  const events = await listPageEvents();
  let posted = 0;

  for (const event of events) {
    if (isEventPosted(event.id)) continue;

    const channel = await discordClient.channels.fetch(channelId);
    const message = await channel.send({ embeds: [buildEventEmbed(event)] });
    markEventPosted(event.id, message.id);
    posted += 1;
  }

  return { checked: events.length, posted };
}
