#!/usr/bin/env node
// Read-only health check: confirms the stored Page token is valid, checks
// whether this app can read the Page's existing events (needed for the
// Discord event-sync feature), and optionally smoke-tests whether it can
// also create Page events (a capability Meta has restricted for most
// third-party apps - confirmed dead for this app as of the last check).

import { verifyPageToken, createEvent, listPageEvents } from '../src/facebook/client.js';
import { config } from '../src/config.js';

async function main() {
  const status = await verifyPageToken();
  if (!status.ok) {
    console.error(`Token check failed: ${status.reason}`);
    process.exit(1);
  }
  console.log(`Token OK. Connected to Page "${status.pageName}" (${status.pageId}).`);

  console.log('\nChecking read access to Page events (needed for /sync-events)...');
  try {
    const events = await listPageEvents();
    console.log(`Read access OK - found ${events.length} event(s) currently on the Page.`);
  } catch (error) {
    console.log(`Read access FAILED: ${error.message}`);
    console.log('The Discord event-sync feature will not work until this is resolved.');
  }

  const doEventTest = process.argv.includes('--test-event-creation');
  if (!doEventTest) {
    console.log('\nRun again with --test-event-creation to also verify event creation works for this app');
    console.log('(this will create a real, visible test event on the Page - delete it manually afterward).');
    return;
  }

  console.log('\nAttempting to create a test event...');
  const inOneWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const result = await createEvent({
    name: `[TEST] kanji connection check - safe to delete`,
    startTimeIso: inOneWeek,
    description: 'Created by scripts/test-facebook-connection.js to verify API access. Delete me.',
  });

  console.log(`\nResult: ${result.status}`);
  console.log(result);

  if (result.status === 'created') {
    console.log(`\nSuccess - real event creation works for this app. Delete the test event: ${result.eventUrl}`);
  } else if (result.status === 'posted_fallback') {
    console.log(
      '\nEvent creation is NOT available for this app - fell back to a Page post. ' +
        `Delete the test post (id: ${result.postId}). See the plan's fallback strategy.`
    );
  } else {
    console.log('\nBoth event creation and the post fallback failed. See error details above.');
  }
}

main().catch((error) => {
  console.error('Connection test failed:', error.message);
  process.exit(1);
});
