import { EmbedBuilder, GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel } from 'discord.js';
import { DateTime } from 'luxon';
import { listPageEvents } from './client.js';
import { getGuildEventSync, recordGuildEventSync, markGuildEventReminderSent } from '../db/guildEventSyncStore.js';
import { getEventsChannel } from '../db/guildConfigStore.js';
import { logger } from '../logger.js';

const DEFAULT_EVENT_DURATION_HOURS = 3;
const REMINDER_WINDOWS = [
  { key: '48h', hoursBefore: 48 },
  { key: '24h', hoursBefore: 24 },
];

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
 * Creates a Discord native Scheduled Event mirroring a Facebook event in one
 * specific guild. Silent by design - no channel message. Returns the created
 * event's id, or null if the Facebook event's start time has already passed
 * (Discord rejects scheduled events with a start time in the past).
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

function buildDiscordEventUrl(guildId, discordScheduledEventId) {
  return `https://discord.com/events/${guildId}/${discordScheduledEventId}`;
}

/**
 * The title links to the Discord Scheduled Event itself (so clicking it
 * opens the RSVP/"Interested" page right there in Discord) when we have
 * one; the Facebook link is always surfaced separately as a field, since
 * that's where the full event details/comments/etc. live.
 */
function buildReminderEmbed(fbEvent, startTime, hoursBefore, { guildId, discordScheduledEventId } = {}) {
  const facebookUrl = `https://www.facebook.com/events/${fbEvent.id}`;
  const discordUrl = discordScheduledEventId ? buildDiscordEventUrl(guildId, discordScheduledEventId) : null;

  const embed = new EmbedBuilder()
    .setTitle(fbEvent.name || 'Untitled event')
    .setURL(discordUrl || facebookUrl)
    .setColor(hoursBefore <= 24 ? 0xe0433d : 0x3d2f7a)
    .setDescription(`Starts <t:${Math.floor(startTime.toSeconds())}:R> (<t:${Math.floor(startTime.toSeconds())}:F>)`)
    .setFooter({ text: `${hoursBefore}-hour reminder` });

  if (fbEvent.place?.name) {
    embed.addFields({ name: 'Location', value: fbEvent.place.name });
  }

  const links = discordUrl ? [`[Discord event](${discordUrl})`, `[Facebook event](${facebookUrl})`] : [`[Facebook event](${facebookUrl})`];
  embed.addFields({ name: 'Links', value: links.join(' · ') });

  if (fbEvent.cover?.source) {
    embed.setThumbnail(fbEvent.cover.source);
  }

  return embed;
}

/**
 * Handles one Facebook event for one guild: mirrors it into that guild's
 * Scheduled Events if not already done, then sends any due 48h/24h
 * reminder to that guild's configured channel (if it has one).
 * Independent per guild - one guild's config/history never affects another.
 */
async function syncEventForGuild(discordClient, guild, fbEvent, startTime, isPast) {
  let result = { synced: false, remindersSent: 0 };
  let row = getGuildEventSync(fbEvent.id, guild.id);

  if (!row) {
    let discordScheduledEventId = null;
    if (!isPast) {
      try {
        discordScheduledEventId = await createDiscordScheduledEvent(guild, fbEvent, startTime);
      } catch (error) {
        logger.warn({ err: error, facebookEventId: fbEvent.id, guildId: guild.id }, 'Failed to create Discord scheduled event');
      }
    }
    recordGuildEventSync({ facebookEventId: fbEvent.id, guildId: guild.id, discordScheduledEventId });
    row = {
      reminder_48h_sent_at: null,
      reminder_24h_sent_at: null,
      discord_scheduled_event_id: discordScheduledEventId,
    };
    result.synced = true;
  }

  if (isPast) return result;

  const channelId = getEventsChannel(guild.id);
  if (!channelId) return result;

  const hoursUntilStart = startTime.diff(DateTime.now(), 'hours').hours;
  for (const window of REMINDER_WINDOWS) {
    const alreadySent = window.key === '48h' ? row.reminder_48h_sent_at : row.reminder_24h_sent_at;
    if (alreadySent || hoursUntilStart > window.hoursBefore) continue;

    try {
      const channel = await discordClient.channels.fetch(channelId);
      const embed = buildReminderEmbed(fbEvent, startTime, window.hoursBefore, {
        guildId: guild.id,
        discordScheduledEventId: row.discord_scheduled_event_id,
      });
      await channel.send({ embeds: [embed] });
      markGuildEventReminderSent(fbEvent.id, guild.id, window.key);
      result.remindersSent += 1;
    } catch (error) {
      // One guild's misconfigured/inaccessible channel must never abort the
      // sync pass for every other guild and event - log and keep going, and
      // leave the reminder unmarked so it's retried next poll.
      logger.warn(
        { err: error, facebookEventId: fbEvent.id, guildId: guild.id, channelId },
        'Failed to send event reminder'
      );
    }
  }

  return result;
}

/**
 * Full sync pass, run once per Facebook Page fetch and applied
 * independently to every guild the bot is currently a member of - the same
 * Page can be mirrored into any number of servers, each with its own
 * reminder channel and its own sync/reminder history. Called on a timer
 * and via /sync-events.
 */
export async function syncEvents(discordClient) {
  const events = await listPageEvents();
  const guilds = [...discordClient.guilds.cache.values()];

  let newlySynced = 0;
  let remindersSent = 0;

  for (const event of events) {
    if (!event.start_time) continue;
    const startTime = DateTime.fromISO(event.start_time);
    if (!startTime.isValid) continue;
    const isPast = startTime <= DateTime.now();

    for (const guild of guilds) {
      const result = await syncEventForGuild(discordClient, guild, event, startTime, isPast);
      if (result.synced) newlySynced += 1;
      remindersSent += result.remindersSent;
    }
  }

  return { checked: events.length, guildsChecked: guilds.length, newlySynced, remindersSent };
}
