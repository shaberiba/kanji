import { db } from './index.js';

const getStmt = db.prepare('SELECT value FROM bot_config WHERE key = ?');
const setStmt = db.prepare(`
  INSERT INTO bot_config (key, value, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`);

export function getConfigValue(key) {
  return getStmt.get(key)?.value ?? null;
}

export function setConfigValue(key, value) {
  setStmt.run(key, value, new Date().toISOString());
}

export const EVENTS_CHANNEL_ID_KEY = 'events_channel_id';
