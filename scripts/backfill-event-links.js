#!/usr/bin/env node
// One-off: patches already-synced Discord Scheduled Events with metadata
// added after they were first created - the "Facebook event: <link>" line
// in the description, and the Facebook cover photo as the event's image.
// New syncs get both automatically via buildEventDescription()/
// buildEventImage() in src/facebook/eventSync.js. Safe to re-run. Covers
// every guild the event was synced into, not just one.

import { config } from '../src/config.js';
import { db } from '../src/db/index.js';
import { listPageEvents } from '../src/facebook/client.js';
import { buildEventDescription, buildEventImage } from '../src/facebook/eventSync.js';

async function main() {
  const rows = db.prepare('SELECT * FROM guild_event_sync WHERE discord_scheduled_event_id IS NOT NULL').all();
  if (rows.length === 0) {
    console.log('No synced events with a Discord scheduled event to backfill.');
    return;
  }

  const fbEvents = await listPageEvents();
  const fbEventsById = new Map(fbEvents.map((e) => [e.id, e]));

  for (const row of rows) {
    const fbEvent = fbEventsById.get(row.facebook_event_id);
    const label = `${fbEvent?.name || row.facebook_event_id} (guild ${row.guild_id})`;
    if (!fbEvent) {
      console.log(`Skipping ${label} - no longer found on Facebook`);
      continue;
    }

    const description = buildEventDescription(fbEvent);
    const image = await buildEventImage(fbEvent);
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${row.guild_id}/scheduled-events/${row.discord_scheduled_event_id}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bot ${config.discord.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(image ? { description, image } : { description }),
      }
    );

    if (res.ok) {
      console.log(`Updated: ${label}${image ? ' [with image]' : ' [no cover photo]'}`);
    } else {
      const body = await res.json().catch(() => ({}));
      console.log(`Failed: ${label} - ${res.status} ${JSON.stringify(body)}`);
    }
  }
}

main().catch((error) => {
  console.error('Backfill failed:', error.message);
  process.exit(1);
});
