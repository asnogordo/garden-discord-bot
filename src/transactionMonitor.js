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

async function getTokenTransfers(fromBlock, toBlock, maxRetries = 5) {
  let attempt = 0;
  
  while (attempt < maxRetries) {
    attempt++;
    
    try {
      console.log(`Attempting to fetch transfers (attempt ${attempt}/${maxRetries})`);
      
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