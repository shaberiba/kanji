import { db } from './index.js';

const getStmt = db.prepare('SELECT * FROM posted_events WHERE facebook_event_id = ?');
const insertStmt = db.prepare(`
  INSERT INTO posted_events (facebook_event_id, discord_message_id, posted_at)
  VALUES (?, ?, ?)
`);

export function isEventPosted(facebookEventId) {
  return getStmt.get(facebookEventId) != null;
}

export function markEventPosted(facebookEventId, discordMessageId) {
  insertStmt.run(facebookEventId, discordMessageId ?? null, new Date().toISOString());
}
