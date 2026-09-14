import { EmbedBuilder, GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel } from 'discord.js';
import { DateTime } from 'luxon';
import { config } from '../config.js';
import { listPageEvents } from './client.js';
import {
  getSyncedEvent,
  recordSyncedEvent,
  markReminderSent,
  listUpcomingSyncedEvents,
} from '../db/eventSyncStore.js';
import { getConfigValue, EVENTS_CHANNEL_ID_KEY } from '../db/configStore.js';
import { logger } from '../logger.js';

const DEFAULT_EVENT_DURATION_HOURS = 3;
const REMINDER_WINDOWS = [
  { key: '48h', hoursBefore: 48 },
  { key: '24h', hoursBefore: 24 },
];

function resolveGuild(discordClient) {
  if (config.discord.guildId) {
    const guild = discordClient.guilds.cache.get(config.discord.guildId);
    if (guild) return guild;
  }
  return discordClient.guilds.cache.first() ?? null;
}

/**
 * Discord auto-links bare URLs inside a Scheduled Event's description, so
 * this is how we surface a "view on Facebook" link on the Discord side.
 */
export function buildEventDescription(fbEvent) {
  const link = `https://www.facebook.com/events/${fbEvent.id}`;
  const base = fbEvent.description ? fbEvent.description.trim() : '';
  const combined = base ? `${base}\n\nFacebook event: ${link}` : `Facebook event: ${link}`;
  return combined.slice(0, 1000);
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // Discord's cover image upload limit

/**
 * Downloads a Facebook event's cover photo and returns it as a base64 data
 * URI, the format discord.js expects for setting a Scheduled Event's image.
 * Returns undefined (rather than throwing) on any failure - a missing cover
 * image should never block the rest of the sync.
 */
export async function buildEventImage(fbEvent) {
  const sourceUrl = fbEvent.cover?.source;
  if (!sourceUrl) return undefined;

  try {
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`Fetching cover image failed: HTTP ${response.status}`);

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error(`Cover image too large (${buffer.byteLength} bytes)`);

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch (error) {
    logger.warn({ err: error, facebookEventId: fbEvent.id }, 'Failed to fetch Facebook cover image for Discord event');
    return undefined;
  }
}

/**
 * Creates a Discord native Scheduled Event mirroring a Facebook event.
 * Silent by design - this is what makes it show up in Discord's Events tab
 * without spamming the channel. Returns the created event's id, or null if
 * the Facebook event's start time has already passed (Discord rejects
 * scheduled events with a start time in the past).
 */
async function createDiscordScheduledEvent(guild, fbEvent, startTime) {
  if (startTime <= DateTime.now()) return null;

  const endTime = fbEvent.end_time
    ? DateTime.fromISO(fbEvent.end_time)
    : startTime.plus({ hours: DEFAULT_EVENT_DURATION_HOURS });

  const created = await guild.scheduledEvents.create({
    name: (fbEvent.name || 'Untitled event').slice(0, 100),
    scheduledStartTime: startTime.toJSDate(),
    scheduledEndTime: (endTime.isValid ? endTime : startTime.plus({ hours: DEFAULT_EVENT_DURATION_HOURS })).toJSDate(),
    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
    entityType: GuildScheduledEventEntityType.External,
    description: buildEventDescription(fbEvent),
    entityMetadata: { location: (fbEvent.place?.name || 'See Facebook event for details').slice(0, 100) },
    image: await buildEventImage(fbEvent),
  });

  return created.id;
}

/**
 * Pulls events from the Facebook Page and mirrors any not yet seen as
 * Discord native Scheduled Events (no channel message). Safe to call
 * repeatedly - already-synced events are skipped via the synced_events table.
 */
async function syncNewEvents(discordClient) {
  const events = await listPageEvents();
  const guild = resolveGuild(discordClient);
  let newlySynced = 0;

  for (const event of events) {
    if (getSyncedEvent(event.id)) continue;
    if (!event.start_time) continue;

    const startTime = DateTime.fromISO(event.start_time);
    if (!startTime.isValid) continue;

    let discordScheduledEventId = null;
    if (guild) {
      try {
        discordScheduledEventId = await createDiscordScheduledEvent(guild, event, startTime);
      } catch (error) {
        logger.warn({ err: error, facebookEventId: event.id }, 'Failed to create Discord scheduled event');
      }
    }

    recordSyncedEvent({
      facebookEventId: event.id,
      discordScheduledEventId,
      name: event.name || 'Untitled event',
      startTime: startTime.toISO(),
    });
    newlySynced += 1;
  }

  return { checked: events.length, newlySynced };
}

function buildReminderEmbed(row, hoursBefore) {
  const start = DateTime.fromISO(row.start_time);
  return new EmbedBuilder()
    .setTitle(`Reminder: ${row.name}`)
    .setURL(`https://www.facebook.com/events/${row.facebook_event_id}`)
    .setColor(0x3d2f7a)
    .setDescription(`Starts <t:${Math.floor(start.toSeconds())}:R> (<t:${Math.floor(start.toSeconds())}:F>)`)
    .setFooter({ text: `${hoursBefore}-hour reminder` });
}

/**
 * Sends a channel reminder for any synced event crossing the 48h or 24h
 * mark before its start time, at most once per window per event.
 */
async function sendDueReminders(discordClient) {
  const channelId = getConfigValue(EVENTS_CHANNEL_ID_KEY);
  if (!channelId) return { remindersSent: 0, skipped: 'no_channel' };

  const now = DateTime.now();
  let remindersSent = 0;

  for (const row of listUpcomingSyncedEvents()) {
    const start = DateTime.fromISO(row.start_time);
    const hoursUntilStart = start.diff(now, 'hours').hours;

    for (const window of REMINDER_WINDOWS) {
      const alreadySent = window.key === '48h' ? row.reminder_48h_sent_at : row.reminder_24h_sent_at;
      if (alreadySent) continue;
      if (hoursUntilStart > window.hoursBefore) continue;

      const channel = await discordClient.channels.fetch(channelId);
      await channel.send({ embeds: [buildReminderEmbed(row, window.hoursBefore)] });
      markReminderSent(row.facebook_event_id, window.key);
      remindersSent += 1;
    }
  }

  return { remindersSent };
}

/**
 * Full sync pass: mirrors new Facebook events into Discord's native
 * Scheduled Events (silently), then sends any due 48h/24h reminders to the
 * configured channel. Called on a timer and via /sync-events.
 */
export async function syncEvents(discordClient) {
  const { checked, newlySynced } = await syncNewEvents(discordClient);
  const { remindersSent, skipped } = await sendDueReminders(discordClient);
  return { checked, newlySynced, remindersSent, skipped };
}
