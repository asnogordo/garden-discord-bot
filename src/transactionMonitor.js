const { Web3 } = require('web3');
const { EmbedBuilder } = require('discord.js');
const axios = require('axios');
const { 
  TOKEN_ADDRESS, STAKING_CONTRACT_ADDRESS, UNISWAP_POOL_ADDRESS, 
  UNISWAP_POOL_ABI, LARGE_SWAP_AMOUNT, LARGE_STAKE_AMOUNT, WEB3_PROVIDER,
  ARBISCAN_API_KEY, CHANNEL_ID
} = require('./config');
const { sendAlert } = require('./discordUtils');
const { createTransferEmbed, createStakeEmbed, createSwapEmbed } = require('./embeds');


const web3 = new Web3(WEB3_PROVIDER);

let highestCheckedBlock = 0;
const processedTransactions = new Set();

let client; // Declare a variable to hold the client

async function checkTransfers(client) {
  try {
    // Statistics tracking
    const stats = {
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
    
    // Get current block number
    const currentBlock = await getLatestBlockNumber();
    stats.apiCallsMade++;
    
    // Initialize if first run
    if (highestCheckedBlock === 0) {
      highestCheckedBlock = currentBlock - 500; 
      console.log(`Initializing from block ${highestCheckedBlock}`);
      return; // Exit after initialization to avoid immediate processing
    }
    
    // Skip if no new blocks
    if (currentBlock <= highestCheckedBlock) {
      console.log(`No new blocks yet. Current: ${currentBlock}, Last: ${highestCheckedBlock}`);
      return;        
    }
    
    stats.totalBlocksToProcess = currentBlock - highestCheckedBlock;
    console.log(`Starting processing of ${stats.totalBlocksToProcess} new blocks (${highestCheckedBlock + 1} to ${currentBlock})`);
    
    // Process in smaller chunks with longer delays
    const maxBlocksPerRequest = 100; // Smaller chunks
    let processedBlock = highestCheckedBlock;
    
    // Only fetch token price when needed
    let tokenPrice = null;
    
    // Process blocks in chunks with rate limiting
    while (processedBlock < currentBlock) {
      const nextBlock = Math.min(processedBlock + maxBlocksPerRequest, currentBlock);
      const rangeStart = processedBlock + 1;
      const rangeEnd = nextBlock;
      
      try {
        // Add substantial delay between API calls to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const transfers = await getTokenTransfers(rangeStart, rangeEnd);
        stats.apiCallsMade++;
        
        // If we got a rate limit response, pause and save progress
        if (!transfers) {
          console.error(`Rate limited. Saving progress at block ${processedBlock}`);
          stats.errorCount++;
          highestCheckedBlock = processedBlock;
          
          // Log summary of what was completed before the rate limit
          logSummary(stats);
          return; // Exit the function and try again next cycle
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
        
        // If empty result or not an array, just continue to next chunk
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
            tokenPrice = await getSeedTokenPrice();
            stats.apiCallsMade++;
          } catch (priceError) {
            console.error('Failed to get token price:', priceError.message);
            stats.errorCount++;
            tokenPrice = 0; // Use 0 as fallback
          }
        }
        
        // Process transfers with lightweight tracking
        for (const transfer of transfers) {
          const txHash = transfer.hash;
          
          // Skip if already processed
          if (processedTransactions.has(txHash)) {
            continue;
          }
          
          // Add to processed set
          processedTransactions.add(txHash);
          
          // Convert to human-readable amount
          const amount = parseFloat(web3.utils.fromWei(transfer.value, 'ether'));
          const usdValue = tokenPrice ? amount * tokenPrice : 0;
          const displayText = `${txHash.substring(0, 6)}...${txHash.substring(txHash.length - 4)}`;
          
          // Process large stakes
          if (transfer.to.toLowerCase() === STAKING_CONTRACT_ADDRESS.toLowerCase() && 
              amount >= LARGE_STAKE_AMOUNT) {
            console.log(`Large stake: ${amount} SEED ($${usdValue.toFixed(2)}) in block ${transfer.blockNumber}`);
            stats.largeStakesFound++;
            rangeStats.largeStakeCount++;
            
            const embed = createStakeEmbed(amount, usdValue, txHash, displayText);
            sendAlert(client, embed, CHANNEL_ID);
            continue;
          }
          
          // Process large transfers/swaps
          if (amount >= LARGE_SWAP_AMOUNT) {
            try {
              // Check if this is a swap (only if amount is large enough to care)
              const receipt = await getTransactionReceipt(txHash);
              stats.apiCallsMade++;
              await new Promise(resolve => setTimeout(resolve, 500)); // Avoid rate limits
              
              const isSwap = receipt.logs.some(log => 
                log.address.toLowerCase() === UNISWAP_POOL_ADDRESS.toLowerCase() && 
                log.topics[0] === web3.utils.sha3('Swap(address,address,int256,int256,uint160,uint128,int24)')
              );
              
              if (isSwap) {
                console.log(`Large swap: ${amount} SEED ($${usdValue.toFixed(2)}) in block ${transfer.blockNumber}`);
                stats.largeSwapsFound++;
                rangeStats.largeSwapCount++;
                const embed = createSwapEmbed(amount, usdValue, txHash, displayText);
                sendAlert(client, embed, CHANNEL_ID);
              } else {
                console.log(`Large transfer: ${amount} SEED ($${usdValue.toFixed(2)}) in block ${transfer.blockNumber}`);
                stats.largeTransfersFound++;
                rangeStats.largeTransferCount++;
                const embed = createTransferEmbed(amount, usdValue, txHash, displayText);
                sendAlert(client, embed, CHANNEL_ID);
              }
            } catch (receiptError) {
              console.error(`Failed to get receipt for ${displayText}:`, receiptError.message);
              stats.errorCount++;
              // Continue despite error - we'll just miss this one transaction
            }
          }
        }
        
        // Add this range to summary
        stats.summaryByRange.push(rangeStats);
        
      } catch (chunkError) {
        console.error(`Error processing chunk ${rangeStart} to ${rangeEnd}:`, chunkError.message);
        stats.errorCount++;
        // Wait a bit longer after errors
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Update processed block counter
      processedBlock = nextBlock;
      stats.blocksProcessed += (rangeEnd - rangeStart + 1);
      
      // Clean up the processedTransactions set occasionally to prevent memory leaks
      if (processedTransactions.size > 1000) {
        const oldestEntries = Array.from(processedTransactions).slice(0, 500);
        oldestEntries.forEach(tx => processedTransactions.delete(tx));
      }
    }
    
    // Only update the highest checked block after successful processing
    highestCheckedBlock = currentBlock;
    
    // Log the summary
    logSummary(stats);
    
  } catch (error) {
    console.error('Error in checkTransfers:', error.message);
    // Don't update highestCheckedBlock on error
  }
}

// Function to log a nicely formatted summary
function logSummary(stats) {
  const endTime = new Date();
  const durationMs = endTime - stats.startTime;
  const durationSec = (durationMs / 1000).toFixed(2);
  
  console.log('\n======= TRANSACTION MONITOR SUMMARY =======');
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
  
  // Group consecutive ranges with 0 transfers
  let currentEmptyRange = null;
  
  stats.summaryByRange.forEach((range, index) => {
    // If this range has transfers or significant events, print it
    if (range.transferCount > 0 || 
        range.largeTransferCount > 0 || 
        range.largeStakeCount > 0 || 
        range.largeSwapCount > 0) {
      
      // Print any accumulated empty range before this
      if (currentEmptyRange) {
        console.log(`Blocks ${currentEmptyRange.startBlock} - ${currentEmptyRange.endBlock}: No transactions found`);
        currentEmptyRange = null;
      }
      
      // Print this range with details
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
      // This is an empty range - accumulate it
      if (!currentEmptyRange) {
        currentEmptyRange = {
          startBlock: range.startBlock,
          endBlock: range.endBlock
        };
      } else {
        // Extend the current empty range
        currentEmptyRange.endBlock = range.endBlock;
      }
    }
  });
  
  // Print any final empty range
  if (currentEmptyRange) {
    console.log(`Blocks ${currentEmptyRange.startBlock} - ${currentEmptyRange.endBlock}: No transactions found`);
  }
  
  console.log('===========================================\n');
}

async function getLatestBlockNumber() {
  const response = await axios.get(`https://api.arbiscan.io/api?module=proxy&action=eth_blockNumber&apikey=${ARBISCAN_API_KEY}`);
  return parseInt(response.data.result, 16);
}

async function getTokenTransfers(fromBlock, toBlock, maxRetries = 5) {
  let attempt = 0;
  
  while (attempt < maxRetries) {
    attempt++;
    
    try {      
      const response = await axios.get(
        `https://api.arbiscan.io/api?module=account&action=tokentx&contractaddress=${TOKEN_ADDRESS}&startblock=${fromBlock}&endblock=${toBlock}&sort=asc&apikey=${ARBISCAN_API_KEY}`,
        { 
          timeout: 15000 // 15 second timeout
        }
      );
      
      // Return the result from a successful API call
      return response.data.result || [];
      
    } catch (error) {
      // Check if the error is "No transactions found"
      if (error.response?.data?.message === "No transactions found" || 
          error.message?.includes("No transactions found")) {
        console.log(`No transactions found in blocks ${fromBlock} to ${toBlock}`);
        return []; // Return empty array as a valid response
      }
      
      // For other errors, retry with backoff
      console.error(`API request failed (${error.message})`);
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Retrying in ${delay / 1000} seconds. Attempt ${attempt}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error(`Maximum retry attempts reached. Unable to fetch transfers.`);
        throw error; // Re-throw after all retries fail
      }
    }
  }
}

async function getTransactionReceipt(txHash) {
  return await web3.eth.getTransactionReceipt(txHash);
}
async function getToken0Address(poolAddress) {
  const poolContract = new web3.eth.Contract(UNISWAP_POOL_ABI, poolAddress);
  return await poolContract.methods.token0().call();
}
async function getSeedTokenPrice() {
  const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=garden-2&vs_currencies=usd');
  return response.data['garden-2'].usd;
}

module.exports = { 
  checkTransfers,
  getLatestBlockNumber,
  getTokenTransfers,
  getTransactionReceipt,
  getToken0Address,
  getSeedTokenPrice
 };