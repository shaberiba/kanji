#!/usr/bin/env node
// Read-only health check: confirms the stored Page token is valid, and
// separately smoke-tests whether this app can actually create Page events
// (the capability Meta has restricted for most third-party apps).

import { verifyPageToken, createEvent } from '../src/facebook/client.js';
import { config } from '../src/config.js';

async function main() {
  const status = await verifyPageToken();
  if (!status.ok) {
    console.error(`Token check failed: ${status.reason}`);
    process.exit(1);
  }
  console.log(`Token OK. Connected to Page "${status.pageName}" (${status.pageId}).`);

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
