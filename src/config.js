import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  discord: {
    botToken: required('DISCORD_BOT_TOKEN'),
    clientId: required('DISCORD_CLIENT_ID'),
    guildId: process.env.DISCORD_GUILD_ID || null,
    ownerId: required('OWNER_DISCORD_ID'),
  },
  facebook: {
    appId: required('FACEBOOK_APP_ID'),
    appSecret: required('FACEBOOK_APP_SECRET'),
    pageId: required('FACEBOOK_PAGE_ID'),
    graphApiVersion: process.env.GRAPH_API_VERSION || 'v21.0',
  },
  defaultTimezone: process.env.DEFAULT_TIMEZONE || 'America/Chicago',
  databasePath: process.env.DATABASE_PATH || './data/bot.sqlite3',
  logLevel: process.env.LOG_LEVEL || 'info',
};
