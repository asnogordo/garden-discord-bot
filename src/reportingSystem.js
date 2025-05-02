// reportingSystem.js
const { EmbedBuilder } = require('discord.js');

// Updated reporting system that runs every 4 hours
function setupReportingSystem(client) {
  // Store report data
  const reportData = {
    interceptCount: 0,
    lastReportTime: Date.now(), // Start from now
    scamTypes: {
      urlShorteners: 0,
      discordInvites: 0,
      encodedUrls: 0,
      otherScams: 0
    },
    topScammers: new Map()
  };

  console.log(`Reporting system initialized at ${new Date(reportData.lastReportTime).toISOString()}`);
  
  // Reset report data function
  function resetReportData() {
    reportData.interceptCount = 0;
    reportData.scamTypes = {
      urlShorteners: 0,
      discordInvites: 0, 
      encodedUrls: 0,
      otherScams: 0
    };
    reportData.topScammers.clear();
    console.log(`Report data reset at ${new Date().toISOString()}`);
  }

  // Update stats function - expose this globally
  global.updateReportData = function(type, userId) {
    reportData.interceptCount++;
    
    // Update scam type counters
    if (type && reportData.scamTypes[type] !== undefined) {
      reportData.scamTypes[type]++;
    } else {
      reportData.scamTypes.otherScams++;
    }
    
    // Track user violations if userId is provided
    if (userId) {
      const currentCount = reportData.topScammers.get(userId) || 0;
      reportData.topScammers.set(userId, currentCount + 1);
    }
    
    console.log(`Report data updated: ${type} by user ${userId || 'unknown'}, total count: ${reportData.interceptCount}`);
  };

  // Send detailed report function
  async function sendDetailedReport(guild) {
    try {
      const config = require('./config');
      
      const reportChannel = await guild.channels.fetch(config.SCAM_CHANNEL_ID);
      if (!reportChannel) {
        console.error(`Report channel with ID ${config.SCAM_CHANNEL_ID} not found`);
        return;
      }

      // Current date/time formatting
      const now = new Date();
      const formattedDate = now.toISOString().split('T')[0];
      const formattedTime = now.toTimeString().split(' ')[0];

      // Handle no interceptions case
      if (reportData.interceptCount === 0) {
        await reportChannel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle(`📊 Security Report for ${formattedDate} at ${formattedTime}`)
              .setColor('#00FF00')  // Green color for all-clear
              .setDescription(`No scam attempts intercepted in the last 6 hours! 🎉`)
              .setFooter({ text: 'Garden Security Bot - TEST MODE (6-hour interval)' })
              .setTimestamp()
          ]
        });
        
        console.log(`Sent empty report at ${formattedTime}`);
        return;
      }

      // Create a detailed embed report
      const embed = new EmbedBuilder()
        .setTitle(`📊 Security Report for ${formattedDate} at ${formattedTime}`)
        .setColor('#FF0000')
        .setDescription(`Total interceptions in the last 6 hours: **${reportData.interceptCount}**`)
        .addFields(
          { 
            name: 'URL Shorteners', 
            value: reportData.scamTypes.urlShorteners.toString(), 
            inline: true 
          },
          { 
            name: 'Discord Invites', 
            value: reportData.scamTypes.discordInvites.toString(), 
            inline: true 
          },
          { 
            name: 'Encoded URLs', 
            value: reportData.scamTypes.encodedUrls.toString(), 
            inline: true 
          },
          { 
            name: 'Other Scams', 
            value: reportData.scamTypes.otherScams.toString(), 
            inline: true 
          }
        )
        .setFooter({ text: 'Garden Security Bot - TEST MODE (6-hour interval)' })
        .setTimestamp();

      // Add top offenders if any exist
      if (reportData.topScammers.size > 0) {
        const topOffenders = Array.from(reportData.topScammers.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([userId, count], index) => `${index + 1}. <@${userId}>: ${count} violation${count !== 1 ? 's' : ''}`)
          .join('\n');

        if (topOffenders) {
          embed.addFields({ name: 'Top Offenders', value: topOffenders });
        }
      } else {
        // No repeat offenders
        embed.addFields({ 
          name: 'Top Offenders', 
          value: 'No repeat offenders.' 
        });
      }

      // Send the embed report
      await reportChannel.send({ embeds: [embed] });
      console.log(`Sent detailed security report at ${formattedTime}`);
    } catch (error) {
      console.error('Error sending report:', error);
    }
  }

  // Run reports every 6 hours
  const REPORT_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
  
  const intervalId = setInterval(async () => {
    try {
      const now = Date.now();
      const guild = client.guilds.cache.first();
      
      if (!guild) {
        console.error("No guild found");
        return;
      }
      
      console.log(`Running report check at: ${new Date(now).toISOString()}`);
      console.log(`Time since last report: ${(now - reportData.lastReportTime) / 60000} minutes`);
      
      // If it's been approximately 6 hours since the last report
      if (now - reportData.lastReportTime >= REPORT_INTERVAL) {
        console.log("6 hours elapsed, sending report...");
        
        await sendDetailedReport(guild);
        
        // Update last report time and reset data AFTER sending report
        reportData.lastReportTime = now;
        resetReportData();
      } else {
        console.log("Not time to send report yet");
      }
    } catch (error) {
      console.error('Error in report interval handler:', error);
    }
  }, 15 * 60 * 1000); // Check every 15 minutes
  
  client.reportInterval = intervalId;
  console.log('Security reporting system initialized - will send reports every 6 hours');
  
  return global.updateReportData;
}

// Export for use in main bot file
module.exports = { setupReportingSystem };