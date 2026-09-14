import { db } from './index.js';

const getStmt = db.prepare('SELECT events_channel_id FROM guild_config WHERE guild_id = ?');
const setStmt = db.prepare(`
  INSERT INTO guild_config (guild_id, events_channel_id, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(guild_id) DO UPDATE SET events_channel_id = excluded.events_channel_id, updated_at = excluded.updated_at
`);
const listConfiguredStmt = db.prepare(
  'SELECT guild_id, events_channel_id FROM guild_config WHERE events_channel_id IS NOT NULL'
);

export function getEventsChannel(guildId) {
  return getStmt.get(guildId)?.events_channel_id ?? null;
}

export function setEventsChannel(guildId, channelId) {
  setStmt.run(guildId, channelId, new Date().toISOString());
}

/** Guilds that have configured a reminder channel - candidates for reminders. */
export function listGuildsWithEventsChannel() {
  return listConfiguredStmt.all();
}
