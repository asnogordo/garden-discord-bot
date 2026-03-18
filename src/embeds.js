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

const EMBED_LIMITS = {
  FIELD_NAME: 256,
  FIELD_VALUE: 1024
};

const TRUNCATE_SUFFIX = '... (truncated)';

// Helper function to get block explorer URL based on chain ID
function getExplorerUrl(chainId, txHash) {
  const explorers = {
    1: `https://etherscan.io/tx/${txHash}`,
    42161: `https://arbiscan.io/tx/${txHash}`,
    10: `https://optimistic.etherscan.io/tx/${txHash}`,
    8453: `https://basescan.org/tx/${txHash}`,
    137: `https://polygonscan.com/tx/${txHash}`,
    56: `https://bscscan.com/tx/${txHash}`,
  };
  
  return explorers[chainId] || `https://etherscan.io/tx/${txHash}`;
}

// Helper function to get chain emoji
function getChainEmoji(chainName) {
  const emojis = {
    'Ethereum': '🔷',
    'Arbitrum': '🔵',
    'Optimism': '🔴',
    'Base': '🔵',
    'Polygon': '🟣',
    'BSC': '🟡',
  };
  
  return emojis[chainName] || '⛓️';
}

// Helper functions for formatting
function formatTxHash(txHash, chainId = 42161) {
  if (!txHash || typeof txHash !== 'string' || txHash.length < 10) {
    return 'Invalid Hash';
  }
  const explorerUrl = getExplorerUrl(chainId, txHash);
  return `[${txHash.substring(0, 6)}...${txHash.substring(txHash.length - 4)}](${explorerUrl})`;
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
  const safeMaxLength = Math.max(0, maxLength - TRUNCATE_SUFFIX.length);
  return text.substring(0, safeMaxLength) + TRUNCATE_SUFFIX;
}

function clampEmbedText(value, maxLength, fallback = 'N/A') {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value);
  return text.length > maxLength ? truncateText(text, maxLength) : text;
}

function createSafeField(name, value, inline = false) {
  return {
    name: clampEmbedText(name, EMBED_LIMITS.FIELD_NAME, 'Info'),
    value: clampEmbedText(value, EMBED_LIMITS.FIELD_VALUE, 'N/A'),
    inline
  };
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

// Dynamic embeds for transaction monitoring (with multi-chain support)
function createTransferEmbed(amount, usdValue, txHash, displayText, chainName = 'Arbitrum', chainId = 42161) {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const safeUsdValue = Number.isFinite(usdValue) ? usdValue : 0;
  const emoji = getChainEmoji(chainName);
  
  return new EmbedBuilder()
    .setTitle(`${emoji} 🌸 Large SEED 🌱 Transfer 🌸`)
    .setDescription(`A significant token transfer has been detected on ${chainName}`)
    .setColor(COLORS.TRANSFER)
    .addFields([
      { name: 'SEED 🌱 Transferred', value: formatNumber(safeAmount), inline: true },
      { name: 'USD Value 💵', value: formatCurrency(safeUsdValue), inline: true },
      { name: '🔗 Chain', value: chainName, inline: true },
      { name: 'Tx Hash', value: formatTxHash(txHash, chainId), inline: false }
    ])
    .setFooter({ text: 'Garden Finance Bot • Transaction Monitor' })
    .setTimestamp();
}

function createStakeEmbed(amount, usdValue, txHash, displayText, chainName = 'Arbitrum', chainId = 42161) {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const safeUsdValue = Number.isFinite(usdValue) ? usdValue : 0;
  const emoji = getChainEmoji(chainName);
  
  return new EmbedBuilder()
    .setTitle(`${emoji} 🌸 Large SEED 🌱 Stake 🌸`)
    .setDescription(`A significant staking transaction has been detected on ${chainName}`)
    .setColor(COLORS.STAKE)
    .addFields([
      { name: 'SEED 🌱 Staked', value: formatNumber(safeAmount), inline: true },
      { name: 'USD Value 💵', value: formatCurrency(safeUsdValue), inline: true },
      { name: '🔗 Chain', value: chainName, inline: true },
      { name: 'Tx Hash', value: formatTxHash(txHash, chainId), inline: false }
    ])
    .setFooter({ text: 'Garden Finance Bot • Staking Monitor' })
    .setTimestamp();
}

function createSwapEmbed(amount, usdValue, txHash, displayText, chainName = 'Arbitrum', chainId = 42161) {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const safeUsdValue = Number.isFinite(usdValue) ? usdValue : 0;
  const emoji = getChainEmoji(chainName);
  
  return new EmbedBuilder()
    .setTitle(`${emoji} 🌸 Large SEED 🌱 Swap 🌸`)
    .setDescription(`A significant swap transaction has been detected on ${chainName}`)
    .setColor(COLORS.SWAP)
    .addFields([
      { name: 'SEED 🌱 Bought', value: formatNumber(safeAmount), inline: true },
      { name: 'USD Value 💵', value: formatCurrency(safeUsdValue), inline: true },
      { name: '🔗 Chain', value: chainName, inline: true },
      { name: 'Tx Hash', value: formatTxHash(txHash, chainId), inline: false }
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
    fields.push(createSafeField('Account Created', accountCreatedAt, true));
  }
  
  if (joinDate) {
    fields.push(createSafeField('Joined Server', joinDate, true));
  }
  
  if (displayName) {
    fields.push(createSafeField('Display Name', displayName, true));
  }
  
  // Username with link to profile
  if (username && userId) {
    const usernameLink = `[@${username}](https://discord.com/users/${userId})`;
    fields.push(createSafeField('Username', usernameLink, true));
  }
  
  // Roles field
  fields.push(createSafeField('Roles', roles || 'None', true));
  
  // Channel count - safely handle the Set
  const channelCount = channelIds && typeof channelIds.size === 'number' ? 
    channelIds.size.toString() : '1';
  fields.push(createSafeField('Channels Affected', channelCount, true));
  
  // Spam occurrences - ensure it's a number and convert to string
  fields.push(
    createSafeField(
      'Spam Occurrences',
      (Number.isFinite(spamOccurrences) ? spamOccurrences : 0).toString(),
      true
    )
  );
  
  // Add detection details if provided
  if (detectionSummary) {
    fields.push(createSafeField('🔍 Detection Details', detectionSummary, false));
  }
  
  // Safely handle the original message
  if (originalMessage) {
    // Truncate long messages and add spoiler tags
    const safeMessage = truncateText(originalMessage, 980);
    fields.push(createSafeField('Removed Message (click to expand)', `||${safeMessage}||`));
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
  truncateText,
  getExplorerUrl,
  getChainEmoji
};
