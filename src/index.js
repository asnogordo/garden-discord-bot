//index.js - main file
require('dotenv').config();
const { Client, GatewayIntentBits, Collection, EmbedBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { checkTransfers } = require('./transactionMonitor');
const config = require('./config');
const { handleMessage, celebratoryGifs, apologyGifs, reviewCompleteGifs, setupReportingSystem  } = require('./messageHandlers');
const { setupImpersonationDetection } = require('./reportingSystem');
const { REST, Routes } = require('discord.js');
const { isAboveBaseRole, canBeModerated } = require('./utils');
const { addToWhitelist, isWhitelisted } = require('./whitelist');

fs.writeFileSync('bot.pid', process.pid.toString());

const botToken = config.BOT_TOKEN || process.env.BOT_TOKEN;
const commandClientId = config.DISCORD_CLIENT_ID || process.env.CLIENT_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
    ],
});

client.commands = new Collection();
client.suspectedScammers = new Map(); // Add this line to store suspectedScammers
const commandsPath = path.join(__dirname, 'commands');
const commandsDirExists = fs.existsSync(commandsPath);
const commandFiles = commandsDirExists
  ? fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'))
  : [];

if (!commandsDirExists) {
  console.warn(`Commands directory not found at ${commandsPath}. Continuing without slash commands.`);
}

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
  } else {
      console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

const rest = new REST({ version: '10' }).setToken(botToken || '');

async function safeInteractionReply(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    return interaction.followUp(payload);
  }
  return interaction.reply(payload);
}

(async () => {
  try {
    if (!botToken) {
      console.error('BOT_TOKEN is not set. Skipping slash command registration.');
      return;
    }

    if (!commandClientId) {
      console.error('DISCORD_CLIENT_ID (or CLIENT_ID) is not set. Skipping slash command registration.');
      return;
    }

    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationCommands(commandClientId),
      { body: client.commands.map(command => command.data.toJSON()) },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();

let monitorIntervalId = null;
let impersonationDetector = null;

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  // Log configuration
  console.log('\n========== TRANSACTION MONITOR CONFIG ==========');
  console.log(`Active Chains: ${config.ACTIVE_CHAINS.join(', ')}`);
  console.log(`Poll Interval: ${config.POLL_INTERVAL / 1000} seconds (${config.POLL_INTERVAL / 60000} minutes)`);
  console.log(`Large Swap Amount: ${config.LARGE_SWAP_AMOUNT.toLocaleString()} SEED`);
  console.log(`Large Stake Amount: ${config.LARGE_STAKE_AMOUNT.toLocaleString()} SEED`);
  console.log(`Alert Channel: ${config.CHANNEL_ID}`);
  console.log('================================================\n');
  
  // Run initial check immediately
  console.log('🚀 Running initial transaction check...');
  try {
    await checkTransfers(client);
  } catch (error) {
    console.error('Error during initial transaction check:', error);
  }
  
  // Start the monitoring interval for transactions
  console.log(`⏰ Setting up periodic checks every ${config.POLL_INTERVAL / 60000} minutes...`);
  monitorIntervalId = setInterval(() => checkTransfers(client), config.POLL_INTERVAL);
  
  // Initialize the daily reporting system
  console.log('📊 Setting up daily security reporting system...');
  setupReportingSystem(client);
  
  //const dryRun = true; // TOGGLE THIS FOR DRY RUN MODE
  //impersonationDetector = setupImpersonationDetection(client, { dryRun });  
  console.log('✅ Bot startup complete. Transaction monitoring is now active.');
});

client.on('messageCreate', handleMessage);

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) return;

  try {
      await command.execute(interaction);
  } catch (error) {
      console.error(error);
      await safeInteractionReply(interaction, {
        content: 'There was an error while executing this command!',
        flags: MessageFlags.Ephemeral
      });
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  // Handle dismiss buttons
  if (interaction.customId.startsWith('dismiss_')) {
    const { botResponseMessages } = require('./messageHandlers');
    const { isAboveBaseRole } = require('./utils');
    
    // Only allow users above base role to dismiss
    if (!isAboveBaseRole(interaction.member)) {
      await interaction.reply({ 
        content: "Only moderators can dismiss bot messages.", 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }
    
    try {
      await interaction.message.delete();
      botResponseMessages.delete(interaction.message.id);
      // No reply needed since message is deleted
    } catch (error) {
      console.error('Error dismissing message:', error);
      await safeInteractionReply(interaction, { 
        content: 'Failed to dismiss message', 
        flags: MessageFlags.Ephemeral 
      });
    }
    return;
  }
  
  // Handle archive thread buttons (from !newusers command)
  if (interaction.customId.startsWith('archive_thread_')) {
    const { isAboveBaseRole } = require('./utils');
    
    // Only allow users above base role to archive
    if (!isAboveBaseRole(interaction.member)) {
      await interaction.reply({ 
        content: "Only moderators can archive review threads.", 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }
    
    try {
      // Check if we're in a thread
      if (!interaction.channel.isThread()) {
        await interaction.reply({ 
          content: 'This button only works in threads.', 
          flags: MessageFlags.Ephemeral 
        });
        return;
      }
      
      // Random completion messages
      const completionMessages = [
        '✅ Review complete! Great work, detective! 🔍',
        '✅ All done! The garden is safer now! 🌱',
        '✅ Investigation wrapped up! Nice job! 👏',
        '✅ Review finished! Another job well done! 💪',
        '✅ Case closed! Thanks for keeping us safe! 🛡️'
      ];
      const randomMessage = completionMessages[Math.floor(Math.random() * completionMessages.length)];
      
      // Send completion GIF
      const randomGif = reviewCompleteGifs[Math.floor(Math.random() * reviewCompleteGifs.length)];
      
      await interaction.reply({ 
        content: randomMessage,
        files: [randomGif]
      });
      
      // Small delay to let the GIF load before archiving
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Archive the thread
      await interaction.channel.setArchived(true, `Review completed by ${interaction.user.tag}`);
    } catch (error) {
      console.error('Error archiving thread:', error);
      await safeInteractionReply(interaction, { 
        content: `Failed to archive thread: ${error.message}`, 
        flags: MessageFlags.Ephemeral 
      });
    }
    return;
  }
  
  if (interaction.customId.startsWith('ban_')) {
    const parts = interaction.customId.split('_');
    const userId = parts[1];
    const banType = parts[2];
    
    const guild = interaction.guild;
    const moderator = interaction.member;

    try {
        const targetMember = await guild.members.fetch(userId).catch(() => null);
        
        if (!isAboveBaseRole(moderator)) {
          await interaction.reply({ 
            content: "You don't have permission to use this command.", 
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        // If member exists, check if they can be moderated
        if (targetMember && !canBeModerated(targetMember, moderator)) {
          await interaction.reply({ 
            content: "This user cannot be banned due to role hierarchy or protected status.", 
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        if (isWhitelisted(userId)) {
          await interaction.reply({ 
            content: `⚠️ **Cannot ban whitelisted user!**\n\nUser ${targetMember ? targetMember.user.tag : 'Unknown User'} (${userId}) is on the whitelist and cannot be banned. Please remove them from the whitelist first if you believe this ban is necessary.`, 
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        // Proceed with ban...
        const banReason = banType === 'impersonator' 
          ? 'Banned for impersonating protected member' 
          : 'Banned due to suspicious activity';
          
        await guild.members.ban(userId, { 
          deleteMessageSeconds: 7 * 24 * 60 * 60,
          reason: banReason 
        });
          
        // Log the action
        const logEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('User Banned')
            .setDescription(`User ${targetMember ? targetMember.user.tag : 'Unknown User'} (${userId}) has been banned and their messages from the last 7 days have been deleted.`)
            .addFields(
                { name: 'Banned by', value: `${moderator.user.tag} (${moderator.id})` },
                { name: 'Ban Time', value: new Date().toUTCString() },
                { name: 'Reason', value: banReason }
            );
        
        await interaction.reply({ embeds: [logEmbed] });

        // Track this ban for the daily report leaderboard
        if (global.updateAdminBanCount) {
          global.updateAdminBanCount(
            moderator.id, 
            moderator.displayName || moderator.user.username,
            moderator.user.displayAvatarURL({ dynamic: true })
          );
        }

        // Send a random celebratory GIF
        const randomGif = celebratoryGifs[Math.floor(Math.random() * celebratoryGifs.length)];
        await interaction.followUp({ 
            content: `Nice Ban! ${banType === 'impersonator' ? 'Impersonator eliminated!' : 'Mission accomplished!'} 🎉`, 
            files: [randomGif] 
        });
        
        // Archive the thread if in a thread
        if (interaction.channel.isThread()) {
          await interaction.channel.setArchived(true, 'User has been banned');
        }
      } catch (error) {
        console.error('Failed to ban user:', error);
        
        if (error.code === 10007) {
          await safeInteractionReply(interaction, { 
            content: 'Cannot ban this user: they may have already left the server or been banned.', 
            flags: MessageFlags.Ephemeral
          });
        } else {
          await safeInteractionReply(interaction, { 
            content: `Failed to ban user: ${error.message}. Please check logs for more details.`, 
            flags: MessageFlags.Ephemeral
          });
        }
      }
  }
  
  if (interaction.customId.startsWith('whitelist_')) {
    const parts = interaction.customId.split('_');
    const userId = parts[1];
    const username = parts.slice(2).join('_');
    
    const moderator = interaction.member;

    try {
      // Check if moderator has permission
      if (!isAboveBaseRole(moderator)) {
        await interaction.reply({ 
          content: "You don't have permission to whitelist users.", 
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // Check if user is already whitelisted
      if (isWhitelisted(userId)) {
        await interaction.reply({ 
          content: `User ${username} is already whitelisted.`, 
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // Fetch user and member details BEFORE calling addToWhitelist
      let displayName = username;
      let userTag = username;
      let avatarURL = null;
      
      try {
        const user = await interaction.client.users.fetch(userId);
        userTag = user.tag;
        avatarURL = user.displayAvatarURL({ dynamic: true });
        
        try {
          const member = await interaction.guild.members.fetch(userId);
          displayName = member.displayName;
        } catch (e) {
          console.log(`Could not fetch member ${userId}: ${e.message}`);
        }
      } catch (e) {
        console.log(`Could not fetch user ${userId}: ${e.message}`);
      }

      // Add user to whitelist
      const result = addToWhitelist(
        userId, 
        username, 
        `${moderator.user.tag} (${moderator.id})`,
        'Whitelisted via Discord bot button',
        displayName
      );

      if (result.success) {
        // Create success embed
        const successEmbed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('User Whitelisted')
          .setDescription(`**${displayName}** has been added to the whitelist.`)
          .addFields(
            { name: 'Display Name', value: displayName, inline: true },
            { name: 'Username', value: userTag, inline: true },
            { name: 'User ID', value: userId, inline: true },
            { name: 'Whitelisted by', value: `${moderator.user.tag} (${moderator.id})`, inline: true },
            { name: 'Whitelist Time', value: new Date().toUTCString(), inline: true },
            { name: 'Reason', value: 'Manual whitelist via moderation panel', inline: false }
          );
        
        if (avatarURL) {
          successEmbed.setThumbnail(avatarURL);
        }
        
        await interaction.reply({ embeds: [successEmbed] });

        // Send a random apology GIF
        const randomApologyGif = apologyGifs[Math.floor(Math.random() * apologyGifs.length)];
        const apologyMessages = [
          "My bad! False alarm 😅",
          "You're all good! 👍",
          "Oops, our mistake! 🤖",
          "False positive - you're cool! ✨",
          "Sorry about that! All clear now 🌱",
          "Bot had a brain fart - you're legit! 🧠💨",
          "My bad, chief! 🫡",
          "You good, fam! ✌️",
          "False alarm - carry on! 🚨❌"
        ];
        
        const randomApologyMessage = apologyMessages[Math.floor(Math.random() * apologyMessages.length)];
        
        await interaction.followUp({ 
          content: randomApologyMessage,
          files: [randomApologyGif]
        });

        // Archive the thread if in a thread (after the gif)
        if (interaction.channel.isThread()) {
          // Small delay to let the gif load before archiving
          setTimeout(async () => {
            try {
              await interaction.channel.send('User has been whitelisted. This thread will be archived.');
              await interaction.channel.setArchived(true, 'User has been whitelisted');
            } catch (error) {
              console.error('Error archiving thread:', error);
            }
          }, 2000); // 2 second delay
        }
      } else {
        await interaction.reply({ 
          content: `Failed to whitelist user: ${result.message}`, 
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (error) {
      console.error('Failed to whitelist user:', error);
      await safeInteractionReply(interaction, { 
        content: `An error occurred while whitelisting the user: ${error.message}`, 
        flags: MessageFlags.Ephemeral
      });
    }
  }
});

// Add this before client.login
// Graceful shutdown handler
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
  console.log('Received shutdown signal, closing connections...');
  
  // Clear the monitoring interval
  if (monitorIntervalId) {
    clearInterval(monitorIntervalId);
  }
  
  // Clear the reporting interval
  if (client.reportInterval) {
    clearInterval(client.reportInterval);
  }
  
  // Clear any intervals from impersonation detector
  if (client.cleanupImpersonationDetector) {
    client.cleanupImpersonationDetector();
  }
  
  // Destroy the Discord client connection
  client.destroy();
  
  // Remove PID file
  try {
    fs.unlinkSync('bot.pid');
  } catch (err) {
    console.error('Error removing PID file:', err);
  }
  
  console.log('Shutdown complete');
  process.exit(0);
}

client.login(botToken).catch(err => {
  console.error('Failed to login:', err);
});
