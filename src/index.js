import { Client, GatewayIntentBits, MessageFlags } from 'discord.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { commands } from './commands/index.js';
import { syncEvents } from './facebook/eventSync.js';
import './db/index.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  logger.info({ tag: client.user.tag }, 'Bot ready');

  const intervalMs = config.eventsPollIntervalMinutes * 60 * 1000;
  setInterval(() => {
    syncEvents(client)
      .then((result) => {
        if (result.newlySynced > 0 || result.remindersSent > 0) {
          logger.info(result, 'Facebook event sync: synced events / sent reminders');
        }
      })
      .catch((error) => logger.error({ err: error }, 'Scheduled event sync failed'));
  }, intervalMs);
  logger.info({ intervalMinutes: config.eventsPollIntervalMinutes }, 'Facebook events poller started');
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    logger.error({ err: error, command: interaction.commandName }, 'Command execution failed');
    const payload = { content: 'Something went wrong running that command.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

client.login(config.discord.botToken);
