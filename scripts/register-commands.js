import { REST, Routes } from 'discord.js';
import { config } from '../src/config.js';
import { commandData } from '../src/commands/index.js';

const rest = new REST().setToken(config.discord.botToken);

const route = config.discord.guildId
  ? Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId)
  : Routes.applicationCommands(config.discord.clientId);

console.log(
  config.discord.guildId
    ? `Registering ${commandData.length} commands to guild ${config.discord.guildId} (fast, dev)...`
    : `Registering ${commandData.length} commands globally (can take up to an hour to propagate)...`
);

await rest.put(route, { body: commandData });
console.log('Done.');
