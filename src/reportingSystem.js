// reportingSystem.js - Updated with focused bio link detection
const { EmbedBuilder, ChannelType, Collection } = require('discord.js');
const { containsUrlShortener, hasDeceptiveUrl, detectUrlObfuscation, ALLOWED_DOMAINS } = require('./messageHandlers');

// Known scam domains and patterns
const KNOWN_SCAM_PATTERNS = [
  // Known scam shorteners
  /snl\.ink/i,
  /soo\.gd/i,
  /qps\.ru/i,
  /t\.me/i,
  
  // Discord scam variations
  /disc[-]?ord[-]?app/i,
  /d[1i]scord/i,
  /disc[o0]rd/i,
  /dis[c0]ord/i,
  
  // Support/Admin impersonation
  /support[-_]?(?:desk|team|panel|ticket)/i,
  /admin[-_]?(?:desk|team|panel|ticket)/i,
  /moderator[-_]?(?:desk|team|panel)/i,
  
  // Financial/crypto scams
  /(?:airdrop|giveaway|claim)[-_]?(?:now|here|portal)/i,
  /crypto[-_]?(?:giveaway|support|recovery)/i,
  
  // Wallet/verification scams
  /free[-_]?(?:tokens|crypto|nft)/i,
  /verify[-_]?(?:wallet|account)/i,
  /connect[-_]?wallet/i,
  /metamask[-_]?(?:verify|support)/i,
  
  // Generic suspicious patterns
  /(?:earn|make)[-_]?money/i,
  /investment[-_]?(?:portal|platform)/i,
  /trading[-_]?signals/i
];

// Suspicious patterns for usernames and bios (focused version)
const SUSPICIOUS_PATTERNS = {
  username: [
    /announcement/i,
    /support[-_]?team/i,
    /admin[-_]?team/i,
    /nft[-_]?support/i,
    /crypto[-_]?support/i,
    /garden[-_]?support/i,
    /moderator[-_]?(\d{1,3})?$/i,
    /mod[-_]?(\d{1,3})?$/i,
    /helper[-_]?(\d{1,3})?$/i,
    /staff[-_]?(\d{1,3})?$/i,
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
    /telegram.*[:\s]@[\w_]+/i,
    /discord.*[:\s][\w.-]+/i,
    /discord\.gg\/[a-zA-Z0-9]+/i,
    /(?:airdrop|giveaway|claim).*(?:winner|eligible)/i,
    /(?:guaranteed|100%|profit|returns)/i,
    /(?:earn|make).*\$?\d+.*(?:daily|weekly|monthly)/i
  ]
};

// Updated reporting system
function setupReportingSystem(client) {
  // Store report data
  const reportData = {
    interceptCount: 0,
    lastReportTime: Date.now(),
    scamTypes: {
      urlShorteners: 0,
      discordInvites: 0,
      encodedUrls: 0,
      otherScams: 0
    },
    topScammers: new Map(),
    suspiciousUsers: new Map()
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

  // Track user joins with focused scoring
  client.on('guildMemberAdd', async (member) => {
    const suspiciousnessScore = calculateSuspiciousnessScore(member);
    
    // Only track users with score > 3.0 (require multiple red flags)
    if (suspiciousnessScore > 3.0) {
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
          content: message.content.substring(0, 100),
          timestamp: new Date(),
          channelName: message.channel.name
        };
      }
    }
  });

  // Calculate suspiciousness score with heavy focus on bio links
  function calculateSuspiciousnessScore(member) {
    let score = 0;
    const username = member.user.username.toLowerCase();
    const globalName = member.user.globalName?.toLowerCase() || '';
    const aboutMe = member.user.bio?.toLowerCase() || '';
    
    // PRIMARY FOCUS: Bio link analysis
    if (aboutMe) {
      // Extract all URLs from bio
      const urls = aboutMe.match(/https?:\/\/\S+/g) || [];
      const plainDomains = aboutMe.match(/(?<![.@\w])((?:\w+\.)+(?:com|net|org|io|gg|xyz|app|finance|edu|gov))\b/gi) || [];
      
      // Analyze each URL
      urls.forEach(url => {
        // Check for URL shorteners (highest risk)
        if (containsUrlShortener(url)) {
          score += 4;
          console.log(`Bio URL shortener detected: ${url}`);
        }
        
        // Check for known scam patterns
        KNOWN_SCAM_PATTERNS.forEach(pattern => {
          if (pattern.test(url)) {
            score += 3;
            console.log(`Bio scam pattern detected: ${url}`);
          }
        });
        
        // Check for deceptive URLs
        if (hasDeceptiveUrl(url)) {
          score += 3;
          console.log(`Bio deceptive URL detected: ${url}`);
        }
        
        // Check for URL obfuscation techniques
        const obfuscation = detectUrlObfuscation(url);
        if (obfuscation.isObfuscated) {
          score += 2;
          console.log(`Bio obfuscated URL detected: ${url}`);
        }
        
        // Check if URL is NOT in allowed domains
        const domain = url.match(/https?:\/\/([^\/\s]+)/i)?.[1]?.toLowerCase();
        if (domain) {
          const isAllowed = ALLOWED_DOMAINS.some(allowedDomain => 
            domain === allowedDomain || domain.endsWith('.' + allowedDomain)
          );
          if (!isAllowed) {
            score += 1;
          }
        }
      });
      
      // Analyze plain domain references (without http/https)
      plainDomains.forEach(domain => {
        if (!ALLOWED_DOMAINS.some(allowed => domain.toLowerCase().includes(allowed))) {
          score += 0.5;
        }
      });
      
      // Check for specific contact info patterns in bio
      const contactPatterns = [
        { pattern: /telegram.*[:\s]@[\w_]+/i, weight: 0.5 },
        { pattern: /whatsapp.*[+]?\d{1,3}[-.\s]?\d{4,}/i, weight: 0.5 },
        { pattern: /(?:dm|message|contact).*for.*(?:support|help)/i, weight: 0.5 },
        { pattern: /discord\.gg\/[a-zA-Z0-9]+/i, weight: 1.0 },
        { pattern: /discord.*[:\s][\w.-]+#\d{4}/i, weight: 0.5 }
      ];
      
      contactPatterns.forEach(({pattern, weight}) => {
        if (pattern.test(aboutMe)) {
          score += weight;
        }
      });
    }
    
    // SECONDARY: Username patterns (much less weight)
    const highRiskUsernamePatterns = [
      /admin[-_]?team/i,
      /support[-_]?team/i,
      /moderator[-_]?\d*$/i,
      /support/i,
      /admin/i
    ];
    
    highRiskUsernamePatterns.forEach(pattern => {
      if (pattern.test(username) || pattern.test(globalName)) {
        score += 0.3;
      }
    });
    
    // TERTIARY: Account characteristics (minimal weight)
    const accountAge = Date.now() - member.user.createdAt.getTime();
    const accountAgeDays = accountAge / (1000 * 60 * 60 * 24);
    
    if (accountAgeDays < 7) {
      score += 0.2;
    }
    
    if (member.user.avatar === null) {
      score += 0.1;
    }
    
    return score;
  }

  // Get detailed suspicious flags
  function getSuspiciousFlags(member) {
    const flags = [];
    const username = member.user.username.toLowerCase();
    const globalName = member.user.globalName?.toLowerCase() || '';
    const aboutMe = member.user.bio?.toLowerCase() || '';
    
    // Extract and detail all bio-related issues
    if (aboutMe) {
      const urls = aboutMe.match(/https?:\/\/\S+/g) || [];
      
      if (urls.length > 0) {
        urls.forEach((url, index) => {
          const urlFlags = [];
          
          if (containsUrlShortener(url)) {
            urlFlags.push("URL shortener");
          }
          
          KNOWN_SCAM_PATTERNS.forEach(pattern => {
            if (pattern.test(url)) {
              urlFlags.push("Matches scam pattern");
            }
          });
          
          if (hasDeceptiveUrl(url)) {
            urlFlags.push("Deceptive URL");
          }
          
          const obfuscation = detectUrlObfuscation(url);
          if (obfuscation.isObfuscated) {
            urlFlags.push("Obfuscated URL");
          }
          
          if (urlFlags.length > 0) {
            flags.push(`Bio URL #${index + 1}: ${urlFlags.join(", ")}`);
          } else {
            flags.push(`Bio URL #${index + 1}: External domain`);
          }
        });
      }
      
      // Check for suspicious contact info
      if (/telegram.*[:\s]@[\w_]+/i.test(aboutMe)) {
        flags.push("Bio contains Telegram contact");
      }
      if (/whatsapp.*[+]?\d{1,3}[-.\s]?\d{4,}/i.test(aboutMe)) {
        flags.push("Bio contains WhatsApp number");
      }
      if (/discord\.gg\/[a-zA-Z0-9]+/i.test(aboutMe)) {
        flags.push("Bio contains Discord invite");
      }
    }
    
    // Only include username flags if they're serious
    if (/admin[-_]?team|support[-_]?team/i.test(username) || /admin[-_]?team|support[-_]?team/i.test(globalName)) {
      flags.push("Username impersonates staff");
    }
    
    // Only include account age if it's very new
    const accountAge = Date.now() - member.user.createdAt.getTime();
    const accountAgeDays = accountAge / (1000 * 60 * 60 * 24);
    
    if (accountAgeDays < 3) {
      flags.push(`Very new account (${accountAgeDays.toFixed(1)} days old)`);
    }
    
    return flags;
  }

  // Initial startup scan - look back 2 days only
  async function performStartupScan(guild) {
    try {
      const config = require('./config');
      console.log(`Starting initial security scan at ${new Date().toISOString()}`);
      
      const reportChannel = await guild.channels.fetch(config.SCAM_CHANNEL_ID);
      if (!reportChannel) {
        console.error(`Report channel with ID ${config.SCAM_CHANNEL_ID} not found`);
        return;
      }

      // Get members who joined in the last 2 days
      let scannedCount = 0;
      let suspiciousCount = 0;
      const recentMembers = new Collection();
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      // Guild#members.list() is better for getting members by join date
      const memberList = await guild.members.list({
        limit: 1000,
        after: '0'
      });

      // Filter to only those who joined in the last 2 days
      memberList.forEach(member => {
        if (member.joinedAt && member.joinedAt > twoDaysAgo) {
          recentMembers.set(member.id, member);
        }
      });

      console.log(`Scanning ${recentMembers.size} members who joined in the last 2 days...`);

      // Process each recent member
      for (const [memberId, member] of recentMembers) {
        if (member.user.bot) continue;

        scannedCount++;
        
        const suspiciousnessScore = calculateSuspiciousnessScore(member);
        
        // Only flag users with score > 3.0
        if (suspiciousnessScore > 3.0) {
          // Check if they've spoken recently
          let hasSpoken = false;
          let firstMessage = null;
          
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
            detectedOnStartup: true
          });
          
          suspiciousCount++;
        }
      }

      console.log(`Startup scan complete: ${scannedCount} members scanned, ${suspiciousCount} suspicious accounts found`);

      // Send startup report
      const startupEmbed = new EmbedBuilder()
        .setTitle('🔍 Initial Security Scan Complete')
        .setColor('#0099FF')
        .setDescription(`**Scan Summary**\n• Members scanned: ${scannedCount}\n• Suspicious accounts detected: ${suspiciousCount}\n• Lookback period: 2 days`)
        .setFooter({ text: 'Garden Security Bot - Startup Scan' })
        .setTimestamp();

      await reportChannel.send({ embeds: [startupEmbed] });

      if (suspiciousCount > 0) {
        await sendSuspiciousMembersReport(guild, reportChannel, true);
      }

    } catch (error) {
      console.error('Error during startup scan:', error);
    }
  }

  // Send suspicious members report
  async function sendSuspiciousMembersReport(guild, reportChannel, isStartupScan = false) {
    try {
      const suspiciousNonActiveUsers = Array.from(reportData.suspiciousUsers.entries())
        .filter(([_, userData]) => !userData.hasSpoken)
        .filter(([_, userData]) => {
          const hoursSinceJoin = (Date.now() - userData.joinDate.getTime()) / (1000 * 60 * 60);
          return hoursSinceJoin <= (isStartupScan ? 48 : 24); // 48 hours for startup scan, 24 hours for regular
        })
        .sort((a, b) => b[1].suspiciousnessScore - a[1].suspiciousnessScore);

      if (suspiciousNonActiveUsers.length > 0) {
        const suspiciousEmbed = new EmbedBuilder()
          .setTitle(isStartupScan ? '🚨 Suspicious Silent Members - Startup Scan' : '🚨 Suspicious Silent Members Alert')
          .setColor('#FFA500')
          .setDescription(`Found ${suspiciousNonActiveUsers.length} suspicious members who ${isStartupScan ? 'joined recently' : 'joined in the last 24 hours'} but haven't spoken yet.`)
          .setFooter({ text: isStartupScan ? 'Detected during initial scan' : 'These members should be monitored closely' })
          .setTimestamp();

        suspiciousNonActiveUsers.slice(0, 10).forEach(([userId, userData]) => {
          const accountAge = Math.floor((Date.now() - userData.accountCreated.getTime()) / (1000 * 60 * 60 * 24));
          const joinedAgo = Math.floor((Date.now() - userData.joinDate.getTime()) / (1000 * 60 * 60 * 24));
          
          const fieldName = `${userData.globalName} (@${userData.username}) <@${userId}>`;
          const fieldValue = [
            `ID: ${userId}`,
            `Suspicion Score: ${userData.suspiciousnessScore.toFixed(1)}`,
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

  // Update stats function
  global.updateReportData = function(type, userId, displayName = null) {
    reportData.interceptCount++;
    
    if (type && reportData.scamTypes[type] !== undefined) {
      reportData.scamTypes[type]++;
    } else {
      reportData.scamTypes.otherScams++;
    }
    
    if (userId) {
      const currentData = reportData.topScammers.get(userId) || { count: 0, displayName: null };
      currentData.count += 1;
      
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

      const now = new Date();
      const formattedDate = now.toISOString().split('T')[0];
      const formattedTime = now.toTimeString().split(' ')[0];

      if (reportData.interceptCount === 0) {
        await reportChannel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle(`📊 Security Report for ${formattedDate} at ${formattedTime}`)
              .setColor('#00FF00')
              .setDescription(`No scam attempts intercepted in the last 6 hours! 🎉`)
              .setFooter({ text: 'Garden Security Bot - TEST MODE (6-hour interval)' })
              .setTimestamp()
          ]
        });
        
        console.log(`Sent empty report at ${formattedTime}`);
        return;
      }

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
        embed.addFields({ 
          name: 'Top Offenders', 
          value: 'No repeat offenders.' 
        });
      }

      await reportChannel.send({ embeds: [embed] });
      console.log(`Sent detailed security report at ${formattedTime}`);

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
  const REPORT_INTERVAL = 6 * 60 * 60 * 1000;
  
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
      
      if (now - reportData.lastReportTime >= REPORT_INTERVAL) {
        console.log("6 hours elapsed, sending report...");
        
        await sendDetailedReport(guild);
        
        reportData.lastReportTime = now;
        resetReportData();
      } else {
        console.log("Not time to send report yet");
      }
    } catch (error) {
      console.error('Error in report interval handler:', error);
    }
  }, 15 * 60 * 1000);
  
  client.reportInterval = intervalId;
  console.log('Security reporting system initialized - will send reports every 6 hours');

  // Start initial scan after 5 seconds
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

module.exports = { setupReportingSystem };