//sus.js - call out suspicious users
const { SlashCommandBuilder, EmbedBuilder,MessageFlags,ChannelType, InteractionContextType, PermissionFlagsBits } = require('discord.js');
const { BASE_ROLE_ID, SCAM_CHANNEL_ID } = require('../config');
const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { suspiciousUserThreads } = require('../messageHandlers');
const { isAboveBaseRole, canBeModerated } = require('../utils');

// List of suspicious/watching gifs
const suspiciousGifs = [
    'https://media1.tenor.com/m/mH7a6LBNsOQAAAAd/poul3-f-r3veil-p.gif',
    'https://media.tenor.com/HoJTiDa5_AYAAAAi/this-is-a-little-suspicious-kyle-broflovski.gif',
    'https://media1.tenor.com/m/hsmlP5zWsE4AAAAd/wyaking.gif',
    'https://media1.tenor.com/m/hsmlP5zWsE4AAAAd/wyaking.gif',
    'https://media1.tenor.com/m/tU3q-QmWwv0AAAAd/cool-cats-blue-cat.gif',
    'https://media1.tenor.com/m/5j6SImhtzsEAAAAd/sus-suspect.gif',
    'https://media1.tenor.com/m/homCwhdEfAcAAAAd/spider-man-sus.gif',
    'https://media1.tenor.com/m/nQb_AeIG97cAAAAd/sus-suspicious.gif'
];

const pickRandomGif = () => suspiciousGifs[Math.floor(Math.random() * suspiciousGifs.length)];

async function getRecentUserMessages(channel, userId, limit = 3) {
    // Fetch last 100 messages from the channel
    const messages = await channel.messages.fetch({ limit: 100 });
    
    // Filter for the user's messages and sort by timestamp
    const userMessages = Array.from(messages
        .filter(msg => msg.author.id === userId)
        .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
        .values())
        .slice(0, limit);

    return userMessages;
}

function formatMessageEmbed(messages) {
    if (!messages || messages.length === 0) return null;

    return new EmbedBuilder()
        .setTitle("Recent Messages from User")
        .setColor('#FFA500')
        .setDescription(
            messages.map(msg => 
                `**[${msg.createdAt.toLocaleString()}] in #${msg.channel.name}:**\n${msg.content || '*[no text content]*'}`
            ).join('\n\n')
        );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sus')
        .setDescription('Report a suspicious user (only works on users with base role)')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The suspicious user to report')
                .setRequired(true))
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Why is this user suspicious?')
                .setRequired(true))
        .setDefaultMemberPermissions(null), // No one can use it by default
    async execute(interaction) {
        if (interaction.channelId !== SCAM_CHANNEL_ID) {
            await interaction.reply({ 
                content: 'This command can only be used in the designated channel.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Check if the user has permission to use the command (same check as ban button)
        if (!isAboveBaseRole(interaction.member)) {
            await interaction.reply({ 
                content: "You don't have permission to use this command.",
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const targetUser = interaction.options.getUser('user');
        const targetMember = await interaction.guild.members.fetch(targetUser.id);
        const reporter = interaction.user;
        const reason = interaction.options.getString('reason');
        
         // Add this check after fetching the target member
         if (!canBeModerated(targetMember, interaction.member)) {
            await interaction.reply({ 
              content: 'This user cannot be reported due to role hierarchy or protected status.',
              flags: MessageFlags.Ephemeral
            });
            return;
          }

        // Check if target has only base role
        const hasOnlyBaseRole = targetMember.roles.cache.size === 2 && targetMember.roles.cache.has(BASE_ROLE_ID);

        if (!hasOnlyBaseRole) {
            await interaction.reply({ 
                content: 'This command can only be used on users with the base role.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        try {
            const reportChannel = await interaction.guild.channels.fetch(SCAM_CHANNEL_ID);
            if (!reportChannel) {
                await interaction.reply({ 
                    content: 'Error: Report channel not found.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Get recent messages before creating thread
            const recentMessages = await getRecentUserMessages(interaction.channel, targetUser.id);
            const recentMessagesEmbed = formatMessageEmbed(recentMessages);

            // Create a custom embed for manual reports
            const reportEmbed = new EmbedBuilder()
                .setTitle('👀 Manual Suspicious Activity Report')
                .setDescription(`Report submitted by ${reporter.tag}`)
                .addFields(
                    { name: 'Account Created', value: targetUser.createdAt.toDateString(), inline: true },
                    { name: 'Joined Server', value: targetMember.joinedAt.toDateString(), inline: true },
                    { name: 'Display Name', value: targetMember.displayName, inline: true },
                    { name: 'Username', value: targetUser.username, inline: true },
                    { name: 'User ID', value: targetUser.id, inline: true },
                    { name: 'Reported In', value: `<#${interaction.channel.id}>`, inline: true },
                    { name: 'Reason for Report', value: reason },
                    { name: 'Reporter', value: `${reporter.tag} (${reporter.id})` }
                )
                .setColor('#FFA500');

            let threadId = suspiciousUserThreads.get(targetUser.id);
            let thread;
            let isNewThread = false;

            if (threadId) {
                try {
                    thread = await reportChannel.threads.fetch(threadId);
                } catch (error) {
                    console.error(`Failed to fetch existing thread for user ${targetUser.id}:`, error);
                    thread = null;
                }
            }

            if (!thread) {
                const threadName = `Suspicious Activity - ${targetUser.tag}`;
                thread = await reportChannel.threads.create({
                    name: threadName,
                    autoArchiveDuration: 1440,
                    type: ChannelType.PublicThread,
                    reason: 'New suspicious activity detected'
                });
                suspiciousUserThreads.set(targetUser.id, thread.id);
                isNewThread = true;
            }

            const banButton = new ButtonBuilder()
                .setCustomId(`ban_${targetUser.id}`)
                .setLabel('Ban User')
                .setStyle(ButtonStyle.Danger);

            const actionRow = new ActionRowBuilder().addComponents(banButton);

            // Send the initial report
            await thread.send({
                content: `Manual report submitted for user ${targetUser.tag} (${targetUser.id})`,
                embeds: [reportEmbed],
                components: [actionRow]
            });

            // If there are recent messages, send them
            if (recentMessagesEmbed) {
                await thread.send({
                    content: "Recent messages from user:",
                    embeds: [recentMessagesEmbed]
                });
            }

            // If this is a new thread, send a suspicious gif
            if (isNewThread) {
                await thread.send({
                    content: "👀 Something seems sus here...",
                    files: [pickRandomGif()]
                });
            }

            // Confirm to the reporter
            await interaction.reply({ 
                content: 'Report submitted successfully. Moderators have been notified.',
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            console.error('Error in /sus command:', error);
            await interaction.reply({ 
                content: 'An error occurred while processing your report.',
                flags: MessageFlags.Ephemeral
            });
        }
    },
};