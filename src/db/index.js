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

  -- Per-guild settings. A guild only participates in event sync/reminders
  -- once it has an events_channel_id set (via /events-channel set) -
  -- multiple guilds can each configure their own independently.
  CREATE TABLE IF NOT EXISTS guild_config (
    guild_id TEXT PRIMARY KEY,
    events_channel_id TEXT,
    updated_at TEXT NOT NULL
  );

  -- One Facebook event can be mirrored into multiple guilds' native
  -- Scheduled Events (one Discord event id per guild) with independent
  -- reminder tracking per guild.
  CREATE TABLE IF NOT EXISTS guild_event_sync (
    facebook_event_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    discord_scheduled_event_id TEXT,
    reminder_48h_sent_at TEXT,
    reminder_24h_sent_at TEXT,
    synced_at TEXT NOT NULL,
    PRIMARY KEY (facebook_event_id, guild_id)
  );
`);
