#!/usr/bin/env node
// One-off: adds a "Facebook event: <link>" line to the description of
// Discord Scheduled Events that were already synced before descriptions
// started including the link. New syncs get this automatically via
// buildEventDescription() in src/facebook/eventSync.js - safe to re-run.

import { config } from '../src/config.js';
import { db } from '../src/db/index.js';
import { listPageEvents } from '../src/facebook/client.js';
import { buildEventDescription } from '../src/facebook/eventSync.js';

async function main() {
  const rows = db.prepare('SELECT * FROM synced_events WHERE discord_scheduled_event_id IS NOT NULL').all();
  if (rows.length === 0) {
    console.log('No synced events with a Discord scheduled event to backfill.');
    return;
  }

  const fbEvents = await listPageEvents();
  const fbEventsById = new Map(fbEvents.map((e) => [e.id, e]));

  for (const row of rows) {
    const fbEvent = fbEventsById.get(row.facebook_event_id);
    if (!fbEvent) {
      console.log(`Skipping ${row.name} (${row.facebook_event_id}) - no longer found on Facebook`);
      continue;
    }

    const description = buildEventDescription(fbEvent);
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${config.discord.guildId}/scheduled-events/${row.discord_scheduled_event_id}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bot ${config.discord.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ description }),
      }
    );

    if (res.ok) {
      console.log(`Updated: ${row.name} (${row.facebook_event_id})`);
    } else {
      const body = await res.json().catch(() => ({}));
      console.log(`Failed: ${row.name} (${row.facebook_event_id}) - ${res.status} ${JSON.stringify(body)}`);
    }
  }
}

main().catch((error) => {
  console.error('Backfill failed:', error.message);
  process.exit(1);
});
