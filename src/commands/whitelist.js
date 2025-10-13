// commands/whitelist.js - mark users as OK
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { addToWhitelist, removeFromWhitelist, isWhitelisted, getWhitelistInfo, getAllWhitelisted } = require('../whitelist');
const { isAboveBaseRole } = require('../utils');
const { SCAM_CHANNEL_ID } = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Manage the whitelist')
    .setDefaultMemberPermissions(null)
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a user to the whitelist')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('The user to whitelist')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('reason')
            .setDescription('Reason for whitelisting')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a user from the whitelist')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('The user to remove from whitelist')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('check')
        .setDescription('Check if a user is whitelisted')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('The user to check')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all whitelisted users')
    ),

  async execute(interaction) {
    // Check permissions
    if (!isAboveBaseRole(interaction.member)) {
      await interaction.reply({ 
        content: "You don't have permission to use this command.", 
        ephemeral: true 
      });
      return;
    }
    
    // Check if command is being used in the scam channel or its threads
    if (interaction.channel.parentId !== SCAM_CHANNEL_ID && interaction.channelId !== SCAM_CHANNEL_ID) {
      await interaction.reply({
        content: "⚠️ Whitelist commands can only be used in the scam reports channel or its threads.",
        ephemeral: true
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'add') {
      const user = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'Manual whitelist via command';

      if (isWhitelisted(user.id)) {
        await interaction.reply({ 
          content: `${user.tag} is already whitelisted.`, 
          ephemeral: true 
        });
        return;
      }

      // Try to fetch the guild member for display name
      let displayName = user.username;
      try {
        const member = await interaction.guild.members.fetch(user.id);
        displayName = member.displayName;
      } catch (e) {
        // If member not found, use username
      }

      const result = addToWhitelist(
        user.id,
        user.tag,
        `${interaction.user.tag} (${interaction.user.id})`,
        reason,
        displayName
      );

      if (result.success) {
        // Try to fetch the guild member for display name
        let displayName = user.username;
        try {
          const member = await interaction.guild.members.fetch(user.id);
          displayName = member.displayName;
        } catch (e) {
          // If member not found, use username
        }

        const embed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('User Whitelisted')
          .setDescription(`Successfully added **${displayName}** to the whitelist.`)
          .addFields(
            { name: 'Display Name', value: displayName, inline: true },
            { name: 'Username', value: user.tag, inline: true },
            { name: 'User ID', value: user.id, inline: true },
            { name: 'Added by', value: interaction.user.tag, inline: true },
            { name: 'Reason', value: reason, inline: false }
          )
          .setThumbnail(user.displayAvatarURL({ dynamic: true }))
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply({ 
          content: `Failed to whitelist user: ${result.message}`, 
          ephemeral: true 
        });
      }
    }

    else if (subcommand === 'remove') {
      const user = interaction.options.getUser('user');

      if (!isWhitelisted(user.id)) {
        await interaction.reply({ 
          content: `${user.tag} is not whitelisted.`, 
          ephemeral: true 
        });
        return;
      }

      const result = removeFromWhitelist(user.id);

      if (result.success) {
        // Try to fetch the guild member for display name
        let displayName = user.username;
        try {
          const member = await interaction.guild.members.fetch(user.id);
          displayName = member.displayName;
        } catch (e) {
          // If member not found, use username
        }

        const embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('User Removed from Whitelist')
          .setDescription(`Successfully removed **${displayName}** from the whitelist.`)
          .addFields(
            { name: 'Display Name', value: displayName, inline: true },
            { name: 'Username', value: user.tag, inline: true },
            { name: 'User ID', value: user.id, inline: true },
            { name: 'Removed by', value: interaction.user.tag, inline: true }
          )
          .setThumbnail(user.displayAvatarURL({ dynamic: true }))
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply({ 
          content: `Failed to remove user from whitelist: ${result.message}`, 
          ephemeral: true 
        });
      }
    }

    else if (subcommand === 'check') {
      const user = interaction.options.getUser('user');
      const info = getWhitelistInfo(user.id);

      if (info) {
        // Try to fetch the guild member for display name
        let displayName = user.username;
        try {
          const member = await interaction.guild.members.fetch(user.id);
          displayName = member.displayName;
        } catch (e) {
          // If member not found, use username
        }

        const embed = new EmbedBuilder()
          .setColor('#0099FF')
          .setTitle('Whitelist Status')
          .setDescription(`**${displayName}** is whitelisted.`)
          .addFields(
            { name: 'Display Name', value: displayName, inline: true },
            { name: 'Username', value: user.tag, inline: true },
            { name: 'User ID', value: user.id, inline: true },
            { name: 'Added by', value: info.addedBy, inline: true },
            { name: 'Added at', value: new Date(info.addedAt).toUTCString(), inline: true },
            { name: 'Reason', value: info.reason, inline: false }
          )
          .setThumbnail(user.displayAvatarURL({ dynamic: true }))
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply({ 
          content: `${user.tag} is not whitelisted.`, 
          ephemeral: true 
        });
      }
    }

    else if (subcommand === 'list') {
      const whitelisted = getAllWhitelisted();

      if (whitelisted.length === 0) {
        await interaction.reply({ 
          content: 'No users are currently whitelisted.', 
          ephemeral: true 
        });
        return;
      }

      // Create pages if there are many users
      const usersPerPage = 10;
      const totalPages = Math.ceil(whitelisted.length / usersPerPage);
      const page = 1; // For now, just show the first page

      const startIndex = (page - 1) * usersPerPage;
      const endIndex = startIndex + usersPerPage;
      const usersOnPage = whitelisted.slice(startIndex, endIndex);

      const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('Whitelisted Users')
        .setDescription(`Total: ${whitelisted.length} users`)
        .setFooter({ text: `Page ${page} of ${totalPages}` })
        .setTimestamp();

      usersOnPage.forEach((user, index) => {
        const fieldName = `${startIndex + index + 1}. ${user.displayName || user.username}`;
        const fieldValue = `Username: ${user.username}\nID: ${user.id}\nAdded: ${new Date(user.addedAt).toLocaleDateString()}`;
        embed.addFields({ name: fieldName, value: fieldValue, inline: true });
      });

      await interaction.reply({ embeds: [embed] });
    }
  },
};