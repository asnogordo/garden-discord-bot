// whitelist.js - Manages the whitelist of protected users
const fs = require('fs');
const path = require('path');

const WHITELIST_FILE = path.join(__dirname, '../data/whitelist.json');

// Initialize whitelist file if it doesn't exist
function initWhitelist() {
  console.log(`[WHITELIST DEBUG] Checking for whitelist file at: ${WHITELIST_FILE}`);
  console.log(`[WHITELIST DEBUG] Current working directory: ${process.cwd()}`);
  console.log(`[WHITELIST DEBUG] __dirname: ${__dirname}`);
  
  if (!fs.existsSync(WHITELIST_FILE)) {
    console.log(`[WHITELIST DEBUG] File doesn't exist, creating it...`);
    try {
      fs.writeFileSync(WHITELIST_FILE, JSON.stringify({ users: [] }, null, 2));
      console.log(`[WHITELIST DEBUG] Successfully created whitelist.json file at: ${WHITELIST_FILE}`);
    } catch (error) {
      console.error(`[WHITELIST DEBUG] Failed to create whitelist file:`, error);
    }
  } else {
    console.log(`[WHITELIST DEBUG] Whitelist file already exists`);
  }
}

// Load whitelist from file
function loadWhitelist() {
  try {
    initWhitelist();
    const data = fs.readFileSync(WHITELIST_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading whitelist:', error);
    return { users: [] };
  }
}

// Save whitelist to file
function saveWhitelist(whitelist) {
  try {
    fs.writeFileSync(WHITELIST_FILE, JSON.stringify(whitelist, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving whitelist:', error);
    return false;
  }
}

// Add user to whitelist
function addToWhitelist(userId, username, addedBy, reason = 'Manual whitelist', displayName = null) {
  const whitelist = loadWhitelist();
  
  // Check if user is already whitelisted
  if (whitelist.users.some(user => user.id === userId)) {
    return { success: false, message: 'User is already whitelisted' };
  }
  
  // Add user with metadata
  whitelist.users.push({
    id: userId,
    username: username,
    displayName: displayName || username,
    addedBy: addedBy,
    addedAt: new Date().toISOString(),
    reason: reason
  });
  
  if (saveWhitelist(whitelist)) {
    return { success: true, message: 'User added to whitelist' };
  } else {
    return { success: false, message: 'Failed to save whitelist' };
  }
}

// Remove user from whitelist
function removeFromWhitelist(userId) {
  const whitelist = loadWhitelist();
  
  const initialLength = whitelist.users.length;
  whitelist.users = whitelist.users.filter(user => user.id !== userId);
  
  if (whitelist.users.length === initialLength) {
    return { success: false, message: 'User not found in whitelist' };
  }
  
  if (saveWhitelist(whitelist)) {
    return { success: true, message: 'User removed from whitelist' };
  } else {
    return { success: false, message: 'Failed to save whitelist' };
  }
}

// Check if user is whitelisted
function isWhitelisted(userId) {
  const whitelist = loadWhitelist();
  return whitelist.users.some(user => user.id === userId);
}

// Get whitelist info for a user
function getWhitelistInfo(userId) {
  const whitelist = loadWhitelist();
  return whitelist.users.find(user => user.id === userId) || null;
}

// Get all whitelisted users
function getAllWhitelisted() {
  const whitelist = loadWhitelist();
  return whitelist.users;
}

module.exports = {
  addToWhitelist,
  removeFromWhitelist,
  isWhitelisted,
  getWhitelistInfo,
  getAllWhitelisted
};