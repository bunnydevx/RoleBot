import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  parseEmoji,
} from 'discord.js';
import { ReactRoleType } from '../../src/database/entities/reactRole.entity';
import {
  CREATE_REACT_ROLE,
  GET_REACT_ROLES_BY_GUILD,
  GET_REACT_ROLE_BY_EMOJI,
  GET_REACT_ROLE_BY_ROLE_ID,
} from '../../src/database/queries/reactRole.query';
import { RolePing } from '../../utilities/utilPings';
import { isValidRolePosition } from '../../utilities/utils';
import { SlashSubCommand } from '../command';

export class CreateSubcommand extends SlashSubCommand {
  constructor(baseCommand: string) {
    super(baseCommand, 'create', 'Create a new react role.', [
      {
        name: 'role',
        description: 'The role the user will get.',
        required: true,
        type: ApplicationCommandOptionType.Role,
      },
      {
        name: 'emoji',
        description: 'The emoji users will use',
        required: true,
        type: ApplicationCommandOptionType.String,
      },
    ]);
  }

  execute = async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.isCommand() || !interaction.guildId) return;

    await interaction.deferReply({
      ephemeral: true,
    });

    const { guild } = interaction;
    if (!guild) return;

    const role = this.expect(interaction.options.getRole('role'), {
      message: `Somehow the role is missing! Please try again.`,
      prop: 'role',
    });
    const emoji = this.expect(interaction.options.getString('emoji'), {
      message: 'Somehow the emoji is missing! Please try again.',
      prop: 'emoji',
    });

    const reactRolesNotInCategory = (
      await GET_REACT_ROLES_BY_GUILD(guild.id)
    ).filter((r) => !r.categoryId).length;

    /**
     * Discord button row limitation is 5x5 so only a max of 25 buttons.
     */
    if (reactRolesNotInCategory >= 24) {
      return interaction.editReply({
        content: `Hey! It turns out you have ${reactRolesNotInCategory} react roles not in a category.\nPlease add some react roles to a category before creating anymore. If however \`/category add\` isn't responding please *remove* some react roles to get below 25 **not in a category**. This is due to a Discord limitation!`,
      });
    }

    const isValidPosition = await isValidRolePosition(interaction, role);

    if (!isValidPosition) {
      const embed = new EmbedBuilder()
        .setTitle('Reaction Roles Setup')
        .setDescription(
          `The role ${RolePing(
            role.id
          )} is above me in the role list which you can find in \`Server settings > Roles\`.\nPlease make sure that my role that is listed above the roles you want to assign.`
        );

      const button = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel('Discord Roles')
          .setURL(
            'https://support.discord.com/hc/en-us/articles/214836687-Role-Management-101'
          )
          .setStyle(ButtonStyle.Link)
      );

      return interaction.editReply({
        embeds: [embed],
        components: [button],
      });
    }

    const parsedEmoji = parseEmoji(emoji);

    if (!parsedEmoji?.id && !parsedEmoji?.name) {
      return interaction.editReply(
        `Hey! I had an issue parsing whatever emoji you passed in. Please wait and try again.`
      );
    }

    /**
     * For now RoleBot doesn't allow two roles to share the same emoji.
     */
    let reactRole = await GET_REACT_ROLE_BY_EMOJI(
      parsedEmoji?.id ?? emoji,
      guild.id
    );

    if (reactRole) {
      const emojiMention = reactRole?.emojiTag ?? reactRole?.emojiId;

      return interaction.editReply(
        `The react role (${emojiMention} - ${RolePing(
          reactRole.roleId
        )}) already has this emoji assigned to it.`
      );
    }

    /**
     * Also check that the role isn't used already.
     */
    reactRole = await GET_REACT_ROLE_BY_ROLE_ID(role.id);

    if (reactRole) {
      const emojiMention = reactRole?.emojiTag ?? reactRole?.emojiId;
      return interaction.editReply(
        `There's a react role already using the role \`${
          reactRole.name
        }\` (${emojiMention} - ${RolePing(reactRole.roleId)}).`
      );
    }

    /* This is used when mentioning a custom emoji, otherwise it's unicode and doesn't have a custom ID. */
    const emojiTag = parsedEmoji?.id
      ? `<${parsedEmoji.animated ? 'a' : ''}:nn:${parsedEmoji.id}>`
      : null;

    CREATE_REACT_ROLE(
      role.name,
      role.id,
      parsedEmoji?.id ?? parsedEmoji?.name ?? emoji,
      emojiTag,
      interaction.guildId,
      ReactRoleType.normal
    )
      .then((reactRole) => {
        this.log.debug(
          `Successfully created the react role[${role.id}] with emoji[${
            parsedEmoji?.id ?? parsedEmoji.name
          }]`,
          interaction.guildId
        );

        const emojiMention = reactRole?.emojiTag ?? reactRole?.emojiId;

        return interaction.editReply(
          `:tada: Successfully created the react role (${emojiMention} - ${RolePing(
            role.id
          )}) :tada: \n**Make sure to add your newly created react role to a category with \`/category add\`!**`
        );
      })
      .catch((e) => {
        this.log.error(
          `Failed to create react role[${role.id}] | emoji[id: ${parsedEmoji?.id} : string: ${emoji}]\n${e}`,
          interaction.guildId
        );

        return interaction.editReply(
          'React role failed to create. Please try again.'
        );
      });
  };
}
