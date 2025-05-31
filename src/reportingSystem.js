// reportingSystem.js - Complete implementation with bio scanning and admin impersonation detection
const { EmbedBuilder, ChannelType, Collection, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const config = require('./config');
const { hasProtectedRole } = require('./utils');

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

// Suspicious patterns for usernames and bios
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

// Create a wrapper for the reporting system
function setupReportingSystem(client) {
  // Initialize report data - scoped within the function
  const reportData = {
    interceptCount: 0,
    lastReportTime: Date.now(),
    lastScanTime: null,
    scamTypes: {
      urlShorteners: 0,
      discordInvites: 0,
      encodedUrls: 0,
      otherScams: 0,
      adminImpersonators: 0
    },
    topScammers: new Map(),
    suspiciousUsers: new Map(),
    // Store reference to protected role members' display names
    protectedMemberNames: new Map(),

    // Cache tracking for optimization
    cachedMembers: new Collection(),
    lastFullScanTime: null,
    lastProtectedMembersUpdate: null,
    recentMemberJoins: [], // Track members that joined since last scan
    lastScanStats: {
      totalMembers: 0,
      scannedMembers: 0,
      suspiciousFound: 0,
      impersonatorsFound: 0,
      scanDuration: 0
    }
  };

  console.log(`Reporting system initialized at ${new Date(reportData.lastReportTime).toISOString()}`);
  
  // Reset report data function
  function resetReportData() {
    reportData.interceptCount = 0;
    reportData.scamTypes = {
      urlShorteners: 0,
      discordInvites: 0, 
      encodedUrls: 0,
      otherScams: 0,
      adminImpersonators: 0
    };
    reportData.topScammers.clear();
    console.log(`Report data reset at ${new Date().toISOString()}`);
  }

  // Export updateReportData function to the global scope
  global.updateReportData = function(type, userId, displayName) {
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
    
    console.log(`Report data updated: ${type} by user ${userId || 'unknown'} (${displayName || 'unknown'}), total count: ${reportData.interceptCount}`);
  };

// Improved fetchAllGuildMembers with intelligent caching
async function fetchAllGuildMembers(guild, options = {}) {
  const { 
    forceRefresh = false,    // Whether to bypass cache and force a new fetch
    membersAddedSinceLastScan = [] // Array of member IDs added since last scan
  } = options;
  
  // Use our cached members if we have them and not forcing refresh
  if (!forceRefresh && reportData.cachedMembers && reportData.cachedMembers.size > 0) {
    console.log(`Using cached members (${reportData.cachedMembers.size}) from previous scan`);
    
    // If we have new members, add them to our cache
    if (membersAddedSinceLastScan.length > 0) {
      console.log(`Adding ${membersAddedSinceLastScan.length} new members to the cache`);
      
      for (const memberId of membersAddedSinceLastScan) {
        try {
          // Only fetch if not already in cache
          if (!reportData.cachedMembers.has(memberId)) {
            const member = await guild.members.fetch(memberId);
            if (member) {
              reportData.cachedMembers.set(memberId, member);
            }
          }
        } catch (error) {
          console.error(`Error fetching new member ${memberId}:`, error.message);
        }
      }
    }
    
    return reportData.cachedMembers;
  }
  
  // Otherwise do a full fetch (for first run or forced refresh)
  console.log(`Performing full member fetch for guild ${guild.name} (${guild.id})`);
  
  // Container for all fetched members
  let allMembers = new Collection();
  let lastId = '0';
  let fetchMore = true;
  
  // Track performance
  const startTime = Date.now();
  
  // Fetch members in batches until we get them all
  while (fetchMore) {
    try {
      const options = { limit: 1000 };
      if (lastId !== '0') options.after = lastId;
      
      const fetchedMembers = await guild.members.list(options);
      
      if (fetchedMembers.size > 0) {
        fetchedMembers.forEach((member, id) => {
          allMembers.set(id, member);
        });
        
        // Update the last ID for pagination
        lastId = fetchedMembers.last().id;
        console.log(`Fetched ${fetchedMembers.size} members, total so far: ${allMembers.size}`);
        
        // If we get fewer than the limit, we've reached the end
        if (fetchedMembers.size < 1000) {
          fetchMore = false;
          console.log('Received fewer than 1000 members, pagination complete');
        }
      } else {
        // No more members to fetch
        fetchMore = false;
        console.log('No more members returned, pagination complete');
      }
    } catch (fetchError) {
      console.error(`Error fetching members batch: ${fetchError.message}`);
      
      // If we hit a rate limit, wait a moment and try again
      if (fetchError.httpStatus === 429) {
        const retryAfter = fetchError.headers?.get('retry-after') || 5;
        console.log(`Rate limited, retrying after ${retryAfter} seconds`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        // Continue the loop without setting fetchMore to false
      } else {
        // For other errors, stop fetching
        fetchMore = false;
        console.error('Stopping member pagination due to error');
      }
    }
  }
  
  const elapsedTime = (Date.now() - startTime) / 1000;
  console.log(`Completed fetching all members in ${elapsedTime.toFixed(2)}s. Total count: ${allMembers.size}`);
  
  // Save to our cache for future use
  reportData.cachedMembers = allMembers;
  reportData.lastFullScanTime = Date.now();
  
  return allMembers;
}

// Optimized updateProtectedMembersCache function
async function updateProtectedMembersCache(guild, forceRefresh = false) {
  try {
    // Check if we need to update the cache
    const needsRefresh = forceRefresh || 
                        !reportData.lastProtectedMembersUpdate ||
                        (Date.now() - reportData.lastProtectedMembersUpdate > 12 * 60 * 60 * 1000); // 12 hours
                        
    if (!needsRefresh && reportData.protectedMemberNames.size > 0) {
      console.log(`Using cached protected members (${reportData.protectedMemberNames.size})`);
      return;
    }
    
    console.log('Updating protected members cache...');
    
    // Clear the current cache
    reportData.protectedMemberNames.clear();
    
    // Get members with protected roles more efficiently
    for (const roleId of config.PROTECTED_ROLE_IDS) {
      const role = guild.roles.cache.get(roleId);
      if (!role) continue;
      
      try {
        // Fetch members specifically for this role - much more efficient
        const roleMembers = await guild.members.fetch({ role: roleId, limit: 100 });
        
        roleMembers.forEach(member => {
          if (!reportData.protectedMemberNames.has(member.id)) {
            reportData.protectedMemberNames.set(member.id, {
              displayName: member.displayName.toLowerCase(),
              username: member.user.username.toLowerCase(),
              globalName: member.user.globalName ? member.user.globalName.toLowerCase() : null,
              roleId: roleId,
              roleName: role.name
            });
          }
        });
        
        console.log(`Added ${roleMembers.size} members with role ${role.name}`);
      } catch (error) {
        console.error(`Error fetching members with role ${role.name}:`, error.message);
      }
    }
    
    // Update timestamp
    reportData.lastProtectedMembersUpdate = Date.now();
    
    console.log(`Updated protected members cache with ${reportData.protectedMemberNames.size} members`);
  } catch (error) {
    console.error('Error updating protected members cache:', error);
  }
}

  // Utility function: Calculate string similarity (Levenshtein distance based)
  function calculateStringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    // For very short strings, we need to be more careful with similarity
    if (str1.length < 4 || str2.length < 4) {
      return str1 === str2 ? 1.0 : 0.0;
    }

    // Calculate Levenshtein distance
    const track = Array(str2.length + 1).fill(null).map(() => 
      Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) {
      track[0][i] = i;
    }
    
    for (let j = 0; j <= str2.length; j++) {
      track[j][0] = j;
    }
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        track[j][i] = Math.min(
          track[j][i - 1] + 1, // deletion
          track[j - 1][i] + 1, // insertion
          track[j - 1][i - 1] + indicator // substitution
        );
      }
    }
    
    // Convert to similarity ratio (0 to 1)
    const maxLength = Math.max(str1.length, str2.length);
    const distance = track[str2.length][str1.length];
    
    return 1 - (distance / maxLength);
  }

  // Check if a name is similar to a protected member
  function checkForImpersonation(memberToCheck) {

    // First check if the member being checked has a protected role
    // If they do, they cannot be an impersonator
    if (hasProtectedRole(memberToCheck)) {
      return null; // Not an impersonator if they have a protected role
    }
    // Nothing to check if we haven't cached protected members
    if (reportData.protectedMemberNames.size === 0) {
      return null;
    }
    
    // Get the names to check
    const displayName = memberToCheck.displayName.toLowerCase();
    const username = memberToCheck.user.username.toLowerCase();
    const globalName = memberToCheck.user.globalName ? memberToCheck.user.globalName.toLowerCase() : null;
    
    // Check against all protected members
    for (const [protectedId, protectedData] of reportData.protectedMemberNames.entries()) {
      // Skip if this is actually the protected member
      if (memberToCheck.id === protectedId) {
        continue;
      }
      
      const similarityResults = [];
      
      // Check direct equality first
      if (displayName === protectedData.displayName || 
          username === protectedData.username ||
          (globalName && globalName === protectedData.globalName)) {
        return {
          impersonatedUserId: protectedId,
          impersonatedName: protectedData.displayName,
          impersonatedRole: protectedData.roleName,
          similarityType: 'exact match',
          similarityScore: 1.0
        };
      }
      
      // Check for high similarity
      // Display name similarity
      const displayNameSimilarity = calculateStringSimilarity(displayName, protectedData.displayName);
      if (displayNameSimilarity > 0.9) {
        similarityResults.push({
          score: displayNameSimilarity,
          type: 'display name',
          impersonatedName: protectedData.displayName
        });
      }
      
      // Username similarity
      const usernameSimilarity = calculateStringSimilarity(username, protectedData.username);
      if (usernameSimilarity > 0.9) {
        similarityResults.push({
          score: usernameSimilarity,
          type: 'username',
          impersonatedName: protectedData.username
        });
      }
      
      // Global name similarity
      if (globalName && protectedData.globalName) {
        const globalNameSimilarity = calculateStringSimilarity(globalName, protectedData.globalName);
        if (globalNameSimilarity > 0.9) {
          similarityResults.push({
            score: globalNameSimilarity,
            type: 'global name',
            impersonatedName: protectedData.globalName
          });
        }
      }
      
      // If we found any high similarity
      if (similarityResults.length > 0) {
        // Take the highest similarity result
        const bestMatch = similarityResults.reduce((highest, current) => 
          current.score > highest.score ? current : highest, similarityResults[0]);
          
        return {
          impersonatedUserId: protectedId,
          impersonatedName: bestMatch.impersonatedName,
          impersonatedRole: protectedData.roleName,
          similarityType: bestMatch.type,
          similarityScore: bestMatch.score
        };
      }
    }
    
    // No impersonation found
    return null;
  }

  // Calculate suspiciousness score with focus on bio links
  function calculateSuspiciousnessScore(member) {
    let score = 0;
    const username = member.user.username.toLowerCase();
    const globalName = member.user.globalName?.toLowerCase() || '';
    const aboutMe = member.user.bio?.toLowerCase() || '';
    
    // Check bio for suspicious patterns
    if (aboutMe) {
      // Extract all URLs from bio
      const urls = aboutMe.match(/https?:\/\/\S+/g) || [];
      const plainDomains = aboutMe.match(/(?<![.@\w])((?:\w+\.)+(?:com|net|org|io|gg|xyz|app|finance|edu|gov))\b/gi) || [];
      
      // Check for suspicious patterns in bio
      SUSPICIOUS_PATTERNS.bio.forEach(pattern => {
        if (pattern.test(aboutMe)) {
          score += 1.5;
        }
      });
      
      // Analyze each URL for higher risk factors
      if (urls.length > 0) {
        score += 0.5 * urls.length; // Base score for having URLs
        
        urls.forEach(url => {
          // Check for known scam patterns
          KNOWN_SCAM_PATTERNS.forEach(pattern => {
            if (pattern.test(url)) {
              score += 2;
            }
          });
          
          // Check for URL shorteners
          if (/bit\.ly|tinyurl\.com|goo\.gl|t\.co|is\.gd|buff\.ly|ow\.ly|tr\.im|dub\.sh|cutt\.ly/i.test(url)) {
            score += 3;
          }
        });
      }
      
      // Check for plain domain references
      plainDomains.forEach(domain => {
        if (KNOWN_SCAM_PATTERNS.some(pattern => pattern.test(domain.toLowerCase()))) {
          score += 1;
        }
      });
    }
    
    // Check username for suspicious patterns
    SUSPICIOUS_PATTERNS.username.forEach(pattern => {
      if (pattern.test(username) || pattern.test(globalName)) {
        score += 1;
      }
    });
    
    // Account age is a factor
    const accountAge = Date.now() - member.user.createdAt.getTime();
    const accountAgeDays = accountAge / (1000 * 60 * 60 * 24);
    
    if (accountAgeDays < 7) {
      score += 1.5;
    } else if (accountAgeDays < 30) {
      score += 0.5;
    }
    
    // No avatar is suspicious
    if (member.user.avatar === null) {
      score += 0.5;
    }
    
    return score;
  }

  // Get detailed suspicious flags
  function getSuspiciousFlags(member) {
    const flags = [];
    const username = member.user.username.toLowerCase();
    const globalName = member.user.globalName?.toLowerCase() || '';
    const aboutMe = member.user.bio?.toLowerCase() || '';
    
    // Account age
    const accountAge = Date.now() - member.user.createdAt.getTime();
    const accountAgeDays = accountAge / (1000 * 60 * 60 * 24);
    
    if (accountAgeDays < 7) {
      flags.push(`🔍 NEW ACCOUNT (${accountAgeDays.toFixed(1)} days old)`);
    }
    
    // No avatar
    if (member.user.avatar === null) {
      flags.push('🔍 No profile picture');
    }
    
    // Check bio for suspicious patterns
    if (aboutMe) {
      // Extract all URLs from bio
      const urls = aboutMe.match(/https?:\/\/\S+/g) || [];
      
      if (urls.length > 0) {
        flags.push(`🔗 Bio contains ${urls.length} URL${urls.length > 1 ? 's' : ''}`);
        
        urls.forEach((url, index) => {
          // Check for URL shorteners
          if (/bit\.ly|tinyurl\.com|goo\.gl|t\.co|is\.gd|buff\.ly|ow\.ly|tr\.im|dub\.sh|cutt\.ly/i.test(url)) {
            flags.push(`⚠️ URL shortener detected in bio: ${url.substring(0, 30)}${url.length > 30 ? '...' : ''}`);
          }
          
          // Check for known scam patterns
          KNOWN_SCAM_PATTERNS.forEach(pattern => {
            if (pattern.test(url)) {
              flags.push(`⚠️ Suspicious URL pattern in bio: ${url.substring(0, 30)}${url.length > 30 ? '...' : ''}`);
            }
          });
        });
      }
      
      // Check for specific suspicious patterns in bio
      SUSPICIOUS_PATTERNS.bio.forEach(pattern => {
        if (pattern.test(aboutMe)) {
          const match = aboutMe.match(pattern);
          if (match) {
            const excerpt = match[0].substring(0, 40) + (match[0].length > 40 ? '...' : '');
            flags.push(`⚠️ Suspicious bio text: "${excerpt}"`);
          }
        }
      });
    }
    
    // Check username for suspicious patterns
    SUSPICIOUS_PATTERNS.username.forEach(pattern => {
      if (pattern.test(username)) {
        flags.push(`⚠️ Suspicious username pattern: "${username}"`);
      }
      if (globalName && pattern.test(globalName)) {
        flags.push(`⚠️ Suspicious display name pattern: "${globalName}"`);
      }
    });
    
    return flags;
  }

// Send a report of suspicious members
async function sendSuspiciousMembersReport(guild, reportChannel, isStartupScan = false) {
  try {
    if (reportData.suspiciousUsers.size === 0) {
      return;
    }

    const reportTitle = isStartupScan 
      ? '🔍 Suspicious Members from Startup Scan'
      : '🔍 Recently Detected Suspicious Members';
    
    const mainEmbed = new EmbedBuilder()
      .setTitle(reportTitle)
      .setColor('#FF9900')
      .setDescription(`Detected ${reportData.suspiciousUsers.size} suspicious members.`)
      .setTimestamp();

    await reportChannel.send({ embeds: [mainEmbed] });

    // Sort suspicious users by score (highest first)
    const sortedUsers = Array.from(reportData.suspiciousUsers.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.suspiciousnessScore - a.suspiciousnessScore);
    
    // For non-startup scans, only show users detected in this scan
    const usersToShow = isStartupScan 
      ? sortedUsers 
      : sortedUsers.filter(user => user.detectedOnScan);

    // Track threads we create
    const suspiciousUserThreads = new Map();

    // Process all users (both impersonators and regular suspicious users)
    for (const user of usersToShow) {
      // Create a thread for this user
      const threadName = `Suspicious User - ${user.displayName} (${user.id})`;
      
      try {
        const thread = await reportChannel.threads.create({
          name: threadName,
          autoArchiveDuration: 1440, // 24 hours in minutes
          type: ChannelType.PublicThread,
          reason: 'Suspicious user detected'
        });
        
        // Store the thread ID
        suspiciousUserThreads.set(user.id, thread.id);
        
        // Create the appropriate embed based on whether this is an impersonator
        let userEmbed;
        
        if (user.impersonation) {
          // Impersonator embed
          userEmbed = new EmbedBuilder()
            .setTitle(`Impersonator: ${user.displayName}`)
            .setColor('#FF0000')
            .setDescription(`This user appears to be impersonating a staff member.`)
            .addFields(
              { 
                name: 'User Information', 
                value: `Username: ${user.username}\nDisplay Name: ${user.displayName}\nID: ${user.id}`, 
                inline: false 
              },
              { 
                name: 'Impersonating', 
                value: `<@${user.impersonation.impersonatedUserId}> (${user.impersonation.impersonatedRole})`, 
                inline: false 
              },
              { 
                name: 'Match Details', 
                value: `${Math.round(user.impersonation.similarityScore * 100)}% match on ${user.impersonation.similarityType}`, 
                inline: false 
              },
              {
                name: 'Account Age',
                value: `${Math.floor((Date.now() - user.accountCreated.getTime()) / (1000 * 60 * 60 * 24))} days`,
                inline: true
              },
              {
                name: 'Joined Server',
                value: `${Math.floor((Date.now() - user.joinDate.getTime()) / (1000 * 60 * 60 * 24))} days ago`,
                inline: true
              }
            )
            .setThumbnail(user.avatarURL)
            .setTimestamp();
        } else {
          // Regular suspicious user embed
          userEmbed = new EmbedBuilder()
            .setTitle(`Suspicious User: ${user.displayName}`)
            .setColor('#FF9900')
            .setDescription(`Suspicion Score: ${user.suspiciousnessScore.toFixed(1)}/10`)
            .addFields(
              { 
                name: 'User Information', 
                value: `Username: ${user.username}\nDisplay Name: ${user.displayName}\nID: ${user.id}`, 
                inline: false 
              },
              {
                name: 'Account Age',
                value: `${Math.floor((Date.now() - user.accountCreated.getTime()) / (1000 * 60 * 60 * 24))} days`,
                inline: true
              },
              {
                name: 'Joined Server',
                value: `${Math.floor((Date.now() - user.joinDate.getTime()) / (1000 * 60 * 60 * 24))} days ago`,
                inline: true
              }
            )
            .setThumbnail(user.avatarURL);
        }
        
        // Add suspicious flags if any
        if (user.suspiciousFlags && user.suspiciousFlags.length > 0) {
          userEmbed.addFields({
            name: 'Suspicious Flags',
            value: user.suspiciousFlags.join('\n'),
            inline: false
          });
        }

        // Add message info if they've spoken
        if (user.hasSpoken && user.firstMessage) {
          userEmbed.addFields({
            name: 'First Message',
            value: `Channel: #${user.firstMessage.channelName}\nTime: ${user.firstMessage.timestamp}\nContent: "${user.firstMessage.content}"`,
            inline: false
          });
        }

        // Create ban button
        const banButton = new ButtonBuilder()
          .setCustomId(`ban_${user.id}_true`)
          .setLabel('Ban User')
          .setStyle(ButtonStyle.Danger);

        const actionRow = new ActionRowBuilder().addComponents(banButton);

        // Send the embed in the thread
        await thread.send({
          embeds: [userEmbed],
          components: [actionRow]
        });
        
      } catch (error) {
        console.error(`Error creating thread for user ${user.id}:`, error);
        // Fall back to sending in the main channel if thread creation fails
        await reportChannel.send({
          content: `Failed to create thread for suspicious user ${user.displayName} (${user.id})`,
          embeds: [userEmbed],
          components: [actionRow]
        });
      }
    }
    
    // Store the threads map for later reference
    reportData.suspiciousUserThreads = suspiciousUserThreads;
    
  } catch (error) {
    console.error('Error sending suspicious members report:', error);
  }
}

  // Send detailed report
  async function sendDetailedReport(guild) {
    try {
      const reportChannel = await guild.channels.fetch(config.SCAM_CHANNEL_ID);
      if (!reportChannel) {
        console.error(`Report channel with ID ${config.SCAM_CHANNEL_ID} not found`);
        return;
      }

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
              .setDescription('No scam attempts intercepted in the last 6 hours! 🎉')
              .setFooter({ text: 'Garden Security Bot - 6-hour interval report' })
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
            name: 'Admin Impersonators', 
            value: reportData.scamTypes.adminImpersonators.toString(), 
            inline: true 
          },
          { 
            name: 'Other Scams', 
            value: reportData.scamTypes.otherScams.toString(), 
            inline: true 
          }
        )
        .setFooter({ text: 'Garden Security Bot - 6-hour interval report' })
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

  // Initial startup scan
  async function performStartupScan(guild) {
    try {
      console.log(`Starting initial security scan at ${new Date().toISOString()}`);
      
      // First update the protected members cache
      await updateProtectedMembersCache(guild);
      
      const reportChannel = await guild.channels.fetch(config.SCAM_CHANNEL_ID);
      if (!reportChannel) {
        console.error(`Report channel with ID ${config.SCAM_CHANNEL_ID} not found`);
        return;
      }

      // Get members who joined in the last 2 days
      let scannedCount = 0;
      let suspiciousCount = 0;
      let impersonatorCount = 0;

      // Fetch ALL members using our pagination function
      const allMembers = await fetchAllGuildMembers(guild);
      const recentMembers = allMembers;
      console.log(`Initial scan: examining all ${recentMembers.size} members...`);

      console.log(`Scanning ${recentMembers.size} members who joined in the last 2 days...`);

      // Process each recent member
      for (const [memberId, member] of recentMembers) {
        if (member.user.bot) continue;

        scannedCount++;
        
        // First check for impersonation
        const impersonationResult = checkForImpersonation(member);
        
        // Calculate suspiciousness score
        const suspiciousnessScore = calculateSuspiciousnessScore(member);
        
        // Adjust score if impersonation was detected
        const finalScore = impersonationResult ? 
          Math.max(suspiciousnessScore, 5.0) : // Ensure minimum score of 5.0 for impersonators
          suspiciousnessScore;
        
        // Only flag users with score >= 5.0 or impersonators
        if (finalScore >= 5.0 || impersonationResult) {
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

          const suspiciousFlags = getSuspiciousFlags(member);
          
          // Add impersonation flag if detected
          if (impersonationResult) {
            const similarityPercentage = Math.round(impersonationResult.similarityScore * 100);
            suspiciousFlags.push(`⚠️ IMPERSONATING ${impersonationResult.impersonatedRole} (${similarityPercentage}% match on ${impersonationResult.similarityType})`);
            impersonatorCount++;
          }

          reportData.suspiciousUsers.set(memberId, {
            joinDate: member.joinedAt || new Date(),
            username: member.user.username,
            globalName: member.user.globalName || member.user.username,
            displayName: member.displayName,
            avatarURL: member.user.displayAvatarURL(),
            accountCreated: member.user.createdAt,
            suspiciousnessScore: finalScore,
            suspiciousFlags: suspiciousFlags,
            impersonation: impersonationResult,
            hasSpoken: hasSpoken,
            firstMessage: firstMessage,
            detectedOnStartup: true
          });
          
          suspiciousCount++;
        }
      }

      console.log(`Startup scan complete: ${scannedCount} members scanned, ${suspiciousCount} suspicious accounts found, ${impersonatorCount} impersonators`);

      // Send startup report
      const startupEmbed = new EmbedBuilder()
        .setTitle('🔍 Initial Security Scan Complete')
        .setColor('#0099FF')
        .setDescription(`**Scan Summary**\n• Members scanned: ${scannedCount}\n• Suspicious accounts detected: ${suspiciousCount}\n• Admin impersonators: ${impersonatorCount}\n• Lookback period: 2 days`)
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
  
  // Perform periodic scan of all members
  async function performPeriodicScan(guild) {
    try {
      const startTime = Date.now();
      console.log(`Starting periodic member scan at ${new Date().toISOString()}`);
      
      // Check if we need to do a full scan or incremental scan
      const timeSinceFullScan = reportData.lastFullScanTime ? (Date.now() - reportData.lastFullScanTime) : null;
      const shouldDoFullScan = !reportData.lastFullScanTime || 
                              timeSinceFullScan > 24 * 60 * 60 * 1000 || // 24 hours
                              reportData.cachedMembers.size === 0;
                              
      console.log(`${shouldDoFullScan ? 'Full' : 'Incremental'} scan initiated`);
      
      // First update the protected members cache
      await updateProtectedMembersCache(guild, shouldDoFullScan);
      
      // Variables to track scan progress
      let scannedCount = 0;
      let newSuspiciousCount = 0;
      let newImpersonatorCount = 0;
      
      let membersToScan;
      
      if (shouldDoFullScan) {
        // Full scan - fetch all members
        membersToScan = await fetchAllGuildMembers(guild, { forceRefresh: true });
        console.log(`Full scan: Examining all ${membersToScan.size} members`);
      } else {
        // Incremental scan - only check newly joined members and a small random sample
        membersToScan = new Collection();
        
        // First, add recently joined members
        if (reportData.recentMemberJoins.length > 0) {
          console.log(`Adding ${reportData.recentMemberJoins.length} recently joined members to scan`);
          
          // Get our cached members with new joins added
          const allMembers = await fetchAllGuildMembers(guild, { 
            membersAddedSinceLastScan: reportData.recentMemberJoins 
          });
          
          // Add recent joins to scan list
          for (const memberId of reportData.recentMemberJoins) {
            const member = allMembers.get(memberId);
            if (member) {
              membersToScan.set(memberId, member);
            }
          }
        }
        
        // Then, add a random sample of existing members (5% or at least 20)
        const allMembers = reportData.cachedMembers;
        const sampleSize = Math.max(20, Math.floor(allMembers.size * 0.05));
        
        const memberIds = Array.from(allMembers.keys());
        
        // Fisher-Yates shuffle to select random members
        for (let i = memberIds.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [memberIds[i], memberIds[j]] = [memberIds[j], memberIds[i]];
        }
        
        // Take the first sampleSize members
        const sampleIds = memberIds.slice(0, sampleSize);
        
        console.log(`Adding random sample of ${sampleIds.length} existing members to scan`);
        
        // Add sampled members to scan list
        for (const memberId of sampleIds) {
          // Skip if already added from recent joins
          if (!membersToScan.has(memberId)) {
            const member = allMembers.get(memberId);
            if (member) {
              membersToScan.set(memberId, member);
            }
          }
        }
        
        console.log(`Incremental scan: Examining ${membersToScan.size} members (${reportData.recentMemberJoins.length} new, ${sampleIds.length} random sample)`);
      }
      
      // Now do the actual scanning
      console.log(`Scanning ${membersToScan.size} members for suspicious patterns and impersonation...`);

      // Process each member
      for (const [memberId, member] of membersToScan) {
        // Skip bots
        if (member.user.bot) continue;
        
        // Skip members who are already known to be suspicious
        if (reportData.suspiciousUsers.has(memberId)) continue;
        
        scannedCount++;
        
        // First check for impersonation
        const impersonationResult = checkForImpersonation(member);
        
        // Calculate suspiciousness score
        const suspiciousnessScore = calculateSuspiciousnessScore(member);
        
        // Adjust score if impersonation was detected
        const finalScore = impersonationResult ? 
          Math.max(suspiciousnessScore, 5.0) : // Ensure minimum score of 5.0 for impersonators
          suspiciousnessScore;
        
        // Track members with high suspicion score
        if (finalScore >= 5.0 || impersonationResult) {
          const suspiciousFlags = getSuspiciousFlags(member);
          
          // Add impersonation flag if detected
          if (impersonationResult) {
            const similarityPercentage = Math.round(impersonationResult.similarityScore * 100);
            suspiciousFlags.push(`⚠️ IMPERSONATING ${impersonationResult.impersonatedRole} (${similarityPercentage}% match on ${impersonationResult.similarityType})`);
            newImpersonatorCount++;
            
            // Update stats
            reportData.scamTypes.adminImpersonators++;
          }
          
          // Check if they've spoken recently - use a more efficient approach
          let hasSpoken = false;
          let firstMessage = null;
          
          try {
            // Limit to 10 most active channels for efficiency
            const textChannels = guild.channels.cache
              .filter(ch => ch.type === ChannelType.GuildText)
              .sort((a, b) => b.lastMessageId - a.lastMessageId)
              .first(10);
            
            // Use a Promise.all to check channels in parallel
            const messageChecks = textChannels.map(async channel => {
              try {
                const messages = await channel.messages.fetch({ limit: 20 });
                const userMessage = messages.find(m => m.author.id === memberId);
                
                if (userMessage) {
                  return {
                    found: true,
                    message: {
                      content: userMessage.content.substring(0, 100),
                      timestamp: userMessage.createdAt,
                      channelName: channel.name
                    }
                  };
                }
                return { found: false };
              } catch (channelError) {
                return { found: false };
              }
            });
            
            // Wait for all channel checks to complete
            const results = await Promise.all(messageChecks);
            const firstResult = results.find(r => r.found);
            
            if (firstResult) {
              hasSpoken = true;
              firstMessage = firstResult.message;
            }
          } catch (messageError) {
            console.log(`Couldn't fetch messages for member ${memberId}: ${messageError.message}`);
          }
          
          reportData.suspiciousUsers.set(memberId, {
            joinDate: member.joinedAt || new Date(),
            username: member.user.username,
            globalName: member.user.globalName || member.user.username,
            displayName: member.displayName,
            avatarURL: member.user.displayAvatarURL(),
            accountCreated: member.user.createdAt,
            suspiciousnessScore: finalScore,
            suspiciousFlags: suspiciousFlags,
            impersonation: impersonationResult,
            hasSpoken: hasSpoken,
            firstMessage: firstMessage,
            detectedOnScan: true
          });
          
          newSuspiciousCount++;
        }
      }
      
      // Update scan statistics
      const scanDuration = (Date.now() - startTime) / 1000;
      reportData.lastScanTime = Date.now();
      reportData.lastScanStats = {
        totalMembers: shouldDoFullScan ? membersToScan.size : reportData.cachedMembers.size,
        scannedMembers: scannedCount,
        suspiciousFound: newSuspiciousCount,
        impersonatorsFound: newImpersonatorCount,
        scanDuration: scanDuration
      };
      
      // Clear the recent joins after scanning them
      reportData.recentMemberJoins = [];
      
      console.log(`Periodic scan complete in ${scanDuration.toFixed(2)}s: ${scannedCount} members scanned, ${newSuspiciousCount} new suspicious accounts found, ${newImpersonatorCount} impersonators`);
      
      // Return the results
      return {
        scannedCount,
        newSuspiciousCount,
        newImpersonatorCount,
        scanDuration,
        scanType: shouldDoFullScan ? 'full' : 'incremental'
      };
    } catch (error) {
      console.error('Error during periodic scan:', error);
      return {
        scannedCount: 0,
        newSuspiciousCount: 0,
        newImpersonatorCount: 0,
        error: error.message
      };
    }
  }
  
  // Set up event handlers
  
  // Set up event listener for new members
  client.on('guildMemberAdd', async (member) => {
    // Skip bots
    if (member.user.bot) return;
    
    // First check for impersonation
    const impersonationResult = checkForImpersonation(member);
    
    // Calculate regular suspiciousness score
    const suspiciousnessScore = calculateSuspiciousnessScore(member);
    
    // Adjust score if impersonation was detected
    const finalScore = impersonationResult ? 
      Math.max(suspiciousnessScore, 5.0) : // Ensure minimum score of 5.0 for impersonators
      suspiciousnessScore;
    
    // Track members with sufficiently high score or impersonation
    if (finalScore >= 5.0 || impersonationResult) {
      const suspiciousFlags = getSuspiciousFlags(member);
      
      // Add impersonation flag if detected
      if (impersonationResult) {
        const similarityPercentage = Math.round(impersonationResult.similarityScore * 100);
        suspiciousFlags.push(`⚠️ IMPERSONATING ${impersonationResult.impersonatedRole} (${similarityPercentage}% match on ${impersonationResult.similarityType})`);
        
        // Update stats
        reportData.scamTypes.adminImpersonators++;
      }
      
      reportData.suspiciousUsers.set(member.id, {
        joinDate: new Date(),
        username: member.user.username,
        globalName: member.user.globalName || member.user.username,
        displayName: member.displayName,
        avatarURL: member.user.displayAvatarURL(),
        accountCreated: member.user.createdAt,
        suspiciousnessScore: finalScore,
        suspiciousFlags: suspiciousFlags,
        impersonation: impersonationResult,
        hasSpoken: false,
        firstMessage: null
      });

      reportData.recentMemberJoins.push(member.id);
  
      // For high-risk impersonators, alert immediately
      if (impersonationResult && impersonationResult.similarityScore > 0.85) {
        try {
          const reportChannel = await member.guild.channels.fetch(config.SCAM_CHANNEL_ID);
          
          if (reportChannel) {
            const impersonationEmbed = new EmbedBuilder()
              .setTitle('⚠️ IMPERSONATOR ALERT ⚠️')
              .setColor('#FF0000')
              .setDescription(`A new member has joined with a name very similar to a protected role member!`)
              .addFields(
                { 
                  name: 'Suspicious Member', 
                  value: `${member.displayName} (@${member.user.username}) <@${member.id}>`,
                  inline: false
                },
                {
                  name: 'Impersonating', 
                  value: `<@${impersonationResult.impersonatedUserId}> (${impersonationResult.impersonatedRole})`,
                  inline: false
                },
                {
                  name: 'Match Details', 
                  value: `${Math.round(impersonationResult.similarityScore * 100)}% similarity on ${impersonationResult.similarityType}`,
                  inline: false
                },
                {
                  name: 'Account Age', 
                  value: `${Math.floor((Date.now() - member.user.createdAt.getTime()) / (1000 * 60 * 60 * 24))} days`,
                  inline: true
                }
              )
              .setThumbnail(member.user.displayAvatarURL())
              .setTimestamp();
              
            await reportChannel.send({ embeds: [impersonationEmbed] });
          }
        } catch (alertError) {
          console.error('Error sending impersonation alert:', alertError);
        }
      }
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
  
  // Set up the periodic report and scan intervals
  const SIX_HOURS = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
  
  // Run the initial scan after bot is fully online
  setTimeout(async () => {
    const guild = client.guilds.cache.first();
    if (guild) {
      console.log(`Running initial startup scan for guild: ${guild.name}`);
      await performStartupScan(guild);
    } else {
      console.error('No guild found for initial scan');
    }
  }, 5000); // Wait 5 seconds after bot is ready
  
  // Set up interval for periodic reports
  const reportIntervalId = setInterval(async () => {
    try {
      const now = Date.now();
      // Only send a report if it's been approximately 6 hours since the last one
      if (now - reportData.lastReportTime >= SIX_HOURS) {
        console.log(`Time for a periodic report: ${new Date(now).toISOString()}`);
        
        const guild = client.guilds.cache.first();
        if (!guild) {
          console.error('No guild found for periodic report');
          return;
        }
        
        await sendDetailedReport(guild);
        
        // Reset the data and update last report time
        reportData.lastReportTime = now;
        resetReportData();
      } else {
        console.log(`Not time for report yet. Next report in ${((SIX_HOURS - (now - reportData.lastReportTime)) / 60000).toFixed(1)} minutes`);
      }
    } catch (error) {
      console.error('Error in report interval:', error);
    }
  }, 15 * 60 * 1000); // Check every 15 minutes
  
  // Set up interval for periodic member scans
  const scanIntervalId = setInterval(async () => {
    try {
      const now = Date.now();
      const guild = client.guilds.cache.first();
      
      if (!guild) {
        console.error('No guild found for periodic scan');
        return;
      }
      
      // Only run a scan if it's been approximately 6 hours since the last one
      // or if it's the first scan
      if (!reportData.lastScanTime || now - reportData.lastScanTime >= SIX_HOURS) {
        console.log(`Time for a periodic member scan: ${new Date(now).toISOString()}`);
        
        const scanResults = await performPeriodicScan(guild);
        
        // If we found suspicious members, send a report
        if (scanResults.newSuspiciousCount > 0 || scanResults.newImpersonatorCount > 0) {
          const reportChannel = await guild.channels.fetch(config.SCAM_CHANNEL_ID);
          if (reportChannel) {
            const scanReportEmbed = new EmbedBuilder()
              .setTitle('🔍 Periodic Member Scan Results')
              .setColor('#0099FF')
              .setDescription(`**Scan Summary**\n• Members scanned: ${scanResults.scannedCount}\n• New suspicious accounts: ${scanResults.newSuspiciousCount}\n• New impersonators: ${scanResults.newImpersonatorCount}`)
              .setFooter({ text: 'Garden Security Bot - 6-hour Scan' })
              .setTimestamp();
              
            await reportChannel.send({ embeds: [scanReportEmbed] });
            
            // Send detailed report of suspicious users
            await sendSuspiciousMembersReport(guild, reportChannel, false);
          }
        } else {
          console.log('No new suspicious members found in periodic scan');
        }
      } else {
        console.log(`Not time for scan yet. Next scan in ${((SIX_HOURS - (now - reportData.lastScanTime)) / 60000).toFixed(1)} minutes`);
      }
    } catch (error) {
      console.error('Error in scan interval:', error);
    }
  }, 20 * 60 * 1000); // Check every 20 minutes
  
  // Expose cleanup function
  client.cleanupReportingSystem = () => {
    if (reportIntervalId) clearInterval(reportIntervalId);
    if (scanIntervalId) clearInterval(scanIntervalId);
    console.log('Reporting system intervals cleared');
  };
  
  // Return the exported functions and objects
  return {
    updateReportData: global.updateReportData,
    suspiciousUsers: reportData.suspiciousUsers,
    protectedMemberNames: reportData.protectedMemberNames
  };
}

// Export the setup function
module.exports = {
  setupReportingSystem
};