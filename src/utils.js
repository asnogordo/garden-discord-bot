// utils.js
const config = require('./config');
const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

// Cache the protected roles
let protectedRoleIds = null;
let baseRoleIds = null;

function formatNumber(num) {
  return new Intl.NumberFormat().format(num);
}

function codeBlock(message) {
  return '```' + message + '```';
}

function helloMsgReply(msg) {
  if (msg.length < 2) {
    return 'Hi';
  }
  const normalized = msg.replace(/\s+/g, ' ').toLowerCase();
  return `${normalized[0].toUpperCase()}${normalized.substring(1)}`;
}

//rng pick from list
function pickFromList(list) {
  let lastIndex = -1;
  return () => {
    let randomIndex;
    do {
      randomIndex = Math.floor(Math.random() * list.length);
    } while (list.length > 1 && randomIndex === lastIndex);
    
    lastIndex = randomIndex;
    return list[randomIndex];
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryOperation(operation, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(delay);
      delay *= 2; // exponential backoff
    }
  }
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  } else {
    return `${seconds} second${seconds > 1 ? 's' : ''}`;
  }
}

function isAboveBaseRole(member) {
  console.log(`Checking permissions for user: ${member.user.tag}`);
  
  const baseRoles = (config.BASE_ROLE_IDS || [])
    .map(roleId => member.guild.roles.cache.get(roleId))
    .filter(Boolean);

  if (baseRoles.length === 0) {
    console.log('None of the configured BASE_ROLE_IDS were found in the guild.');
    return false;
  }

  const highestBaseRole = baseRoles.reduce((highest, current) =>
    current.position > highest.position ? current : highest
  );
  
  console.log(`Highest base role: ${highestBaseRole.name} (Position: ${highestBaseRole.position})`);
  console.log(`User's highest role: ${member.roles.highest.name} (Position: ${member.roles.highest.position})`);
  
  const isAbove = member.roles.highest.position > highestBaseRole.position;
  console.log(`Is user's role above base role? ${isAbove}`);
  
  return isAbove;
}

function getBaseRoleIds() {
  if (!baseRoleIds) {
    baseRoleIds = new Set(config.BASE_ROLE_IDS || []);
  }
  return baseRoleIds;
}

function hasBaseRolesOnly(member) {
  if (!member || !member.roles || !member.roles.cache) {
    return false;
  }

  const allowedBaseRoles = getBaseRoleIds();
  if (allowedBaseRoles.size === 0) {
    console.warn('BASE_ROLE_IDS is empty - hasBaseRolesOnly will return false');
    return false;
  }

  const nonEveryoneRoleIds = [];
  for (const role of member.roles.cache.values()) {
    // Skip @everyone role
    if (role.id === member.guild?.id || role.name === '@everyone') {
      continue;
    }
    nonEveryoneRoleIds.push(role.id);
  }

  if (nonEveryoneRoleIds.length === 0) {
    return false;
  }

  const hasAtLeastOneBaseRole = nonEveryoneRoleIds.some(roleId => allowedBaseRoles.has(roleId));
  if (!hasAtLeastOneBaseRole) {
    return false;
  }

  return nonEveryoneRoleIds.every(roleId => allowedBaseRoles.has(roleId));
}

function getProtectedRoleIds() {
  if (!protectedRoleIds) {
    protectedRoleIds = new Set(config.PROTECTED_ROLE_IDS || []);
  }
  return protectedRoleIds;
}

function hasProtectedRole(member) {
  if (!member) {
    console.error('Member object is required for hasProtectedRole check');
    return false;
  }

  try {
    const protectedRoles = getProtectedRoleIds();
    
    // No protected roles configured - fail safe by returning true
    if (protectedRoles.size === 0) {
      console.warn('No protected roles configured - defaulting to protected state');
      return true;
    }

    return member.roles.cache.some(role => protectedRoles.has(role.id));
  } catch (error) {
    console.error('Error checking protected roles:', error);
    // Fail safe - if we can't verify, assume protected
    return true;
  }
}

function canBeModerated(member, moderator) {
  if (!member || !moderator) {
    console.error('Both member and moderator objects are required for moderation check');
    return false;
  }

  try {
    // Protected roles check
    if (hasProtectedRole(member)) {
      return false;
    }

    // Self-moderation check
    if (member.id === moderator.id) {
      return false;
    }

    // Role hierarchy check
    if (member.roles.highest.position >= moderator.roles.highest.position) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in canBeModerated check:', error);
    return false;
  }
}

// Add this function to help determine if a message is a question
function isLikelyQuestion(content) {
  // Check for question marks
  if (content.includes('?')) return true;
  
  // Check for interrogative words at the start of sentences
  if (/^(?:how|what|when|where|why|who|which|can|could|would|is|are|do|does|did|has|have|should)\b/i.test(content)) {
    return true;
  }
  
  return false;
}

/**
 * Send a bot reply with optional dismiss button for elevated users
 * @param {Message} message - The message to reply to
 * @param {string|Object} content - Reply content (string or object with content/embeds)
 * @param {Object} options - Additional options (files, components, etc.)
 * @returns {Promise<Message>} The bot's reply message
 */
async function sendBotReply(message, content, options = {}) {
  // Lazy load to avoid circular dependency
  const { botResponseMessages } = require('./messageHandlers');
  
  // Prepare reply options
  const replyOptions = typeof content === 'string' 
    ? { content, ...options }
    : { ...content, ...options };
  
    const dismissButton = new ButtonBuilder()
    .setCustomId(`dismiss_${message.id}`)
    .setLabel('Dismiss')  // No label
    .setStyle(ButtonStyle.Secondary)
  
  // Always add the button, but permission check happens when clicked
  if (replyOptions.components) {
    replyOptions.components.push(new ActionRowBuilder().addComponents(dismissButton));
  } else {
    replyOptions.components = [new ActionRowBuilder().addComponents(dismissButton)];
  }
  
  const botReply = await message.reply(replyOptions);
  
  // Track the message for cleanup
  botResponseMessages.set(botReply.id, {
    triggeredBy: message.author.id,
    timestamp: Date.now()
  });
  
  return botReply;
}

module.exports = {
  formatNumber,
  codeBlock,
  helloMsgReply,
  pickFromList,
  sleep,
  retryOperation,
  formatDuration,
  isAboveBaseRole,
  hasBaseRolesOnly,
  hasProtectedRole,
  canBeModerated,
  isLikelyQuestion,
  sendBotReply 
};
