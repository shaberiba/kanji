import { SlashCommandBuilder, MessageFlags } from 'discord.js';

export const data = new SlashCommandBuilder().setName('ping').setDescription('Health check');

export async function execute(interaction) {
  await interaction.reply({ content: 'pong', flags: MessageFlags.Ephemeral });
}
