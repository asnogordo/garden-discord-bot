// config.js - reads the .env and preps config variables
require('dotenv').config();

module.exports = {
  // Discord Bot Configuration
  BOT_TOKEN: process.env.BOT_TOKEN,
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,

  // Channel IDs
  SCAM_CHANNEL_ID: process.env.SCAM_CHANNEL_ID,
  GM_CHANNEL_ID: process.env.GM_CHANNEL_ID,
  SUPPORT_CHANNEL_ID: process.env.SUPPORT_TICKET_CHANNEL_ID,
  CHANNEL_ID: process.env.BOT_CHANNEL_ID,

  // Excluded Channels (Add channel IDs to exclude) from message detection
  EXCLUDED_CHANNELS: [
    process.env.SUPPORT_TICKET_CHANNEL_ID
    // Add more channel IDs as needed
  ].filter(Boolean), // This removes any undefined or null values

  // roles that can't be banned by sus
  PROTECTED_ROLE_IDS: (process.env.PROTECTED_ROLE_IDS || '').split(',').filter(Boolean),

  // Excluded Channel Name Patterns from ENV
  EXCLUDED_CHANNEL_PATTERNS: (process.env.EXCLUDED_CHANNEL_PATTERNS || '')
  .split(',')
  .map(pattern => pattern.trim())
  .filter(Boolean),
  
  // Role IDs
  BASE_ROLE_ID: process.env.BASE_ROLE_ID,

  // Blockchain Configuration - Etherscan v2 API
  ETHERSCAN_API_KEY: process.env.ETHERSCAN_API_KEY, // Single API key for all chains
  ETHERSCAN_V2_BASE_URL: 'https://api.etherscan.io/v2/api',
  
  // Chain configurations
  CHAINS: {
    ETHEREUM: {
      chainId: 1,
      name: 'Ethereum',
      rpcUrl: process.env.ETHEREUM_RPC || 'https://eth.llamarpc.com',
      tokenAddress: process.env.ETH_TOKEN_ADDRESS || '0x5eed99d066a8CaF10f3E4327c1b3D8b673485eED',
      stakingAddress: null, // No staking on Ethereum yet
      uniswapPoolAddress: process.env.ETH_POOL_ADDRESS || '0xf9f588394ec5c3b05511368ce016de5fd3812446',
      coingeckoId: 'garden-2',
      features: {
        staking: false,
        swaps: true,
        transfers: true
      }
    },
    ARBITRUM: {
      chainId: 42161,
      name: 'Arbitrum',
      rpcUrl: process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
      tokenAddress: process.env.ARB_TOKEN_ADDRESS || '0x86f65121804D2Cdbef79F9f072D4e0c2eEbABC08',
      stakingAddress: process.env.ARB_STAKING_ADDRESS || '0xe2239938ce088148b3ab398b2b77eedfcd9d1afc',
      uniswapPoolAddress: process.env.ARB_POOL_ADDRESS || '0xf9f588394ec5c3b05511368ce016de5fd3812446',
      coingeckoId: 'garden-2',
      features: {
        staking: true,
        swaps: true,
        transfers: true
      }
    }
    // Add more chains as needed (Base, Optimism, Polygon, etc.)
  },

  // Active chains to monitor (can be configured via env)
  ACTIVE_CHAINS: (process.env.ACTIVE_CHAINS || 'ETHEREUM,ARBITRUM')
    .split(',')
    .map(chain => chain.trim())
    .filter(Boolean),

  // Bot Behavior Configuration
  POLL_INTERVAL: parseInt(process.env.POLL_INTERVAL) || 900000, // Poll every 900 seconds
  LARGE_SWAP_AMOUNT: parseFloat(process.env.LARGE_SWAP_AMOUNT) || 15000,
  LARGE_STAKE_AMOUNT: parseFloat(process.env.LARGE_STAKE_AMOUNT) || 20999,

  // Uniswap Pool ABI
  UNISWAP_POOL_ABI: [
    {
      "inputs": [],
      "name": "token0",
      "outputs": [{"internalType": "address", "name": "", "type": "address"}],
      "stateMutability": "view",
      "type": "function"
    }
  ],
};