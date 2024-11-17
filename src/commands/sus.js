const { SlashCommandBuilder, EmbedBuilder, ChannelType, InteractionContextType } = require('discord.js');
const { BASE_ROLE_ID, SCAM_CHANNEL_ID } = require('../config');
const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { suspiciousUserThreads } = require('../messageHandlers');
const { isAboveBaseRole } = require('../utils');

// List of suspicious/watching gifs
const suspiciousGifs = [
    'https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExNWhvbXg1ZGN0YzZkZ2Z3YzlwMXNmeHh2ZHdsMGJuMjBwb29vZXl5YSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/6nXoQ5XjVbJP8BTRrV/giphy.gif',
    'https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExYWZpbDlxdmtlZ3ViZWZ6dnlkYjN1ZmM5ZDV6czBtODdxazcyN2RjdiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/yk8tRCZHCV0qY/giphy.gif',
    'https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExNmJjajNtMDBxNDIydGU5cTFoeXhrZzNhcTFsYzVvOGpnZ3YzemF2byZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/qIbpnP6JF9j8s/giphy.gif',
    'https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExZnV1MTQzd2pub3lyYTZtbTlqOG0xM2F4ODFucTNubWZ2Y25oMmk5cCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/sCBGZzD1DssidYHGOe/giphy.gif',
    'https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExbXEyZ28yZWpuampzYjM3dnNheWw5aDBheHR5em56Mmp3Z3V1OG44MCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/zYEg3iFhP7Ily/giphy.gif'
];

const pickRandomGif = () => suspiciousGifs[Math.floor(Math.random() * suspiciousGifs.length)];

async function getRecentUserMessages(channel, userId, limit = 3) {
    // Fetch last 100 messages from the channel
    const messages = await channel.messages.fetch({ limit: 100 });
    
    // Filter for the user's messages and sort by timestamp
    const userMessages = messages
        .filter(msg => msg.author.id === userId)
        .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
        .first(limit);

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
        .setContexts([InteractionContextType.Guild])  // Only allow in guild/server context
        .setDefaultMemberPermissions('0'), // No one can use it by default
    async execute(interaction) {
        if (interaction.channelId !== SCAM_CHANNEL_ID) {
            await interaction.reply({ 
                content: 'This command can only be used in the designated channel.',
                ephemeral: true 
            });
            return;
        }

        // Check if the user has permission to use the command (same check as ban button)
        if (!isAboveBaseRole(interaction.member)) {
            await interaction.reply({ 
                content: "You don't have permission to use this command.",
                ephemeral: true 
            });
            return;
        }

        const targetUser = interaction.options.getUser('user');
        const targetMember = await interaction.guild.members.fetch(targetUser.id);
        const reporter = interaction.user;
        const reason = interaction.options.getString('reason');

        // Check if target has only base role
        const hasOnlyBaseRole = targetMember.roles.cache.size === 2 && targetMember.roles.cache.has(BASE_ROLE_ID);

        if (!hasOnlyBaseRole) {
            await interaction.reply({ 
                content: 'This command can only be used on users with the base role.',
                ephemeral: true 
            });
            return;
        }

        try {
            const reportChannel = await interaction.guild.channels.fetch(SCAM_CHANNEL_ID);
            if (!reportChannel) {
                await interaction.reply({ 
                    content: 'Error: Report channel not found.',
                    ephemeral: true 
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
                    content: `👀 Something seems sus here...\n${pickRandomGif()}`
                });
            }

            // Confirm to the reporter
            await interaction.reply({ 
                content: 'Report submitted successfully. Moderators have been notified.',
                ephemeral: true 
            });

        } catch (error) {
            console.error('Error in /sus command:', error);
            await interaction.reply({ 
                content: 'An error occurred while processing your report.',
                ephemeral: true 
            });
        }
    },
};