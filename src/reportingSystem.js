// impersonationDetector.js - Lean implementation focused on detecting display name impersonators
const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const config = require('./config');

function setupImpersonationDetection(client) {
  // Cache for protected members
  const protectedMembers = new Map();
  let lastCacheUpdate = 0;
  
  // Normalize string for comparison
  function normalizeString(str) {
    if (!str) return '';
    // Remove spaces, convert to lowercase, replace common substitutions
    return str.toLowerCase()
      .replace(/\s+/g, '') // Remove all spaces
      .replace(/[._-]/g, '') // Remove common separators
      .replace(/0/g, 'o') // Replace zero with o
      .replace(/1/g, 'i') // Replace 1 with i
      .replace(/3/g, 'e') // Replace 3 with e
      .replace(/4/g, 'a') // Replace 4 with a
      .replace(/5/g, 's') // Replace 5 with s
      .replace(/8/g, 'b') // Replace 8 with b
      .trim();
  }
  
  // Calculate similarity between two strings
  function calculateSimilarity(str1, str2) {
    const norm1 = normalizeString(str1);
    const norm2 = normalizeString(str2);
    
    // Exact match after normalization
    if (norm1 === norm2) return 1.0;
    
    // Check if one contains the other
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      const minLen = Math.min(norm1.length, norm2.length);
      const maxLen = Math.max(norm1.length, norm2.length);
      return minLen / maxLen;
    }
    
    // Simple character-based similarity
    let matches = 0;
    const len = Math.min(norm1.length, norm2.length);
    for (let i = 0; i < len; i++) {
      if (norm1[i] === norm2[i]) matches++;
    }
    
    return matches / Math.max(norm1.length, norm2.length);
  }
  
  // Update protected members cache
  async function updateProtectedMembersCache(guild) {
    try {
      console.log('Updating protected members cache...');
      protectedMembers.clear();
      
      if (!config.PROTECTED_ROLE_IDS || config.PROTECTED_ROLE_IDS.length === 0) {
        console.error('No protected role IDs configured!');
        return;
      }
      
      // Fetch all members if not cached
      await guild.members.fetch();
      
      // Get all members with protected roles
      for (const roleId of config.PROTECTED_ROLE_IDS) {
        const role = guild.roles.cache.get(roleId);
        if (!role) {
          console.warn(`Role ${roleId} not found`);
          continue;
        }
        
        role.members.forEach(member => {
          protectedMembers.set(member.id, {
            id: member.id,
            displayName: member.displayName,
            username: member.user.username,
            normalizedName: normalizeString(member.displayName),
            roleName: role.name
          });
          console.log(`Protected: ${member.displayName} (${role.name})`);
        });
      }
      
      lastCacheUpdate = Date.now();
      console.log(`Cache updated: ${protectedMembers.size} protected members`);
    } catch (error) {
      console.error('Error updating protected members cache:', error);
    }
  }
  
  // Check if a member is impersonating
  function checkForImpersonation(member) {
    // Skip if member has a protected role
    if (member.roles.cache.some(role => config.PROTECTED_ROLE_IDS.includes(role.id))) {
      return null;
    }
    
    const memberNormalized = normalizeString(member.displayName);
    let bestMatch = null;
    let highestSimilarity = 0;
    
    // Check against all protected members
    for (const [protectedId, protectedData] of protectedMembers) {
      // Skip self
      if (member.id === protectedId) continue;
      
      // Calculate display name similarity
      const similarity = calculateSimilarity(member.displayName, protectedData.displayName);
      
      // Track best match
      if (similarity > highestSimilarity) {
        highestSimilarity = similarity;
        bestMatch = {
          protectedMember: protectedData,
          similarity: similarity
        };
      }
    }
    
    // Flag as impersonator only if similarity is very high (95% threshold)
    const threshold = 0.95;
    
    if (bestMatch && highestSimilarity >= threshold) {
      return {
        impersonatedId: bestMatch.protectedMember.id,
        impersonatedName: bestMatch.protectedMember.displayName,
        impersonatedRole: bestMatch.protectedMember.roleName,
        similarity: highestSimilarity
      };
    }
    
    return null;
  }
  
  // Send alert for impersonator
  async function sendImpersonatorAlert(member, impersonationData, reportChannel) {
    try {
      // Create a thread for this impersonator
      const threadName = `Impersonator - ${member.displayName} (${member.id})`;
      
      const thread = await reportChannel.threads.create({
        name: threadName.substring(0, 100), // Discord limit
        autoArchiveDuration: 1440, // 24 hours
        type: 11, // ChannelType.PublicThread
        reason: 'Impersonator detected'
      });
      
      const embed = new EmbedBuilder()
        .setTitle('⚠️ IMPERSONATOR DETECTED ⚠️')
        .setColor('#FF0000')
        .setDescription(`User is impersonating a protected member!`)
        .addFields(
          { 
            name: 'Impersonator', 
            value: `**${member.displayName}**\n@${member.user.username}\n<@${member.id}>`,
            inline: true
          },
          {
            name: 'Impersonating', 
            value: `**${impersonationData.impersonatedName}**\n<@${impersonationData.impersonatedId}>\nRole: ${impersonationData.impersonatedRole}`,
            inline: true
          },
          {
            name: 'Match Details',
            value: `Similarity: ${Math.round(impersonationData.similarity * 100)}%`,
            inline: true
          },
          {
            name: 'Account Age',
            value: `${Math.floor((Date.now() - member.user.createdAt) / (1000 * 60 * 60 * 24))} days`,
            inline: true
          },
          {
            name: 'Joined Server',
            value: member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : 'Unknown',
            inline: true
          }
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();
      
      // Add ban button
      const banButton = new ButtonBuilder()
        .setCustomId(`ban_${member.id}_impersonator`)
        .setLabel('Ban Impersonator')
        .setStyle(ButtonStyle.Danger);
      
      const row = new ActionRowBuilder().addComponents(banButton);
      
      // Send in thread
      await thread.send({ 
        embeds: [embed], 
        components: [row] 
      });
      
      // Also notify in main channel
      await reportChannel.send({
        content: `⚠️ New impersonator detected: **${member.displayName}** impersonating **${impersonationData.impersonatedName}**\nSee thread: <#${thread.id}>`
      });
      
    } catch (error) {
      console.error('Error creating impersonator thread:', error);
      
      // Fallback to sending in main channel
      const embed = new EmbedBuilder()
        .setTitle('⚠️ IMPERSONATOR DETECTED ⚠️')
        .setColor('#FF0000')
        .setDescription(`User is impersonating a protected member!`)
        .addFields(
          { 
            name: 'Impersonator', 
            value: `**${member.displayName}**\n@${member.user.username}\n<@${member.id}>`,
            inline: true
          },
          {
            name: 'Impersonating', 
            value: `**${impersonationData.impersonatedName}**\n<@${impersonationData.impersonatedId}>\nRole: ${impersonationData.impersonatedRole}`,
            inline: true
          },
          {
            name: 'Match Details',
            value: `Similarity: ${Math.round(impersonationData.similarity * 100)}%${impersonationData.hasMatchingAvatar ? '\n🎭 Copied avatar!' : ''}`,
            inline: true
          },
          {
            name: 'Account Age',
            value: `${Math.floor((Date.now() - member.user.createdAt) / (1000 * 60 * 60 * 24))} days`,
            inline: true
          },
          {
            name: 'Joined Server',
            value: member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : 'Unknown',
            inline: true
          }
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();
      
      const banButton = new ButtonBuilder()
        .setCustomId(`ban_${member.id}_impersonator`)
        .setLabel('Ban Impersonator')
        .setStyle(ButtonStyle.Danger);
      
      const row = new ActionRowBuilder().addComponents(banButton);
      
      await reportChannel.send({ 
        embeds: [embed], 
        components: [row] 
      });
    }
  }
  
  // Scan all members for impersonators
  async function scanForImpersonators(guild) {
    console.log('Starting impersonation scan...');
    const reportChannel = guild.channels.cache.get(config.SCAM_CHANNEL_ID);
    
    if (!reportChannel) {
      console.error('Report channel not found');
      return;
    }
    
    // Update cache if needed (every 12 hours)
    if (Date.now() - lastCacheUpdate > 12 * 60 * 60 * 1000) {
      await updateProtectedMembersCache(guild);
    }
    
    if (protectedMembers.size === 0) {
      console.log('No protected members to check against');
      return;
    }
    
    let scannedCount = 0;
    let foundCount = 0;
    const impersonators = [];
    
    // Scan all members
    for (const [memberId, member] of guild.members.cache) {
      // Skip bots and protected members
      if (member.user.bot) continue;
      if (member.roles.cache.some(role => config.PROTECTED_ROLE_IDS.includes(role.id))) continue;
      
      scannedCount++;
      
      const impersonationData = checkForImpersonation(member);
      if (impersonationData) {
        foundCount++;
        impersonators.push({ member, impersonationData });
        console.log(`Found impersonator: ${member.displayName} -> ${impersonationData.impersonatedName}`);
      }
    }
    
    console.log(`Scan complete: ${scannedCount} members checked, ${foundCount} impersonators found`);
    
    // Send alerts for all found impersonators
    if (impersonators.length > 0) {
      const summaryEmbed = new EmbedBuilder()
        .setTitle('🔍 Impersonation Scan Complete')
        .setColor('#FF6600')
        .setDescription(`Found **${foundCount}** impersonator${foundCount !== 1 ? 's' : ''}`)
        .setTimestamp();
      
      await reportChannel.send({ embeds: [summaryEmbed] });
      
      // Send individual alerts
      for (const { member, impersonationData } of impersonators) {
        await sendImpersonatorAlert(member, impersonationData, reportChannel);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit
      }
    }
    
    return { scannedCount, foundCount };
  }
  
  // Handle new member joins
  client.on('guildMemberAdd', async (member) => {
    if (member.user.bot) return;
    
    const impersonationData = checkForImpersonation(member);
    if (impersonationData) {
      console.log(`New member ${member.displayName} is impersonating ${impersonationData.impersonatedName}!`);
      
      const reportChannel = member.guild.channels.cache.get(config.SCAM_CHANNEL_ID);
      if (reportChannel) {
        await sendImpersonatorAlert(member, impersonationData, reportChannel);
      }
    }
  });
  
  // Initial setup when bot is ready
  client.once('ready', async () => {
    console.log('Impersonation detection system starting...');
    
    const guild = client.guilds.cache.first();
    if (!guild) {
      console.error('No guild found');
      return;
    }
    
    // Initial cache update and scan
    await updateProtectedMembersCache(guild);
    
    // Wait a moment for everything to be ready
    setTimeout(async () => {
      await scanForImpersonators(guild);
    }, 5000);
    
    // Set up periodic scans (every 6 hours)
    setInterval(async () => {
      await scanForImpersonators(guild);
    }, 6 * 60 * 60 * 1000);
  });
  
  // Export functions for external use
  return {
    scanForImpersonators,
    checkForImpersonation,
    updateProtectedMembersCache
  };
}

module.exports = { setupImpersonationDetection };