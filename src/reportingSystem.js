// reportingSystem.js
const { EmbedBuilder, ChannelType, Collection  } = require('discord.js');

// Suspicious patterns for usernames and bios
const SUSPICIOUS_PATTERNS = {
  username: [
    /announcement/i,
    /support[-_]?team/i,
    /admin[-_]?team/i,
    /nft[-_]?support/i,
    /crypto[-_]?support/i,
    /garden[-_]?support/i,
    /moderator[-_]?([0-9]{1,3})?$/i,
    /mod[-_]?([0-9]{1,3})?$/i,
    /helper[-_]?([0-9]{1,3})?$/i,
    /staff[-_]?([0-9]{1,3})?$/i,
    /📢/,
    /🛡️/,
    /💰/,
    /💎/,
    /🚀/,
    /airdrop/i,
    /giveway/i, // common misspelling
    /giveaway/i,
    /whitelist/i,
    /presale/i,
    /mint[-_]?now/i,
    /freemint/i,
    /claim/i,
    /winners?/i,
    /rewards?/i,
    /\d{1,2}[k|m]?\s*usd/i, // patterns like "50k USD"
    /earn\s*\$?\d+/i,
    /nft[\s-]*drop/i,
    /exclusive/i,
    /vip/i,
    /premium/i,
    /verified/i,
    /official/i,
    /eth|btc|crypto/i,
    /seed[-_]?token/i,
    /garden[-_]?finance/i,
    /web3/i,
    /defi/i,
    /NFTCommunity/i,
    /CryptoNews/i,
    /smartcontract/i,
    /blockchain/i,
    /metamask/i,
    /trustwallet/i,
    /ledger/i,
    /marketing[-_]?team/i,
    /partnership/i,
    /ambassador/i,
    /steward/i
  ],
  bio: [
    /(?:dm|message|contact).*for.*(?:support|help|assistance)/i,
    /(?:admin|moderator|support).*(?:here|available)/i,
    /(?:reach|contact).*(?:for|via).*telegram/i,
    /whatsapp.*[+]?\d{1,3}[-.\s]?\d{4,}/i,
    /(?:click|visit).*links?.*bio/i,
    /(?:buy|sell|trade).*crypto.*(?:dm|message)/i,
    /(?:investment|trading).*(?:tips|signals|advice)/i,
    /airdrop.*(?:winner|claim|eligible)/i,
    /(?:verified|official).*(?:account|representative)/i,
    /(?:job|work|hiring).*(?:remote|online)/i,
    /(?:earn|make).*\$?\d+.*(?:daily|weekly|monthly)/i,
    /(?:guaranteed|100%|profit|returns)/i,
    /(?:nft|web3|defi).*(?:project|opportunity)/i,
    /(?:pre[-]?sale|early[-]?access|exclusive)/i,
    /(?:stake|staking).*(?:apy|returns)/i,
    /telegram.*[:\s]@[\w_]+/i,
    /twitter.*[:\s]@[\w_]+/i,
    /discord.*[:\s][\w.-]+/i,
    /(?:click|visit).*link/i,
    /\b(?:scam|fraud|fake)\b/i // ironically, scammers sometimes mention these words
  ]
};

// Updated reporting system that runs every 6 hours
// Suspicious patterns for usernames and bios
const SUSPICIOUS_PATTERNS = {
  username: [
    /announcement/i,
    /support[-_]?team/i,
    /admin[-_]?team/i,
    /nft[-_]?support/i,
    /crypto[-_]?support/i,
    /garden[-_]?support/i,
    /moderator[-_]?([0-9]{1,3})?$/i,
    /mod[-_]?([0-9]{1,3})?$/i,
    /helper[-_]?([0-9]{1,3})?$/i,
    /staff[-_]?([0-9]{1,3})?$/i,
    /📢/,
    /🛡️/,
    /💰/,
    /💎/,
    /🚀/,
    /airdrop/i,
    /giveway/i, // common misspelling
    /giveaway/i,
    /whitelist/i,
    /presale/i,
    /mint[-_]?now/i,
    /freemint/i,
    /claim/i,
    /winners?/i,
    /rewards?/i,
    /\d{1,2}[k|m]?\s*usd/i, // patterns like "50k USD"
    /earn\s*\$?\d+/i,
    /nft[\s-]*drop/i,
    /exclusive/i,
    /vip/i,
    /premium/i,
    /verified/i,
    /official/i,
    /eth|btc|crypto/i,
    /seed[-_]?token/i,
    /garden[-_]?finance/i,
    /web3/i,
    /defi/i,
    /NFTCommunity/i,
    /CryptoNews/i,
    /smartcontract/i,
    /blockchain/i,
    /metamask/i,
    /trustwallet/i,
    /ledger/i,
    /marketing[-_]?team/i,
    /partnership/i,
    /ambassador/i,
    /steward/i
  ],
  bio: [
    /(?:dm|message|contact).*for.*(?:support|help|assistance)/i,
    /(?:admin|moderator|support).*(?:here|available)/i,
    /(?:reach|contact).*(?:for|via).*telegram/i,
    /whatsapp.*[+]?\d{1,3}[-.\s]?\d{4,}/i,
    /(?:click|visit).*links?.*bio/i,
    /(?:buy|sell|trade).*crypto.*(?:dm|message)/i,
    /(?:investment|trading).*(?:tips|signals|advice)/i,
    /airdrop.*(?:winner|claim|eligible)/i,
    /(?:verified|official).*(?:account|representative)/i,
    /(?:job|work|hiring).*(?:remote|online)/i,
    /(?:earn|make).*\$?\d+.*(?:daily|weekly|monthly)/i,
    /(?:guaranteed|100%|profit|returns)/i,
    /(?:nft|web3|defi).*(?:project|opportunity)/i,
    /(?:pre[-]?sale|early[-]?access|exclusive)/i,
    /(?:stake|staking).*(?:apy|returns)/i,
    /telegram.*[:\s]@[\w_]+/i,
    /twitter.*[:\s]@[\w_]+/i,
    /discord.*[:\s][\w.-]+/i,
    /(?:click|visit).*link/i,
    /\b(?:scam|fraud|fake)\b/i // ironically, scammers sometimes mention these words
  ]
};

// Updated reporting system that runs every 6 hours
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
    topScammers: new Map(),
    suspiciousUsers: new Map() // New: track suspicious users
    topScammers: new Map(),
    suspiciousUsers: new Map() // New: track suspicious users
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
    // Note: Don't clear suspiciousUsers to maintain monitoring across report cycles
    // Note: Don't clear suspiciousUsers to maintain monitoring across report cycles
    console.log(`Report data reset at ${new Date().toISOString()}`);
  }

  // Track user joins
  client.on('guildMemberAdd', async (member) => {
    const suspiciousnessScore = calculateSuspiciousnessScore(member);
    
    if (suspiciousnessScore > 0) {
      reportData.suspiciousUsers.set(member.id, {
        joinDate: new Date(),
        username: member.user.username,
        globalName: member.user.globalName || member.user.username,
        avatarURL: member.user.displayAvatarURL(),
        accountCreated: member.user.createdAt,
        suspiciousnessScore: suspiciousnessScore,
        suspiciousFlags: getSuspiciousFlags(member),
        hasSpoken: false,
        firstMessage: null
      });
    }
  });

  // Monitor messages to update suspicious user status
  client.on('messageCreate', (message) => {
    if (message.author.bot) return;
    
    const userId = message.author.id;
    if (reportData.suspiciousUsers.has(userId)) {
      const userData = reportData.suspiciousUsers.get(userId);
      if (!userData.hasSpoken) {
        userData.hasSpoken = true;
        userData.firstMessage = {
          content: message.content.substring(0, 100), // Store first 100 chars
          timestamp: new Date(),
          channelName: message.channel.name
        };
      }
    }
  });

  // Calculate suspiciousness score for a member
  function calculateSuspiciousnessScore(member) {
    let score = 0;
    const username = member.user.username.toLowerCase();
    const globalName = member.user.globalName?.toLowerCase() || '';
    const aboutMe = member.user.bio?.toLowerCase() || '';
    
    // Check username patterns
    SUSPICIOUS_PATTERNS.username.forEach(pattern => {
      if (pattern.test(username) || pattern.test(globalName)) {
        score += 1;
      }
    });
    
    // Check bio patterns (more serious, higher score)
    SUSPICIOUS_PATTERNS.bio.forEach(pattern => {
      if (pattern.test(aboutMe)) {
        score += 2;
      }
    });
    
    // Additional checks
    const accountAge = Date.now() - member.user.createdAt.getTime();
    const accountAgeDays = accountAge / (1000 * 60 * 60 * 24);
    
    // Very new accounts (less than 7 days old) are more suspicious
    if (accountAgeDays < 7) {
      score += 1;
    }
    
    // No profile picture is somewhat suspicious
    if (member.user.avatar === null) {
      score += 0.5;
    }
    
    return score;
  }

  // Get detailed suspicious flags for a member
  function getSuspiciousFlags(member) {
    const flags = [];
    const username = member.user.username.toLowerCase();
    const globalName = member.user.globalName?.toLowerCase() || '';
    const aboutMe = member.user.bio?.toLowerCase() || '';
    
    SUSPICIOUS_PATTERNS.username.forEach((pattern, index) => {
      if (pattern.test(username)) {
        flags.push(`Username match: ${pattern.source}`);
      } else if (pattern.test(globalName)) {
        flags.push(`Global name match: ${pattern.source}`);
      }
    });
    
    SUSPICIOUS_PATTERNS.bio.forEach((pattern, index) => {
      if (pattern.test(aboutMe)) {
        flags.push(`Bio match: ${pattern.source}`);
      }
    });
    
    const accountAge = Date.now() - member.user.createdAt.getTime();
    const accountAgeDays = accountAge / (1000 * 60 * 60 * 24);
    
    if (accountAgeDays < 7) {
      flags.push(`Very new account (${accountAgeDays.toFixed(1)} days old)`);
    }
    
    if (member.user.avatar === null) {
      flags.push('No profile picture');
    }
    
    return flags;
  }

  // Initial startup scan function
  async function performStartupScan(guild) {
    try {
      const config = require('./config');
      console.log(`Starting initial security scan at ${new Date().toISOString()}`);
      
      const reportChannel = await guild.channels.fetch(config.SCAM_CHANNEL_ID);
      if (!reportChannel) {
        console.error(`Report channel with ID ${config.SCAM_CHANNEL_ID} not found`);
        return;
      }

      // Get newest members only (who joined in the last 14 days)
      let scannedCount = 0;
      let suspiciousCount = 0;
      const recentMembers = new Collection();
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      // Guild#members.list() is better for getting members by join date
      const memberList = await guild.members.list({
        limit: 1000,
        after: '0' // start from beginning
      });

      // Filter to only those who joined in the last 14 days
      memberList.forEach(member => {
        if (member.joinedAt && member.joinedAt > fourteenDaysAgo) {
          recentMembers.set(member.id, member);
        }
      });

      console.log(`Scanning ${recentMembers.size} members who joined in the last 14 days...`);

      // Process each recent member
      for (const [memberId, member] of recentMembers) {
        // Skip bots
        if (member.user.bot) continue;

        scannedCount++;
        
        // Calculate suspiciousness
        const suspiciousnessScore = calculateSuspiciousnessScore(member);
        
        if (suspiciousnessScore > 0) {
          // Check if they've spoken recently
          let hasSpoken = false;
          let firstMessage = null;
          
          // Try to find their most recent message - simplified approach
          try {
            const channels = guild.channels.cache.filter(ch => ch.type === ChannelType.GuildText);
            for (const [_, channel] of channels) {
              try {
                const messages = await channel.messages.fetch({ limit: 100 });
                const userMessages = messages.filter(m => m.author.id === memberId);
                
                if (userMessages.size > 0) {
                  hasSpoken = true;
                  const oldestMessage = userMessages.last();
                  firstMessage = {
                    content: oldestMessage.content.substring(0, 100),
                    timestamp: oldestMessage.createdAt,
                    channelName: channel.name
                  };
                  break;
                }
              } catch (channelError) {
                // Skip channels we can't access
                continue;
              }
            }
          } catch (messageError) {
            console.log(`Couldn't fetch messages for member ${memberId}: ${messageError.message}`);
          }

          reportData.suspiciousUsers.set(memberId, {
            joinDate: member.joinedAt || new Date(),
            username: member.user.username,
            globalName: member.user.globalName || member.user.username,
            avatarURL: member.user.displayAvatarURL(),
            accountCreated: member.user.createdAt,
            suspiciousnessScore: suspiciousnessScore,
            suspiciousFlags: getSuspiciousFlags(member),
            hasSpoken: hasSpoken,
            firstMessage: firstMessage,
            detectedOnStartup: true // Flag to indicate this was found during startup scan
          });
          
          suspiciousCount++;
        }
      }

      console.log(`Startup scan complete: ${scannedCount} members scanned, ${suspiciousCount} suspicious accounts found`);

      // Send startup report
      const startupEmbed = new EmbedBuilder()
        .setTitle('🔍 Initial Security Scan Complete')
        .setColor('#0099FF') // Blue color for informational
        .setDescription(`**Scan Summary**\n• Members scanned: ${scannedCount}\n• Suspicious accounts detected: ${suspiciousCount}`)
        .setFooter({ text: 'Garden Security Bot - Startup Scan' })
        .setTimestamp();

      await reportChannel.send({ embeds: [startupEmbed] });

      // If there are suspicious members, send the detailed report
      if (suspiciousCount > 0) {
        await sendSuspiciousMembersReport(guild, reportChannel, true);
      }

    } catch (error) {
      console.error('Error during startup scan:', error);
    }
  }

  // Extract the suspicious members reporting logic into a separate function
  async function sendSuspiciousMembersReport(guild, reportChannel, isStartupScan = false) {
    try {
      const suspiciousNonActiveUsers = Array.from(reportData.suspiciousUsers.entries())
        .filter(([_, userData]) => !userData.hasSpoken)
        .filter(([_, userData]) => {
          const hoursSinceJoin = (Date.now() - userData.joinDate.getTime()) / (1000 * 60 * 60);
          return hoursSinceJoin <= (isStartupScan ? 720 : 24); // 30 days for startup scan, 24 hours for regular
        })
        .sort((a, b) => b[1].suspiciousnessScore - a[1].suspiciousnessScore);

      if (suspiciousNonActiveUsers.length > 0) {
        const suspiciousEmbed = new EmbedBuilder()
          .setTitle(isStartupScan ? '🚨 Suspicious Silent Members - Startup Scan' : '🚨 Suspicious Silent Members Alert')
          .setColor('#FFA500') // Orange color for warning
          .setDescription(`Found ${suspiciousNonActiveUsers.length} suspicious members who ${isStartupScan ? 'joined recently' : 'joined in the last 24 hours'} but haven't spoken yet.`)
          .setFooter({ text: isStartupScan ? 'Detected during initial scan' : 'These members should be monitored closely' })
          .setTimestamp();

        suspiciousNonActiveUsers.slice(0, 10).forEach(([userId, userData]) => {
          const accountAge = Math.floor((Date.now() - userData.accountCreated.getTime()) / (1000 * 60 * 60 * 24));
          const joinedAgo = Math.floor((Date.now() - userData.joinDate.getTime()) / (1000 * 60 * 60 * 24));
          
          const fieldName = `${userData.globalName} (@${userData.username})`;
          const fieldValue = [
            `ID: ${userId}`,
            `Suspicion Score: ${userData.suspiciousnessScore}`,
            `Account Age: ${accountAge} days`,
            `Joined: ${joinedAgo} days ago`,
            `Flags: ${userData.suspiciousFlags.join(', ')}`,
            userData.detectedOnStartup ? `⚡ Detected on startup` : ''
          ].filter(line => line).join('\n');

          suspiciousEmbed.addFields({ name: fieldName, value: fieldValue, inline: false });
        });

        if (suspiciousNonActiveUsers.length > 10) {
          suspiciousEmbed.addFields({
            name: '📋 Additional Suspicious Members',
            value: `${suspiciousNonActiveUsers.length - 10} more suspicious members not shown. Use the command to see the full list.`
          });
        }

        await reportChannel.send({ embeds: [suspiciousEmbed] });
      }
    } catch (error) {
      console.error('Error sending suspicious members report:', error);
    }
  }

  // Update stats function - expose this globally
  global.updateReportData = function(type, userId, displayName = null) {
    reportData.interceptCount++;
    
    // Update scam type counters
    if (type && reportData.scamTypes[type] !== undefined) {
      reportData.scamTypes[type]++;
    } else {
      reportData.scamTypes.otherScams++;
    }
    
    // Track user violations if userId is provided
    if (userId) {
      const currentData = reportData.topScammers.get(userId) || { count: 0, displayName: null };
      
      // Update count
      currentData.count += 1;
      
      // Update display name if provided
      if (displayName) {
        currentData.displayName = displayName;
      }
      
      reportData.topScammers.set(userId, currentData);
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
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 5)
          .map(([userId, data], index) => {
            const displayName = data.displayName || 'Unknown Name';
            const count = data.count;
            const violationText = count !== 1 ? 'violations' : 'violation';
            return `${index + 1}. ${displayName} (<@${userId}>): ${count} ${violationText}`;
          })
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

      // Send suspicious members report
      await sendSuspiciousMembersReport(guild, reportChannel, false);

      // Cleanup old suspicious user data (remove users who joined more than 7 days ago)
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      for (const [userId, userData] of reportData.suspiciousUsers) {
        if (userData.joinDate.getTime() < sevenDaysAgo) {
          reportData.suspiciousUsers.delete(userId);
        }
      }


      // Send suspicious members report
      await sendSuspiciousMembersReport(guild, reportChannel, false);

      // Cleanup old suspicious user data (remove users who joined more than 7 days ago)
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      for (const [userId, userData] of reportData.suspiciousUsers) {
        if (userData.joinDate.getTime() < sevenDaysAgo) {
          reportData.suspiciousUsers.delete(userId);
        }
      }

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

  console.log('Ready event triggered, about to set timeout');
  setTimeout(async () => {
    console.log('Timeout fired, about to scan');
    const guild = client.guilds.cache.first();
    if (guild) {
      console.log(`Found guild: ${guild.name}`);
      await performStartupScan(guild);
    } else {
      console.log('No guild found in timeout');
    }
  }, 5000);
  
  return global.updateReportData;
}

// Export for use in main bot file
module.exports = { setupReportingSystem };