//index.js - main file
require('dotenv').config();
const { Client, GatewayIntentBits, Collection, EmbedBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { checkTransfers } = require('./transactionMonitor');
const config = require('./config');
const { handleMessage, celebratoryGifs, apologyGifs  } = require('./messageHandlers');
const { setupImpersonationDetection } = require('./reportingSystem');
const { REST, Routes } = require('discord.js');
const { isAboveBaseRole, canBeModerated } = require('./utils');
const { addToWhitelist, isWhitelisted } = require('./whitelist');

fs.writeFileSync('bot.pid', process.pid.toString());

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
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
  } else {
      console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
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
  
  // Start the monitoring interval for transactions
  monitorIntervalId = setInterval(() => checkTransfers(client), config.POLL_INTERVAL);
  
  //const dryRun = true; // TOGGLE THIS FOR DRY RUN MODE
  //impersonationDetector = setupImpersonationDetection(client, { dryRun });  
  console.log('Bot startup complete.');// Impersonation scan will run in 5 seconds...');
});

client.on('messageCreate', handleMessage);

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) return;

  try {
      await command.execute(interaction);
  } catch (error) {
      console.error(error);
      await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

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
          await interaction.reply({ 
            content: 'Cannot ban this user: they may have already left the server or been banned.', 
            flags: MessageFlags.Ephemeral
          });
        } else {
          await interaction.reply({ 
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
      await interaction.reply({ 
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

client.login(process.env.BOT_TOKEN).catch(err => {
  console.error('Failed to login:', err);
});