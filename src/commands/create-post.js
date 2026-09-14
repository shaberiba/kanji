import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { canPublishToFacebook } from '../permissions.js';
import { createPost } from '../facebook/client.js';
import { logger } from '../logger.js';

export const data = new SlashCommandBuilder()
  .setName('create-post')
  .setDescription('Publish a plain post to the Facebook Page')
  .addStringOption((opt) =>
    opt.setName('message').setDescription('Post text').setRequired(true)
  )
  .addStringOption((opt) =>
    opt.setName('link').setDescription('Optional link to attach').setRequired(false)
  );

export async function execute(interaction) {
  if (!canPublishToFacebook(interaction)) {
    await interaction.reply({
      content: "You don't have permission to post to the Page. Ask an admin to grant your role access with /event-role.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const message = interaction.options.getString('message', true);
  const link = interaction.options.getString('link');

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const result = await createPost({ message, link });
    await interaction.editReply(`Posted: ${result.postUrl}`);
  } catch (error) {
    logger.error({ err: error }, 'Failed to create Facebook post');

    if (error.isAuthError) {
      await interaction.editReply(
        'Facebook authorization has expired. An admin needs to re-run the token setup script on the server.'
      );
    } else if (error.isRateLimited) {
      await interaction.editReply('Facebook is rate-limiting us right now. Try again in a minute.');
    } else {
      await interaction.editReply(`Something went wrong posting to Facebook: ${error.message}`);
    }
  }
}
