import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config.js';

mkdirSync(dirname(config.databasePath), { recursive: true });

export const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS facebook_tokens (
    page_id TEXT PRIMARY KEY,
    page_name TEXT,
    page_access_token TEXT NOT NULL,
    long_lived_user_token TEXT,
    token_status TEXT NOT NULL DEFAULT 'unknown',
    token_obtained_at TEXT NOT NULL,
    token_last_verified_at TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS allowed_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    added_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(guild_id, role_id)
  );

  CREATE TABLE IF NOT EXISTS bot_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS synced_events (
    facebook_event_id TEXT PRIMARY KEY,
    discord_scheduled_event_id TEXT,
    name TEXT NOT NULL,
    start_time TEXT NOT NULL,
    reminder_48h_sent_at TEXT,
    reminder_24h_sent_at TEXT,
    synced_at TEXT NOT NULL
  );
`);
