import { db } from './index.js';

const getStmt = db.prepare('SELECT * FROM guild_event_sync WHERE facebook_event_id = ? AND guild_id = ?');
const insertStmt = db.prepare(`
  INSERT INTO guild_event_sync (facebook_event_id, guild_id, discord_scheduled_event_id, synced_at)
  VALUES (?, ?, ?, ?)
`);
const markReminderStmt = {
  '48h': db.prepare(
    'UPDATE guild_event_sync SET reminder_48h_sent_at = ? WHERE facebook_event_id = ? AND guild_id = ?'
  ),
  '24h': db.prepare(
    'UPDATE guild_event_sync SET reminder_24h_sent_at = ? WHERE facebook_event_id = ? AND guild_id = ?'
  ),
};

export function getGuildEventSync(facebookEventId, guildId) {
  return getStmt.get(facebookEventId, guildId) ?? null;
}

export function recordGuildEventSync({ facebookEventId, guildId, discordScheduledEventId }) {
  insertStmt.run(facebookEventId, guildId, discordScheduledEventId ?? null, new Date().toISOString());
}

export function markGuildEventReminderSent(facebookEventId, guildId, which) {
  markReminderStmt[which].run(new Date().toISOString(), facebookEventId, guildId);
}
