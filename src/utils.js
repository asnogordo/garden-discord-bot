// utils.js
const config = require('./config');

// Cache the protected roles
let protectedRoleIds = null;

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
  
  const baseRole = member.guild.roles.cache.get(require('./config').BASE_ROLE_ID);
  if (!baseRole) {
    console.log(`Base role with ID ${require('./config').BASE_ROLE_ID} not found in the guild.`);
    return false;
  }
  
  console.log(`Base role: ${baseRole.name} (Position: ${baseRole.position})`);
  console.log(`User's highest role: ${member.roles.highest.name} (Position: ${member.roles.highest.position})`);
  
  const isAbove = member.roles.highest.position > baseRole.position;
  console.log(`Is user's role above base role? ${isAbove}`);
  
  return isAbove;
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

module.exports = {
  formatNumber,
  codeBlock,
  helloMsgReply,
  pickFromList,
  sleep,
  retryOperation,
  formatDuration,
  isAboveBaseRole,
  hasProtectedRole,
  canBeModerated
};