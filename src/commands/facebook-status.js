import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { isOwnerOrAdmin } from '../permissions.js';
import { verifyPageToken } from '../facebook/client.js';

export const data = new SlashCommandBuilder()
  .setName('facebook-status')
  .setDescription('Check the status of the Facebook Page connection (admin only)');

export async function execute(interaction) {
  if (!isOwnerOrAdmin(interaction)) {
    await interaction.reply({
      content: "You don't have permission to view this.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await verifyPageToken();

  if (result.ok) {
    await interaction.editReply(
      `Connected to Facebook Page "${result.pageName}" (${result.pageId}). Token status: valid.`
    );
  } else {
    await interaction.editReply(
      `Facebook connection problem: ${result.reason}\n` +
        'If this is an expired/invalid token, an admin needs to SSH into the server and run: `npm run setup-facebook-token`'
    );
  }
}
