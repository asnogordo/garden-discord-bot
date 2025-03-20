const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const messageHandlers = require('../messageHandlers');
const { isAboveBaseRole } = require('../utils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('timeouts')
        .setDescription('Check users currently on timeout for posting unauthorized URLs')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.CreatePublicThreads),
    async execute(interaction) {
        // Check if the user has permission to use the command
        if (!isAboveBaseRole(interaction.member)) {
            await interaction.reply({ 
                content: "You don't have permission to use this command.",
                Ephemeral: MessageFlags.Ephemeral
            });
            return;
        }

        try {
            
            if (!messageHandlers.urlOffenders) {
                await interaction.reply({
                    content: "⚠️ URL offenders tracking system is not initialized yet.",
                    Ephemeral: MessageFlags.Ephemeral
                });
                return;
            }
            
            // Get current timestamp
            const now = Date.now();
            
            // Filter for users currently on timeout
            const timedOutUsers = Array.from(messageHandlers.urlOffenders.entries())
                .filter(([_, data]) => data.timeoutUntil > now)
                .map(([userId, data]) => ({
                    userId,
                    timeLeft: Math.ceil((data.timeoutUntil - now) / 60000), // minutes
                    timeoutDuration: Math.ceil(data.timeoutDuration / 60000), // minutes
                    offenseCount: data.count || 0
                }));

            if (timedOutUsers.length === 0) {
                await interaction.reply({
                    content: "🌱 There are currently no users on timeout for URL violations.",
                    Ephemeral: MessageFlags.Ephemeral
                });
                return;
            }

            // Create an embed to display the information
            const embed = new EmbedBuilder()
                .setTitle("🚫 Users on URL Timeout")
                .setColor('#FF6347')
                .setDescription("The following users are currently on timeout for unauthorized URL posting:")
                .setFooter({ text: `Total: ${timedOutUsers.length} user(s) on timeout` })
                .setTimestamp();

            // Fetch detailed user information and add to embed
            const userDetailsPromises = timedOutUsers.map(async (user) => {
                try {
                    const member = await interaction.guild.members.fetch(user.userId);
                    return {
                        ...user,
                        member,
                        displayName: member.displayName,
                        username: member.user.username,
                        joinedAt: member.joinedAt,
                        createdAt: member.user.createdAt,
                        found: true
                    };
                } catch (error) {
                    console.error(`Failed to fetch user ${user.userId}:`, error);
                    return {
                        ...user,
                        found: false
                    };
                }
            });

            const userDetails = await Promise.all(userDetailsPromises);

            // Add fields for each user
            userDetails.forEach(user => {
                if (user.found) {
                    embed.addFields({
                        name: `${user.displayName} (${user.username})`,
                        value: 
                            `👤 ID: \`${user.userId}\`\n` +
                            `⏱️ Time left: ${user.timeLeft} minutes\n` +
                            `🕒 Total timeout: ${user.timeoutDuration} minutes\n` +
                            `⚠️ Offense count: ${user.offenseCount}\n` +
                            `📆 Joined: ${user.joinedAt.toDateString()}\n` +
                            `🗓️ Account created: ${user.createdAt.toDateString()}`
                    });
                } else {
                    embed.addFields({
                        name: `Unknown User (${user.userId})`,
                        value: 
                            `⏱️ Time left: ${user.timeLeft} minutes\n` +
                            `🕒 Total timeout: ${user.timeoutDuration} minutes\n` +
                            `⚠️ Offense count: ${user.offenseCount}\n` +
                            `ℹ️ User may have left the server`
                    });
                }
            });

            // Send the reply with full information
            await interaction.reply({
                embeds: [embed],
                Ephemeral: MessageFlags.Ephemeral
            });

        } catch (error) {
            console.error('Error in /timeouts command:', error);
            await interaction.reply({ 
                content: `An error occurred: ${error.message}`,
                Ephemeral: MessageFlags.Ephemeral
            });
        }
    },
};