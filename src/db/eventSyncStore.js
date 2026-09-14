import { db } from './index.js';

const getStmt = db.prepare('SELECT * FROM synced_events WHERE facebook_event_id = ?');
const insertStmt = db.prepare(`
  INSERT INTO synced_events (facebook_event_id, discord_scheduled_event_id, name, start_time, synced_at)
  VALUES (@facebookEventId, @discordScheduledEventId, @name, @startTime, @syncedAt)
`);
const markReminderStmt = {
  '48h': db.prepare('UPDATE synced_events SET reminder_48h_sent_at = ? WHERE facebook_event_id = ?'),
  '24h': db.prepare('UPDATE synced_events SET reminder_24h_sent_at = ? WHERE facebook_event_id = ?'),
};
const listUpcomingStmt = db.prepare(
  'SELECT * FROM synced_events WHERE start_time > ? ORDER BY start_time ASC'
);

export function getSyncedEvent(facebookEventId) {
  return getStmt.get(facebookEventId) ?? null;
}

export function recordSyncedEvent({ facebookEventId, discordScheduledEventId, name, startTime }) {
  insertStmt.run({
    facebookEventId,
    discordScheduledEventId: discordScheduledEventId ?? null,
    name,
    startTime,
    syncedAt: new Date().toISOString(),
  });
}

export function markReminderSent(facebookEventId, which) {
  markReminderStmt[which].run(new Date().toISOString(), facebookEventId);
}

/** Events we've synced whose start time hasn't passed yet - candidates for reminders. */
export function listUpcomingSyncedEvents() {
  return listUpcomingStmt.all(new Date().toISOString());
}
