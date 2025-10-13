//transactionMonitor.js - track onchain transactions with Etherscan v2 API
const { Web3 } = require('web3');
const { EmbedBuilder } = require('discord.js');
const axios = require('axios');
const { 
  ETHERSCAN_API_KEY, 
  ETHERSCAN_V2_BASE_URL,
  CHAINS,
  ACTIVE_CHAINS,
  UNISWAP_POOL_ABI, 
  LARGE_SWAP_AMOUNT, 
  LARGE_STAKE_AMOUNT,
  CHANNEL_ID
} = require('./config');
const { sendAlert } = require('./discordUtils');
const { createTransferEmbed, createStakeEmbed, createSwapEmbed } = require('./embeds');

// Store Web3 instances per chain
const web3Instances = {};
const highestCheckedBlocks = {};
const processedTransactions = new Set();

// Initialize Web3 instances for each active chain
function initializeWeb3Instances() {
  ACTIVE_CHAINS.forEach(chainKey => {
    const chainConfig = CHAINS[chainKey];
    if (chainConfig) {
      web3Instances[chainKey] = new Web3(chainConfig.rpcUrl);
      highestCheckedBlocks[chainKey] = 0;
      console.log(`Initialized Web3 for ${chainConfig.name} (Chain ID: ${chainConfig.chainId})`);
    } else {
      console.warn(`Chain configuration not found for: ${chainKey}`);
    }
  });
}

// Main check function that processes all active chains
async function checkTransfers(client) {
  // Initialize Web3 instances if not done yet
  if (Object.keys(web3Instances).length === 0) {
    initializeWeb3Instances();
  }

  console.log(`\n🔍 Starting transaction check across ${ACTIVE_CHAINS.length} chain(s)...`);
  const overallStartTime = new Date();

  // Process each active chain
  for (const chainKey of ACTIVE_CHAINS) {
    const chainConfig = CHAINS[chainKey];
    if (!chainConfig) {
      console.warn(`Skipping unknown chain: ${chainKey}`);
      continue;
    }

    try {
      await checkTransfersForChain(client, chainKey, chainConfig);
    } catch (error) {
      console.error(`Error checking transfers for ${chainConfig.name}:`, error.message);
    }
  }

  const overallEndTime = new Date();
  const overallDuration = ((overallEndTime - overallStartTime) / 1000).toFixed(2);
  console.log(`✅ Completed checking all chains in ${overallDuration} seconds\n`);
}

// Check transfers for a specific chain
async function checkTransfersForChain(client, chainKey, chainConfig) {
  try {
    const web3 = web3Instances[chainKey];
    
    // Statistics tracking
    const stats = {
      chain: chainConfig.name,
      chainId: chainConfig.chainId,
      startTime: new Date(),
      totalBlocksToProcess: 0,
      blocksProcessed: 0,
      apiCallsMade: 0,
      transfersFound: 0,
      largeTransfersFound: 0,
      largeStakesFound: 0,
      largeSwapsFound: 0,
      errorCount: 0,
      summaryByRange: []
    };
    
    // Get current block number using v2 API
    const currentBlock = await getLatestBlockNumber(chainConfig.chainId);
    stats.apiCallsMade++;
    
    // Initialize if first run
    if (highestCheckedBlocks[chainKey] === 0) {
      highestCheckedBlocks[chainKey] = currentBlock - 500;
      console.log(`[${chainConfig.name}] Initializing from block ${highestCheckedBlocks[chainKey]}`);
      return;
    }
    
    // Skip if no new blocks
    if (currentBlock <= highestCheckedBlocks[chainKey]) {
      console.log(`[${chainConfig.name}] No new blocks yet. Current: ${currentBlock}, Last: ${highestCheckedBlocks[chainKey]}`);
      return;
    }
    
    stats.totalBlocksToProcess = currentBlock - highestCheckedBlocks[chainKey];
    console.log(`[${chainConfig.name}] Starting processing of ${stats.totalBlocksToProcess} new blocks (${highestCheckedBlocks[chainKey] + 1} to ${currentBlock})`);
    
    // Process in smaller chunks with longer delays
    const maxBlocksPerRequest = 100;
    let processedBlock = highestCheckedBlocks[chainKey];
    
    // Only fetch token price when needed
    let tokenPrice = null;
    
    // Process blocks in chunks with rate limiting
    while (processedBlock < currentBlock) {
      const nextBlock = Math.min(processedBlock + maxBlocksPerRequest, currentBlock);
      const rangeStart = processedBlock + 1;
      const rangeEnd = nextBlock;
      
      try {
        // Add delay between API calls to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const transfers = await getTokenTransfers(
          chainConfig.chainId,
          chainConfig.tokenAddress,
          rangeStart,
          rangeEnd
        );
        stats.apiCallsMade++;
        
        // If we got a rate limit response, pause and save progress
        if (!transfers) {
          console.error(`[${chainConfig.name}] Rate limited. Saving progress at block ${processedBlock}`);
          stats.errorCount++;
          highestCheckedBlocks[chainKey] = processedBlock;
          logSummary(stats);
          return;
        }
        
        // Record the range result
        const rangeStats = {
          startBlock: rangeStart,
          endBlock: rangeEnd,
          transferCount: 0,
          largeTransferCount: 0,
          largeStakeCount: 0,
          largeSwapCount: 0
        };
        
        // If empty result or not an array, continue to next chunk
        if (!Array.isArray(transfers) || transfers.length === 0) {
          stats.summaryByRange.push(rangeStats);
          processedBlock = nextBlock;
          stats.blocksProcessed += (rangeEnd - rangeStart + 1);
          continue;
        }
        
        // Update stats
        rangeStats.transferCount = transfers.length;
        stats.transfersFound += transfers.length;
        
        // Only fetch price if we need it
        const hasLargeTransfer = transfers.some(transfer => 
          Number(web3.utils.fromWei(transfer.value, 'ether')) >= LARGE_STAKE_AMOUNT
        );
        
        if (hasLargeTransfer && tokenPrice === null) {
          try {
            tokenPrice = await getSeedTokenPrice(chainConfig.coingeckoId);
            stats.apiCallsMade++;
          } catch (priceError) {
            console.error(`[${chainConfig.name}] Failed to get token price:`, priceError.message);
            stats.errorCount++;
            tokenPrice = 0;
          }
        }
        
        // Process transfers
        for (const transfer of transfers) {
          const txHash = transfer.hash;
          
          // Skip if already processed (use chain-specific key)
          const txKey = `${chainKey}-${txHash}`;
          if (processedTransactions.has(txKey)) {
            continue;
          }
          
          processedTransactions.add(txKey);
          
          // Convert to human-readable amount
          const amount = parseFloat(web3.utils.fromWei(transfer.value, 'ether'));
          const usdValue = tokenPrice ? amount * tokenPrice : 0;
          const displayText = `${txHash.substring(0, 6)}...${txHash.substring(txHash.length - 4)}`;
          
          // Process large stakes (only if staking is enabled on this chain)
          if (chainConfig.features.staking && 
              chainConfig.stakingAddress && 
              transfer.to.toLowerCase() === chainConfig.stakingAddress.toLowerCase() && 
              amount >= LARGE_STAKE_AMOUNT) {
            console.log(`[${chainConfig.name}] Large stake: ${amount} SEED (${usdValue.toFixed(2)}) in block ${transfer.blockNumber}`);
            stats.largeStakesFound++;
            rangeStats.largeStakeCount++;
            
            const embed = createStakeEmbed(amount, usdValue, txHash, displayText, chainConfig.name, chainConfig.chainId);
            sendAlert(client, embed, CHANNEL_ID);
            continue;
          }
          
          // Process large transfers/swaps
          if (amount >= LARGE_SWAP_AMOUNT) {
            try {
              const receipt = await getTransactionReceipt(web3, txHash);
              stats.apiCallsMade++;
              await new Promise(resolve => setTimeout(resolve, 500));
              
              const isSwap = receipt.logs.some(log => 
                log.address.toLowerCase() === chainConfig.uniswapPoolAddress.toLowerCase() && 
                log.topics[0] === web3.utils.sha3('Swap(address,address,int256,int256,uint160,uint128,int24)')
              );
              
              if (isSwap) {
                console.log(`[${chainConfig.name}] Large swap: ${amount} SEED ($${usdValue.toFixed(2)}) in block ${transfer.blockNumber}`);
                stats.largeSwapsFound++;
                rangeStats.largeSwapCount++;
                const embed = createSwapEmbed(amount, usdValue, txHash, displayText, chainConfig.name, chainConfig.chainId);
                sendAlert(client, embed, CHANNEL_ID);
              } else {
                console.log(`[${chainConfig.name}] Large transfer: ${amount} SEED ($${usdValue.toFixed(2)}) in block ${transfer.blockNumber}`);
                stats.largeTransfersFound++;
                rangeStats.largeTransferCount++;
                const embed = createTransferEmbed(amount, usdValue, txHash, displayText, chainConfig.name, chainConfig.chainId);
                sendAlert(client, embed, CHANNEL_ID);
              }
            } catch (receiptError) {
              console.error(`[${chainConfig.name}] Failed to get receipt for ${displayText}:`, receiptError.message);
              stats.errorCount++;
            }
          }
        }
        
        stats.summaryByRange.push(rangeStats);
        
      } catch (chunkError) {
        console.error(`[${chainConfig.name}] Error processing chunk ${rangeStart} to ${rangeEnd}:`, chunkError.message);
        stats.errorCount++;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      processedBlock = nextBlock;
      stats.blocksProcessed += (rangeEnd - rangeStart + 1);
      
      // Clean up processed transactions set
      if (processedTransactions.size > 10000) {
        const oldestEntries = Array.from(processedTransactions).slice(0, 5000);
        oldestEntries.forEach(tx => processedTransactions.delete(tx));
      }
    }
    
    highestCheckedBlocks[chainKey] = currentBlock;
    logSummary(stats);
    
  } catch (error) {
    console.error(`[${chainConfig.name}] Error in checkTransfersForChain:`, error.message);
  }
}

// Log summary function
function logSummary(stats) {
  const endTime = new Date();
  const durationMs = endTime - stats.startTime;
  const durationSec = (durationMs / 1000).toFixed(2);
  
  console.log(`\n======= [${stats.chain}] TRANSACTION MONITOR SUMMARY =======`);
  console.log(`Chain ID: ${stats.chainId}`);
  console.log(`Run completed in ${durationSec} seconds`);
  console.log(`Blocks processed: ${stats.blocksProcessed}/${stats.totalBlocksToProcess}`);
  console.log(`API calls made: ${stats.apiCallsMade}`);
  console.log(`Transfers found: ${stats.transfersFound}`);
  console.log(`Large transactions: ${stats.largeTransfersFound + stats.largeStakesFound + stats.largeSwapsFound}`);
  console.log(`  - Large transfers: ${stats.largeTransfersFound}`);
  console.log(`  - Large stakes: ${stats.largeStakesFound}`);
  console.log(`  - Large swaps: ${stats.largeSwapsFound}`);
  
  if (stats.errorCount > 0) {
    console.log(`Errors encountered: ${stats.errorCount}`);
  }
  
  console.log('\nBlock range summary:');
  
  let currentEmptyRange = null;
  
  stats.summaryByRange.forEach((range) => {
    if (range.transferCount > 0 || 
        range.largeTransferCount > 0 || 
        range.largeStakeCount > 0 || 
        range.largeSwapCount > 0) {
      
      if (currentEmptyRange) {
        console.log(`Blocks ${currentEmptyRange.startBlock} - ${currentEmptyRange.endBlock}: No transactions found`);
        currentEmptyRange = null;
      }
      
      console.log(`Blocks ${range.startBlock} - ${range.endBlock}: ${range.transferCount} transactions found`);
      
      if (range.largeTransferCount > 0) {
        console.log(`  - ${range.largeTransferCount} large transfers`);
      }
      if (range.largeStakeCount > 0) {
        console.log(`  - ${range.largeStakeCount} large stakes`);
      }
      if (range.largeSwapCount > 0) {
        console.log(`  - ${range.largeSwapCount} large swaps`);
      }
    } else {
      if (!currentEmptyRange) {
        currentEmptyRange = {
          startBlock: range.startBlock,
          endBlock: range.endBlock
        };
      } else {
        currentEmptyRange.endBlock = range.endBlock;
      }
    }
  });
  
  if (currentEmptyRange) {
    console.log(`Blocks ${currentEmptyRange.startBlock} - ${currentEmptyRange.endBlock}: No transactions found`);
  }
  
  console.log('===========================================\n');
}

// Get latest block number using Etherscan v2 API
async function getLatestBlockNumber(chainId) {
  const url = `${ETHERSCAN_V2_BASE_URL}?chainid=${chainId}&module=proxy&action=eth_blockNumber&apikey=${ETHERSCAN_API_KEY}`;
  const response = await axios.get(url);
  return parseInt(response.data.result, 16);
}

// Get token transfers using Etherscan v2 API
async function getTokenTransfers(chainId, contractAddress, fromBlock, toBlock, maxRetries = 5) {
  let attempt = 0;
  
  while (attempt < maxRetries) {
    attempt++;
    
    try {
      const url = `${ETHERSCAN_V2_BASE_URL}?chainid=${chainId}&module=account&action=tokentx&contractaddress=${contractAddress}&startblock=${fromBlock}&endblock=${toBlock}&sort=asc&apikey=${ETHERSCAN_API_KEY}`;
      
      const response = await axios.get(url, { timeout: 15000 });
      
      return response.data.result || [];
      
    } catch (error) {
      if (error.response?.data?.message === "No transactions found" || 
          error.message?.includes("No transactions found")) {
        return [];
      }
      
      console.error(`API request failed (${error.message})`);
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Retrying in ${delay / 1000} seconds. Attempt ${attempt}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error(`Maximum retry attempts reached. Unable to fetch transfers.`);
        throw error;
      }
    }
  }
}

// Get transaction receipt
async function getTransactionReceipt(web3, txHash) {
  return await web3.eth.getTransactionReceipt(txHash);
}

// Get token0 address from pool
async function getToken0Address(web3, poolAddress) {
  const poolContract = new web3.eth.Contract(UNISWAP_POOL_ABI, poolAddress);
  return await poolContract.methods.token0().call();
}

// Get token price from CoinGecko
async function getSeedTokenPrice(coingeckoId) {
  const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd`);
  return response.data[coingeckoId].usd;
}

module.exports = { 
  checkTransfers,
  getLatestBlockNumber,
  getTokenTransfers,
  getTransactionReceipt,
  getToken0Address,
  getSeedTokenPrice
};