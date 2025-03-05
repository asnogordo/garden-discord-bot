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
    const currentBlock = await getLatestBlockNumber();
    if (highestCheckedBlock === 0) {
      // Start from a more recent block to avoid huge initial sync
      highestCheckedBlock = currentBlock - 1000; 
      console.log(`Initializing highestCheckedBlock to ${highestCheckedBlock}`);
    }
    
    if (currentBlock <= highestCheckedBlock) {
      console.log(`No new blocks to process. Current: ${currentBlock}, Last checked: ${highestCheckedBlock}`);
      return;        
    }
    
    console.log(`Processing blocks from ${highestCheckedBlock + 1} to ${currentBlock}`);
    
    // Process in smaller chunks
    const maxBlocksPerRequest = 500;
    let processedBlock = highestCheckedBlock;
    
    // Create a set to track processed transactions in this batch
    const processedInBatch = new Set();
    
    // Only fetch token price once if we need it
    let tokenPrice = null;
    
    while (processedBlock < currentBlock) {
      const nextBlock = Math.min(processedBlock + maxBlocksPerRequest, currentBlock);
      
      try {
        console.log(`Fetching transfers for blocks ${processedBlock + 1} to ${nextBlock}`);
        const transfers = await getTokenTransfers(processedBlock + 1, nextBlock);
        
        if (!Array.isArray(transfers)) {
          console.error('Invalid transfers data received from API:', transfers);
          processedBlock = nextBlock;
          continue;
        }
        
        if (transfers.length === 0) {
          console.log(`No transfers found in blocks ${processedBlock + 1} to ${nextBlock}`);
          processedBlock = nextBlock;
          continue;
        }
        
        console.log(`Found ${transfers.length} transfers in blocks ${processedBlock + 1} to ${nextBlock}`);
        
        // Check if we need token price for this batch
        const hasLargeTransfer = transfers.some(transfer => 
          Number(transfer.value) >= LARGE_STAKE_AMOUNT
        );
        
        if (hasLargeTransfer && tokenPrice === null) {
          console.log('Fetching token price for large transfers');
          tokenPrice = await getSeedTokenPrice();
          console.log(`Current token price: $${tokenPrice}`);
        }
        
        // Process transfers
        for (const transfer of transfers) {
          const amount = parseFloat(transfer.value) / 1e18;
          const usdValue = tokenPrice !== null ? amount * tokenPrice : 0;
          const txHash = transfer.hash;
          
          const displayText = `${txHash.substring(0, 6)}...${txHash.substring(txHash.length - 4)}`;
          
          // Skip if already processed either globally or in this batch
          if (processedTransactions.has(txHash) || processedInBatch.has(txHash)) {
            console.log(`Transaction ${displayText} has already been processed.`);
            continue;
          }
          
          processedTransactions.add(txHash);
          processedInBatch.add(txHash);
          
          console.log(`Processing transaction ${displayText}, amount: ${amount}`);
          
          if (transfer.to.toLowerCase() === STAKING_CONTRACT_ADDRESS.toLowerCase() && amount >= LARGE_STAKE_AMOUNT) {
            console.log(`Found large stake: ${amount} tokens ($${usdValue.toFixed(2)})`);
            const embed = new EmbedBuilder()
              .setTitle('🌸 Large SEED 🌱 Stake 🌸')
              .addFields([
                { name: 'SEED 🌱 Staked', value: amount.toString() },
                { name: 'USD Value 💵', value: `$${usdValue.toFixed(2)}` },
                { name: 'Tx Hash', value: `[${displayText}](https://arbiscan.io/tx/${txHash})` }
              ]);
            sendAlert(client, embed, CHANNEL_ID);
          } else if (amount >= LARGE_SWAP_AMOUNT) {
            const receipt = await getTransactionReceipt(transfer.hash);
            const isSwap = receipt.logs.some(log => 
              log.address.toLowerCase() === UNISWAP_POOL_ADDRESS.toLowerCase() && 
              log.topics[0] === web3.utils.sha3('Swap(address,address,int256,int256,uint160,uint128,int24)')
            );
            
            if (isSwap) {
              // Process swap (existing swap handling code)
              // ...
            } else {
              console.log(`Found large transfer: ${amount} tokens ($${usdValue.toFixed(2)})`);
              const embed = new EmbedBuilder()
                .setTitle('🌸 Large SEED 🌱 Transfer 🌸')
                .addFields([
                  { name: 'SEED 🌱 Transferred', value: amount.toString() },
                  { name: 'USD Value 💵', value: `$${usdValue.toFixed(2)}` },
                  { name: 'Tx Hash', value: `[${displayText}](https://arbiscan.io/tx/${txHash})` }
                ]);
              sendAlert(client, embed, CHANNEL_ID);
            }
          }
        }
        
      } catch (error) {
        console.error(`Error processing blocks ${processedBlock + 1} to ${nextBlock}:`, error);
      }
      
      processedBlock = nextBlock;
    }
    
    // Update the highest checked block only after successful processing
    highestCheckedBlock = currentBlock;
    console.log(`Updated highestCheckedBlock to ${highestCheckedBlock}`);
    
  } catch (error) {
    console.error('Error in checkTransfers:', error);
  }
}

async function getLatestBlockNumber() {
  const response = await axios.get(`https://api.arbiscan.io/api?module=proxy&action=eth_blockNumber&apikey=${ARBISCAN_API_KEY}`);
  return parseInt(response.data.result, 16);
}

async function getTokenTransfers(startBlock, endBlock) {
  const maxRetries = 5;
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      console.log(`Attempting to fetch transfers (attempt ${retries + 1}/${maxRetries})`);
      const response = await axios.get(
        `https://api.arbiscan.io/api?module=account&action=tokentx&contractaddress=${TOKEN_ADDRESS}&startblock=${startBlock}&endblock=${endBlock}&sort=asc&apikey=${ARBISCAN_API_KEY}`,
        { 
          timeout: 15000 // 15 second timeout
        }
      );
      
      // Check if the response contains an error message
      if (response.data.status === '0') {
        throw new Error(`API Error: ${response.data.message}`);
      }
      
      // If the result is null or undefined, return an empty array instead
      return Array.isArray(response.data.result) ? response.data.result : [];
      
    } catch (error) {
      retries++;
      const isTimeoutError = error.code === 'ECONNABORTED' || 
                            (error.response && error.response.status === 524);
      
      console.error(`API request failed (${isTimeoutError ? 'timeout' : error.message})`);
      
      if (retries === maxRetries) {
        console.error(`Maximum retries (${maxRetries}) reached. Giving up.`);
        return []; // Return empty array instead of throwing
      }
      
      // Exponential backoff with jitter
      const baseDelay = Math.pow(2, retries) * 1000;
      const jitter = Math.random() * 1000;
      const delay = baseDelay + jitter;
      
      console.log(`Retrying in ${Math.round(delay/1000)} seconds. Attempt ${retries}/${maxRetries}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return []; // Fallback return if we somehow exit the loop
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