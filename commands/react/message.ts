import {
  Channel,
  CommandInteraction,
  MessageActionRow,
  MessageSelectMenu,
  Permissions,
  SelectMenuInteraction,
  TextChannel,
} from 'discord.js';
import RoleBot from '../../src/bot';
import { GET_GUILD_CATEGORIES } from '../../src/database/database';
import { LogService } from '../../src/services/logService';
import { Category } from '../../utilities/types/commands';
import { SlashCommand } from '../slashCommand';

export class ReactMessageCommand extends SlashCommand {
  constructor(client: RoleBot) {
    super(
      client,
      'react-message',
      'Use this command to react with a specific category of roles to a message.',
      Category.react,
      [Permissions.FLAGS.MANAGE_ROLES]
    );

    this.addStringOption(
      'message-link',
      'Copy a message link and place it here for the message you want me to react to.',
      true
    );
  }

  handleSelect = async (interaction: SelectMenuInteraction, args: string[]) => {
    const [guildId, channelId, messageId, categoryId] = args;

    const channel = await this.client.channels.fetch(channelId);

    if (!channel || !isTextChannel(channel)) {
      return interaction.reply({
        ephemeral: true,
        content: `Hey! I had an issue handling the option you selected for \`/${this.name}\`. Please wait a moment and try again.`,
      });
    }

    const message = await channel.messages.fetch(messageId);

    console.log(message);
  };

  execute = async (interaction: CommandInteraction) => {
    if (!interaction.isCommand()) return;

    const [messageLink] = this.extractStringVariables(
      interaction,
      'message-link'
    );

    if (!messageLink) {
      return await interaction.reply(
        `Hmm, I'm not what happened but I can't see the message link. Please try again.`
      );
    }

    const [_, channelId, messageId] = messageLink.match(/\d+/g) ?? [];

    const channel = await interaction.guild?.channels.fetch(channelId);

    if (!channel || !isTextChannel(channel)) {
      return await interaction.reply(
        `Hey! I couldn't find that channel, make sure you're copying the message link right.`
      );
    }

    const message = await channel.messages.fetch(messageId);

    if (!message) {
      return await interaction.reply(
        `Hey! I couldn't find that message, make sure you're copying the message link right.`
      );
    }

    // Trying to be as detailed as possible to user if categories don't exist or if they are all empty.
    const guildHasNoCategories = `It appears there are no categories! Try out \`/category-create\` to create a category reaction pack to store and manage your roles much easier.`;
    const allCategoriesAreEmpty = `Hey! It appears all your categories are empty. I can't react to the message you want if you have at least one react role in at least one category. Check out \`/category-add\` to start adding roles to a category.`;

    const categories = await GET_GUILD_CATEGORIES(interaction.guildId);
    const guildHasCategories = categories.length;
    const categoriesHaveRoles = categories.filter((c) => c.roles.length).length;

    if (!guildHasCategories) {
      LogService.debug(
        `Guild[${interaction.guildId}] has no categories. Cannot do command[${this.name}]`
      );

      return interaction.reply({
        content: guildHasNoCategories,
      });
    } else if (!categoriesHaveRoles) {
      LogService.debug(
        `Guild[${interaction.guildId}] has categories but all of them are empty.`
      );

      return interaction.reply({
        content: allCategoriesAreEmpty,
      });
    }

    const selectMenu = new MessageActionRow().addComponents(
      new MessageSelectMenu()
        .setCustomId(`select-message`)
        .setPlaceholder(`Pick a category to react with.`)
        .addOptions(
          categories.map((c, idx) => ({
            label: c.name ?? `Category-${idx}`,
            description: c.description ?? '',
            value: `message-${c.guildId}-${channelId}-${messageId}-${c._id}`,
          }))
        )
    );

    await interaction.reply({
      content: `Let's make this easier for you. Select a category and I will use the reaction roles in that category to react to the message.`,
      components: [selectMenu],
    });
  };
}

function isTextChannel(channel: Channel): channel is TextChannel {
  return channel.type === 'GUILD_TEXT';
}
