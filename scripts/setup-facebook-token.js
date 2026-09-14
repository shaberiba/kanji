#!/usr/bin/env node
// One-time (or re-auth) setup: exchanges a short-lived Facebook User Access
// Token for a long-lived Page Access Token and stores it in SQLite.
//
// Run this on the host, never via Discord - the token must not pass through
// any logging system or chat interface.
//
// Get a short-lived user token first:
//   1. https://developers.facebook.com/tools/explorer
//   2. Select your app, click "Get User Access Token"
//   3. Grant the page permissions your app was approved for
//   4. Copy the generated token and paste it below when prompted

import readline from 'node:readline';
import { config } from '../src/config.js';
import { exchangeLongLivedUserToken, fetchPageToken } from '../src/facebook/client.js';
import { saveFacebookToken } from '../src/db/tokenStore.js';

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const stdin = process.stdin;
    let muted = false;

    rl._writeToOutput = (str) => {
      if (!muted) rl.output.write(str);
    };

    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });

    // Mute echo after the prompt text itself has been written.
    muted = true;
  });
}

async function main() {
  console.log(`Setting up Facebook token for Page ID: ${config.facebook.pageId}\n`);

  const shortLivedToken = await promptHidden('Paste short-lived User Access Token: ');
  if (!shortLivedToken) {
    console.error('No token provided, aborting.');
    process.exit(1);
  }

  console.log('Exchanging for a long-lived user token...');
  const longLivedUserToken = await exchangeLongLivedUserToken(shortLivedToken);

  console.log('Deriving Page Access Token...');
  const page = await fetchPageToken(longLivedUserToken, config.facebook.pageId);

  saveFacebookToken({
    pageId: page.id,
    pageName: page.name,
    pageAccessToken: page.accessToken,
    longLivedUserToken,
  });

  console.log(`\nDone. Connected to Page "${page.name}" (${page.id}).`);
  console.log('Run `npm run test-facebook-connection` to verify event creation works for this app.');
}

main().catch((error) => {
  console.error('\nSetup failed:', error.message);
  process.exit(1);
});
