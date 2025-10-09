//embeds.js - embed helper
const { EmbedBuilder } = require('discord.js');

// Color constants for consistent styling
const COLORS = {
  SUCCESS: '#00FF00',
  WARNING: '#FFA500',
  ERROR: '#FF0000',
  INFO: '#0099FF',
  TRANSFER: '#9B59B6',
  STAKE: '#3498DB',
  SWAP: '#2ECC71'
};

// Helper functions for formatting
function formatTxHash(txHash) {
  if (!txHash || typeof txHash !== 'string' || txHash.length < 10) {
    return 'Invalid Hash';
  }
  return `[${txHash.substring(0, 6)}...${txHash.substring(txHash.length - 4)}](https://arbiscan.io/tx/${txHash})`;
}

function formatCurrency(value) {
  const amount = Number.isFinite(value) ? value : 0;
  return `$${amount.toFixed(2)}`;
}

function formatNumber(value) {
  const num = Number.isFinite(value) ? value : 0;
  return num.toLocaleString();
}

function truncateText(text, maxLength = 900) {
  if (!text) return 'No content';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '... (truncated)';
}

// Static embeds
const ADDRESSES_EMBEDDED_MSG = new EmbedBuilder()
  .setTitle('Garden Finance 🌱🌸 relevant addresses')
  .setDescription('For the complete list of supported chains (mainnet & testnet): [Garden Documentation](https://docs.garden.finance/developers/supported-chains)')
  .setColor(COLORS.INFO)
  .addFields(
    { 
      name: 'Ethereum',
      value: `- SEED Token: [\`0x5eed99d066a8CaF10f3E4327c1b3D8b673485eED\`](https://etherscan.io/address/0x5eed99d066a8caf10f3e4327c1b3d8b673485eed)
- Garden Multisig: [\`0x8686368A0DBdCB036c6Bd41381Beb96Da5bbA743\`](https://etherscan.io/address/0x8686368A0DBdCB036c6Bd41381Beb96Da5bbA743)`
    },
    { 
      name: 'Arbitrum',
      value: `- SEED Token: [\`0x86f65121804D2Cdbef79F9f072D4e0c2eEbABC08\`](https://arbiscan.io/token/0x86f65121804d2cdbef79f9f072d4e0c2eebabc08)
- SEED Staking: [\`0xe2239938ce088148b3ab398b2b77eedfcd9d1afc\`](https://arbiscan.io/address/0xe2239938ce088148b3ab398b2b77eedfcd9d1afc)
- Garden Pass: [\`0x1ab59ae8bb54700b3c2c2cec4db2da26fe825a7d\`](https://arbiscan.io/address/0x1ab59ae8bb54700b3c2c2cec4db2da26fe825a7d)`
    }
  )
  .setFooter({ text: 'Garden Finance Bot • Contract Addresses' })
  .setTimestamp();

// Dynamic embeds
function createTransferEmbed(amount, usdValue, txHash) {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const safeUsdValue = Number.isFinite(usdValue) ? usdValue : 0;
  
  return new EmbedBuilder()
    .setTitle('🌸 Large SEED 🌱 Transfer 🌸')
    .setColor(COLORS.TRANSFER)
    .addFields([
      { name: 'SEED 🌱 Transferred', value: formatNumber(safeAmount), inline: true },
      { name: 'USD Value 💵', value: formatCurrency(safeUsdValue), inline: true },
      { name: 'Tx Hash', value: formatTxHash(txHash) }
    ])
    .setFooter({ text: 'Garden Finance Bot • Transaction Monitor' })
    .setTimestamp();
}

function createStakeEmbed(amount, usdValue, txHash) {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const safeUsdValue = Number.isFinite(usdValue) ? usdValue : 0;
  
  return new EmbedBuilder()
    .setTitle('🌸 Large SEED 🌱 Stake 🌸')
    .setColor(COLORS.STAKE)
    .addFields([
      { name: 'SEED 🌱 Staked', value: formatNumber(safeAmount), inline: true },
      { name: 'USD Value 💵', value: formatCurrency(safeUsdValue), inline: true },
      { name: 'Tx Hash', value: formatTxHash(txHash) }
    ])
    .setFooter({ text: 'Garden Finance Bot • Staking Monitor' })
    .setTimestamp();
}

function createSwapEmbed(amount, usdValue, txHash) {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const safeUsdValue = Number.isFinite(usdValue) ? usdValue : 0;
  
  return new EmbedBuilder()
    .setTitle('🌸 Large SEED 🌱 Swap 🌸')
    .setColor(COLORS.SWAP)
    .addFields([
      { name: 'SEED 🌱 Bought', value: formatNumber(safeAmount), inline: true },
      { name: 'USD Value 💵', value: formatCurrency(safeUsdValue), inline: true },
      { name: 'Tx Hash', value: formatTxHash(txHash) }
    ])
    .setFooter({ text: 'Garden Finance Bot • Swap Monitor' })
    .setTimestamp();
}

function createWarningMessageEmbed(accountCreatedAt, joinDate, displayName, username, userId, roles, channelIds, originalMessage, spamOccurrences = 0, detectionSummary = null) {
  const embed = new EmbedBuilder()
    .setTitle('🚨 Suspicious Activity Detected')
    .setDescription('Planting a 🌱 instead.')
    .setColor(COLORS.ERROR)
    .setTimestamp();
  
  // Create and validate fields
  const fields = [];
  
  // Add fields with proper validation
  if (accountCreatedAt) {
    fields.push({ name: 'Account Created', value: String(accountCreatedAt), inline: true });
  }
  
  if (joinDate) {
    fields.push({ name: 'Joined Server', value: String(joinDate), inline: true });
  }
  
  if (displayName) {
    fields.push({ name: 'Display Name', value: String(displayName), inline: true });
  }
  
  // Username with link to profile
  if (username && userId) {
    fields.push({ 
      name: 'Username', 
      value: `[${username}](https://discord.com/users/${userId})`, 
      inline: true 
    });
  }
  
  // Roles field
  fields.push({ name: 'Roles', value: roles || 'None', inline: true });
  
  // Channel count - safely handle the Set
  const channelCount = channelIds && typeof channelIds.size === 'number' ? 
    channelIds.size.toString() : '1';
  fields.push({ name: 'Channels Affected', value: channelCount, inline: true });
  
  // Spam occurrences - ensure it's a number and convert to string
  fields.push({ 
    name: 'Spam Occurrences', 
    value: (Number.isFinite(spamOccurrences) ? spamOccurrences : 0).toString(), 
    inline: true 
  });
  
  // Add detection details if provided
  if (detectionSummary) {
    fields.push({ 
      name: '🔍 Detection Details', 
      value: String(detectionSummary),
      inline: false 
    });
  }
  
  // Safely handle the original message
  if (originalMessage) {
    // Truncate long messages and add spoiler tags
    const safeMessage = truncateText(originalMessage);
    fields.push({ 
      name: 'Removed Message (click to expand)', 
      value: `||${safeMessage}||` 
    });
  }
  
  // Add all validated fields
  if (fields.length > 0) {
    embed.addFields(fields);
  }
  
  embed.setFooter({ text: 'Garden Finance Bot • Scam Protection' });
  
  return embed;
}

module.exports = {
  COLORS,
  ADDRESSES_EMBEDDED_MSG,
  createTransferEmbed,
  createStakeEmbed,
  createSwapEmbed,
  createWarningMessageEmbed,
  formatTxHash,
  formatCurrency,
  formatNumber,
  truncateText
};