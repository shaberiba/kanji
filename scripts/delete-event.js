#!/usr/bin/env node
// One-off: delete a Facebook Page event by ID.
//
//   node scripts/delete-event.js <event-id>

import { deleteEvent } from '../src/facebook/client.js';

const eventId = process.argv[2];
if (!eventId) {
  console.error('Usage: node scripts/delete-event.js <event-id>');
  process.exit(1);
}

deleteEvent(eventId)
  .then(() => {
    console.log(`Deleted Facebook event ${eventId}.`);
  })
  .catch((error) => {
    console.error(`Failed to delete event ${eventId}:`, error.message);
    process.exit(1);
  });
