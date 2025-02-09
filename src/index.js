require('dotenv').config();
const { Client, GatewayIntentBits, Collection, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { checkTransfers } = require('./transactionMonitor');
const config = require('./config');
const { handleMessage,celebratoryGifs } = require('./messageHandlers');
const { REST, Routes } = require('discord.js');
const { isAboveBaseRole } = require('./utils');


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
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

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  setInterval(() => checkTransfers(client), config.POLL_INTERVAL);
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
      const [_, userId, deleteFlag] = interaction.customId.split('_');
      const guild = interaction.guild;
      const moderator = interaction.user;

      if (!isAboveBaseRole(interaction.member)) {
          await interaction.reply({ 
              content: "You don't have permission to use this command.", 
              ephemeral: true 
          });
          return;
      }

      try {
          // Ban the user and delete their messages from the last 7 days
          await guild.members.ban(userId, { 
              deleteMessageSeconds: 7 * 24 * 60 * 60,
              reason: 'Banned due to suspicious activity' 
          });
          
          // Log the action in the thread
          const logEmbed = new EmbedBuilder()
              .setColor('#FF0000')
              .setTitle('User Banned')
              .setDescription(`User <@${userId}> has been banned and their messages from the last 7 days have been deleted.`)
              .addFields(
                  { name: 'Banned by', value: `${moderator.tag} (${moderator.id})` },
                  { name: 'Ban Time', value: new Date().toUTCString() }
              );
          
          await interaction.reply({ embeds: [logEmbed] });

          // Send a random celebratory GIF
          const randomGif = celebratoryGifs[Math.floor(Math.random() * celebratoryGifs.length)];
          await interaction.followUp({ 
              content: `Nice Ban! Mission accomplished! 🎉`, 
              files: [randomGif] 
          });
          
          // Archive the thread
          await interaction.channel.setArchived(true, 'User has been banned');
      } catch (error) {
          console.error('Failed to ban user:', error);
          await interaction.reply({ 
              content: 'Failed to ban user. Please check logs.', 
              ephemeral: true 
          });
      }
  }
});

client.login(process.env.BOT_TOKEN).catch(err => {
  console.error('Failed to login:', err);
});