// messageHandlers.js - main message mangement file
const { DMChannel, MessageType, EmbedBuilder, ChannelType, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits } = require('discord.js');
const cowsay = require('cowsay');
const { 
  GM_CHANNEL_ID, SUPPORT_CHANNEL_ID, SCAM_CHANNEL_ID, BASE_ROLE_ID, CHANNEL_ID, EXCLUDED_CHANNELS,
  EXCLUDED_CHANNEL_PATTERNS,PROTECTED_ROLE_IDS
} = require('./config');
const { codeBlock, helloMsgReply, pickFromList, isLikelyQuestion,canBeModerated } = require('./utils');
const { 
  ADDRESSES_EMBEDDED_MSG, 
  createWarningMessageEmbed
} = require('./embeds');

// Compile regex patterns once at startup
const excludedPatterns = EXCLUDED_CHANNEL_PATTERNS.map(pattern => new RegExp(pattern));

const suspectedScammers = new Map();
const SCAMMER_TIMEOUT_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds
const MAX_MENTIONS = 4; // Maximum number of mentions allowed before action is taken
const MENTION_COOLDOWN = 10 * 60 * 1000; // 10 minutes cooldown for mention count
const MAX_SPAM_OCCURRENCES = 7; // Maximum number of spam occurrences before taking action
const ALLOWED_DOMAINS = [
  'garden.finance',
  'x.com',
  'tenor.com',
  'giphy.com',
  'gfycat.com',
  'media.giphy.com',
  'media.tenor.com',
  'media.discordapp.net', // Discord's CDN for attachments
  'cdn.discordapp.com',   // Discord's CDN
  'images-ext-1.discordapp.net',
  'images-ext-2.discordapp.net',
  'soundcloud.com',
  'i.scdn.co',
  'p.scdn.co',
  'spotify.com',
  'youtube.com',
  'youtu.be',
  'www.youtube.com',
  'youtube-nocookie.com',
  'm.youtube.com',
  'dune.com'
];

const URL_SHORTENERS = [
  'bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'is.gd', 'buff.ly', 'ow.ly', 
  'tr.im', 'dsc.gg', 'adf.ly', 'tiny.cc', 'shorten.me', 'clck.ru', 'cutt.ly',
  'rebrand.ly', 'short.io', 'bl.ink', 'snip.ly', 'lnk.to', 'hive.am',
  'shor.by', 'bc.vc', 'v.gd', 'qps.ru', 'spoo.me', 'x.co', 'yourls.org',
  'shorturl.at', 'tny.im', 'u.to', 'url.ie', 'shrturi.com', 's.id',
  'tr.ee', 'kutt.it', 'dub.sh', 'soo.gd', 'qr.ae', 'tothe.link',
  'san.aq', 'KurzeLinks.de', 'lstu.fr', 'bitly.pk'
];

const suspiciousUserThreads = new Map();
const processingMessages = new Map();
const PROCESSING_TIMEOUT = 30000; // 30 seconds max processing time

let dailyInterceptCount = 0;
let lastReportTime = new Date().setHours(0, 0, 0, 0);

//message locking to reduce race conditions
const processingLock = new Set();

// Regex patterns
const noGmAllowed = /^\s*(gn|gm)\s*$/i;
const noHello = /^(hi+|hey|hello|h?ola)!?\s*$/i;
const secretChannel = /^!join$/;

const userDisplayName = [
  /announcement/i,
  /📢/,
  /^PENDLE$/i,
];

const scamPatterns = [
  /refer to the admin/i,
  /\[OPEN-TICKET\]/i,
  /(?:SUBMIT|CREATE|OPEN)[\s-]*(?:QUERY|TICKET)/i,
  /to complain to team/i,
  /dsc\.gg\//i,
  /discord\.gg\/[a-zA-Z0-9]+\s*@/i,
  /https?:\/\/.*\s*@[a-zA-Z0-9]+/i,
  /airdrop is live now/i,
  /collaborated with opensea/i,
  /claim as soon as possible/i,
  /this is an automatically generated announcement message/i,
  /earn \$?\d+k or more within \d+ hours/i,
  /you will pay me \d+% of your profit/i,
  /(only interested people should apply|drop a message|let's get started by asking)/i,
  /WhatsApp \+\d{1,3} \d{4,}/i,
  /how to earn|how to make money|make \$\d+k/i,
  /I\u2019ll teach \d+ people to earn/i,
  /server representative/i,
  /support representative/i,
  /JUICE AIR-DROP/i,
  /live NOW/i,
  /juice-foundation.org/i,
  /Get your free tokens/i,
  // Job scam patterns
  /(?:[А-Яа-яЁё]|\u0430|\u043E|\u0435|\u0440|\u0441|\u0443|\u0445|\u0432|\u043C){3,}/i,
  /\b(?:looking|hiring|seeking|need)\s+(?:for\s+)?(?:employees|staff|team members|workers)\b/i,
  /(?:\$\d+(?:[-+]?\d+)?\/(?:hour|hr|week|month|day)|(?:\d+[-+]?\d+)?\s*(?:USD|EUR)\/(?:hour|hr|week|month|day))/i,
  /(?:no|without)\s+(?:exp(?:erience)?|quals?|qualifications?)\s+(?:req(?:uired)?|needed)/i,
  /(?:reach|contact|message|dm)\s+(?:me|us|admin)\s+(?:via|through|by|using)\s+(?:dm|pm|telegram|discord|email)/i,
  /send\s+(?:me|us)?\s+(?:a\s+)?friend\s+req(?:uest)?/i,
  /\b(?:dev(?:eloper)?s?|testers?|analysts?|writers?|moderators?|designers?)\s+(?:\$\d+[-+]?\d*[kK]?\+?\s*\/\s*(?:week|month|year)|needed)/i,
  /platform\s+(?:looking|hiring|searching|seeking)\s+for/i,
  /\b(?:AI|ML|DeFi|Crypto|NFT|Web3)\s+(?:platform|project|company)\s+(?:hiring|recruiting|looking)/i,
  /\b(?:dm|support|support ticket)\b(?!.*#raise-a-ticket)/i,
  /create a ticket .* https:\/\/discord\.com\/invite\//i,
  /create a ticket .* https:\/\/discord\.gg\//i,
  /\b(?:reach out to|contact) .* (?:live support|support desk)\b/i,
  /\b(?:support_ticket|support ticket|ticket).+(?:discord\.gg|discord\.com\/invite)/i,
  /\b(?:for all|for prompt|for any|for) (?:faq|questions|assistance|help|support).+(?:discord\.gg|discord\.com\/invite)/i,
  /(?:discord\.gg|discord\.com\/invite).+(?:\[#[^\]]+\]|\(>\s*https)/i,
  /create-?t!?cket.*https/i,
  /check my ticket.*(?:https|discord\.com\/invite)/i,
  /submit query.*https/i,
  /request(?:_| )(?:support|assistance).*(?:https|discord\.com\/invite)/i,
  /unclaimed airdrop.*https/i,
  /paper handed.*(?:claim|airdrop).*https/i,
  /fomo-diamondhands/i,
  /(?:support|ticket|assistance).*discord\.com\/invite/i,
  /discord\.com\/invite\/.*(?:submit|query|support|ticket)/i,
  /create.*ticket.*(?:https|discord\.gg)/i,
  /(?:👆|👇|👉).*https/i,
  /https.*(?:👆|👇|👉)/i,
];

const urlPattern = /https?:\/\/([^\/\s]+)([^\s]*)/gi;
const plainDomainPattern = /(?<![.@\w])((?:\w+\.)+(?:com|org|net|io|finance|xyz|app|dev|info|co|gg|in|ca|us|uk|edu|gov|biz|me|tv|ai|so|tech|store|shop|app|cloud|de|fr|jp|ru|cn|au|nl|se|br|it|es|eu|nz|at|ch|pl|kr|za|crypto|eth|nft|dao|bitcoin|defi|chain|wallet))\b/gi;const internalUrl = /(?<!https?:\/\/)(?:www\.)?(discord\.(?:com|gg)|discord(?:app)?\.com)(\S*)/i;
const howToStakeOrClaim = /.*(?:how|where).*(?:(?:stake|staking|earn|claim).*(?:btc|bitcoin|rewards?|seed)|(?:btc|bitcoin|rewards?).*(?:stake|staking|earn|claim)|(?:get|receive).*(?:staking|staked).*(btc|bitcoin|rewards?)).*/i;
const howToGetSeed = /(?:how|where).*(?:get|buy|purchase|acquire|swap for).*seed\??/i;
const wenVote = /.*(wh?en) .*(vote|voting).*/i;
const wenMoon = /.*(wh?en|where).*moon.*/i;
const wenLambo = /.*(wh?en|where).*lambo.*/i;
const wenNetwork = /.*wh?en\s+(optimism|op|binance|bnb|gnosis|avax|avalanche|sol|hyper|solana|monad|hyperliquid|hl).*/i;
const meaningOfLife = /.*meaning of life.*/i;
const contractAddress = /(?:.*(?:contract|token).*address.*)|(?:.*seed.*(?:contract|token|address).*)|(?:.*address.*(?:for|of).*seed.*)/i;
const totalSupply = /.*(total|max|maximum|token|seed) supply.*/i;
const wenDuneAnalytics = /.*(wh?en|where).*(dune|analytics).*/i;
const wenDefillama = /.*(?:defi.?llama|defillama|tvl).*/i;
const wenDude = /.*(wh?en|where).*(dude).*/i;
const wenStake = /.*(wh?en) .*(stake|staking).*/i;
const stakingIssues = /\b(stake|staking)\b(?!.*\b(?:no|resolved?|fixed?)\b)(?!.*\b(?:how|what|when|where|why|anyone)\b).*\b(?:rewards?\s+(?:not?|missing)|error|issue|problem|stuck|fail(?:ed|ing)?|unable)\b/i;
const swapIssues = /\b(?:swap(?:ping)?|exchange|convert(?:ing)?)\b(?!.*\b(?:no|resolved?|fixed?)\b)(?!.*\b(?:how|what|when|where|why|anyone)\b).*\b(?:no[t]?\s+(?:prompt|working)|can't\s+connect|trouble|error|issue|problem|fail(?:ed|ing)?|stuck)\b/i;
const claimingIssues = /\b(?:claim(?:ing)?)\b(?!.*\b(?:no|resolved?|fixed?)\b)(?!.*\b(?:how|what|when|where|why|anyone)\b).*\b(?:not?\s+work(?:ing)?|error|issue|problem|fail(?:ed|ing)?|stuck)\b/i;
const transactionIssues = /\b(?:transaction|refund|sent|transfer|overpaid|payment)\b(?!.*\b(?:no|resolved?|fixed?)\b)(?!.*\b(?:how|what|when|where|why|anyone|to|is)\b).*\b(?:issue|problem|error|stuck|fail(?:ed|ing)?|missing|lost|pending)\b/i;
const orderIssues = /\b(?:order)\b(?!.*\b(?:no|resolved?|fixed?)\b)(?!.*\b(?:how|what|when|where|why|anyone)\b).*\b(?:stuck|pending|fail(?:ed|ing)?|issue|problem|long time)\b/i;
const gardenExplorer = /(?:wh?(?:ere|at|en)|how|can|do I|is|find|see|check|get|open|access|view|use|link to)(?:\s+\w+){0,5}\s+(?:garden\s*)?(?:explorer|tx\s*explorer|transaction\s*explorer)/i;
const metricsAnalytics = /(?:how|where|what|which|can|is there).*(?:(?:check|see|find|view|get)\s+(?:garden|seed)?\s*(?:analytics|metrics|stats|statistics|volume|data|chart|graph|dashboard|numbers|tvl))|(?:defi.?llama|dune\s*analytics|explorer)/i;

// GIF lists
const wenMoonGifs = [
  'https://c.tenor.com/YZWhYF-xV4kAAAAd/when-moon-admin.gif',
  'https://c.tenor.com/R6Zf7aUegagAAAAd/lambo.gif',
  'https://c.tenor.com/1vXRFJxqIVgAAAAC/tenor.gif',
  'https://c.tenor.com/XIr-1aBPoCEAAAAC/tenor.gif'
];

const wenLamboGifs = [
  'https://c.tenor.com/_dae-kRV6jUAAAAS/lambo-cardboard.gif',
  'https://c.tenor.com/R6Zf7aUegagAAAAd/lambo.gif',
];

const meaningOfLifeGifs = [
  'https://pa1.narvii.com/6331/0e0ef4cfaf24742e0ca39e79a4df2a1aff6f928c_hq.gif',
  'https://i.giphy.com/media/dYgDRfc61SGtO/giphy.webp',
  'https://i.giphy.com/media/OY9XK7PbFqkNO/giphy.webp',
  'https://c.tenor.com/Qc-OTTAsDnAAAAAd/tenor.gif'
];

const workingOnItGifs = [
  'Soon™\nhttps://c.tenor.com/RXGEDEM_odoAAAAC/tenor.gif',
  'Soon™\nhttps://c.tenor.com/GS--K_H775kAAAAC/tenor.gif',
  'Soon™\nhttps://c.tenor.com/OiuNG8MQKkYAAAAC/tenor.gif',
  'Soon™\nhttps://c.tenor.com/W42sxw9yTZkAAAAC/tenor.gif',
  'Soon™\nhttps://c.tenor.com/1ZPySWYcQkAAAAAC/tenor.gif',
  'Soon™\nhttps://c.tenor.com/vo2C5ig9SIMAAAAd/tenor.gif',
  'Soon™\nhttps://c.tenor.com/CmogjUfSyckAAAAd/tenor.gif'
];

const wenDudeGifs = [
  'https://c.tenor.com/FC_My5JT638AAAAC/tenor.gif',
  'https://c.tenor.com/GscrdOO29OUAAAAd/tenor.gif',
  'https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExcWZnaWkyOTQ2aDE3ZWgzejB1bnFhM3JrZGFxdWZtNXpwbmljbDljaCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/lnDvZtsnWfnnX4T0KA/giphy-downsized-large.gif',
  'https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExdGl6NTdwemdzNDM0eDVha3I1eXFraWU2ZXVreXQ1MmJlY2Q3MHc0ayZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/J6JDizWgG3bX704JEU/giphy-downsized-large.gif',
  'https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExaWdpZ3U3b3pzb3RmOHB4cHpkZ2s0NDczYXdzbmZ5NGpyMmt1bjRjaiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3o7bueYrEU0GcwzTKo/giphy.gif',
  'https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExdTR1ZDk2ZGRjNWhidzl2djUxM3U1bG9pODV4NDhsNHFhNXVraTR4ZyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/hzrvwvnbgIV6E/giphy.gif',
];

const celebratoryGifs = [
  'https://i.giphy.com/l0MYt5jPR6QX5pnqM.webp',
  'https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3hmNmJhZnM1ZjB2dHB0cGgyczBwdjk0bmNoZzk5M3RsdXlvbDY1aiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/x3ijPhltY1z7EGdxGT/giphy.gif',
  'https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExNmE0dGk4am9kdG04MWV6bjV1NDJjeHJ4ZGNoaHlvYjRmeHExMzlycyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/MWDLf1EIUsoNy/giphy.gif',
  'https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExeGFsODljZ3Fsbmxnd2JmOTk0bnFiNTk1bHRxc3duNGdjZTM1cG5lZiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/GXMuvJXWVqGiY/giphy.gif',
  'https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExNWJsOHlwdDN2Z3cwemtoZTJrYW04bzJteW00ZGI0b2J4MDJxcGUwayZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/smTkxYsx9cQK9BNbW0/giphy.gif',
  'https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ3VmZHVhY3ZuNThzdzZreGZvdWxvejl0YnM0bmdtZWZtdjZpaWh4MSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/40M8MH9x9lDxaHA51d/giphy.gif',
  'https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExd21ld2ptM2F0czVpeWpwcTV5ZjMwYmZyc3J3aG5wZXUyOWxnd3lpcCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/k9yS4LbpiVmtG/giphy.gif',
  'https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExZGdnOTcwZ2dnOGVubTl1djY5MXMyMHQzbGJrNDNxeTBuN2NqOWZ2OCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/NrhcCwwbVHwpyEZSqH/giphy.gif',
  'https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ3ZodW9tYXNwbThyOGxyZG16ZXNjcHlhcWhubm1xeXhtNWcydTVubiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/4LsN0YwgIsvaU/giphy.gif',
  'https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExMmg2NGJicjA3ZHA0Ym5ia2Y1MTc5ZWZvbnM5cTQxMTJvYWw1ZnlwdSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/8nM6YNtvjuezzD7DNh/giphy.gif'
];

const pickMoon = pickFromList(wenMoonGifs);
const pickLambo = pickFromList(wenLamboGifs);
const pickMeaningOfLife = pickFromList(meaningOfLifeGifs);
const pickWorkingOnIt = pickFromList(workingOnItGifs);
const pickDude = pickFromList(wenDudeGifs);

// Map to store recent messages
const recentMessages = new Map();

async function handleMessage(message) {
  const messageId = message.id;
  const now = Date.now();
  
  // Clean up stale locks (messages that started processing > 30 seconds ago)
  for (const [id, timestamp] of processingMessages.entries()) {
    if (now - timestamp > PROCESSING_TIMEOUT) {
      console.log(`Removing stale lock for message ${id}`);
      processingMessages.delete(id);
    }
  }
  
  // Skip if message is already being processed
  if (processingMessages.has(messageId)) {
    return;
  }

  // Add to processing
  processingMessages.set(messageId, now);

  try {
    // Process the message asynchronously
    const { author, content, member, channel, guild } = message;

    // Run checks in parallel when possible
    const [isExcluded, isProtected] = await Promise.all([
      isChannelExcluded(channel),
      member ? hasProtectedRole(member) : Promise.resolve(false)
    ]);

    if (isExcluded) {
      return;
    }
    
    if (message.author.bot) {
      console.log('Do not reply to bots', message.author.tag);
      return;
    }

    // Improve message type checking - only do this check once
    if (message.type !== MessageType.Default && message.type !== MessageType.Reply) {
      console.log('Not processing message type:', message.type);
      return;
    }

    if (channel.type === ChannelType.DM) {
      message.reply(
        codeBlock(cowsay.say({ text: "I am a bot and can't reply, beep bop" })),
      );
      return;
    }

    // Process messages for non-protected users
    if (!isProtected) {
      // First check for unauthorized URLs
      const hasUnauthorizedUrls = hasUnauthorizedUrl(message, guild);
      
      // If there are unauthorized URLs, handle them
      if (hasUnauthorizedUrls) {
        await handleUnauthorizedUrl(message);
        return;
      }
      
      // Then proceed with scam detection, which can assume URLs are already validated
      await handleScamMessage(message);
      
      // Check if message was deleted by scam handler
      try {
        await message.channel.messages.fetch(message.id);
      } catch (e) {
        // Message was deleted, stop processing
        return;
      }
    }
    
    if (wenMoon.test(message.content)) {
      await message.reply(pickMoon());
    } else if (wenLambo.test(message.content)) {
      await message.reply(pickLambo());
    } else if (meaningOfLife.test(message.content)) {
      await message.reply(pickMeaningOfLife());
    } else if (wenNetwork.test(message.content)) {
      await message.reply(pickWorkingOnIt());
    } else if (wenDuneAnalytics.test(message.content)) {
      await message.reply(
        "Check out the official dune dashboard 📊 here: <https://dune.com/garden_finance/gardenfinance>"
      );
    } else if (wenDude.test(message.content)) {
      await message.reply(pickDude());
    } else if (wenStake.test(message.content)) {
      await message.reply(
        'You can stake in increments of 2,100 SEED for 6 month, 12 month, 24 months, 48 months or permanently.\nYou can also burn 21,000 SEED for an Gardener Pass NFT for maximum voting power.\n\n For more info, and to start staking, visit <https://app.garden.finance/stake/>.'
      );
    } else if (wenVote.test(message.content)) {
      await message.reply(
        'Garden Snapshot can be found at <https://snapshot.org/#/gardenfinance.eth>. SEED stakers will eventually be able to vote on their favorite fillers. For more details, check out <https://garden.finance/blog/market-making-and-staking/>',
      );
    } else if (contractAddress.test(message.content)) {
      await message.channel.send({ embeds: [ADDRESSES_EMBEDDED_MSG] });
    } else if (totalSupply.test(message.content)) {
      await message.reply(
        "SEED's total supply is 147,000,000.\n\nKeep in mind not everything will be in circulation at launch. For more info, check <https://garden.finance/blog/wbtc-garden-introducing-seed/>",
      );
    } else if (howToGetSeed.test(message.content)) {
      await message.reply(
        "You can swap for SEED on Cowswap 🐮\n\n" +
        "**Ethereum:**\n" +
        "<https://swap.cow.fi/#/1/swap/WETH/0x5eed99d066a8CaF10f3E4327c1b3D8b673485eED>\n\n" +
        "View the ERC20 contract address for SEED on Etherscan: <https://etherscan.io/token/0x5eed99d066a8CaF10f3E4327c1b3D8b673485eED>"
      );
    } else if (howToStakeOrClaim.test(message.content)) {
      await message.reply(
        "Stake SEED 🌱 to earn fees in BTC or to claim BTC rewards, visit <https://app.garden.finance/stake/>\n\n",
      );
    } else if (wenDefillama.test(message.content)) {
      await message.reply(
        "Garden's 🌸 Defillama page can be found here:\n<https://defillama.com/protocol/garden>",
      );
    } else if (gardenExplorer.test(message.content)) {
      await message.reply(
        "You can check your transaction status at Garden's explorer page 🌸: <https://explorer.garden.finance/>"
      );
    } else if (stakingIssues.test(message.content)) {
      await message.reply(`If you are having issues with staking, please open a support ticket in <#${SUPPORT_CHANNEL_ID}>.`);
    } else if (swapIssues.test(message.content)) {
      await message.reply(`If you're experiencing issues with an in progress swap, please open a support ticket in <#${SUPPORT_CHANNEL_ID}> and include your order ID.`);
    } else if (claimingIssues.test(message.content)) {
      await message.reply(`If you are having issues claiming $SEED, please open a support ticket in <#${SUPPORT_CHANNEL_ID}>.`);
    } else if (orderIssues.test(message.content) || transactionIssues.test(message.content)) {
      await message.reply(`If you have questions about a transaction or need help with a refund, please provide your order ID and open a support ticket in <#${SUPPORT_CHANNEL_ID}>`);
    } else if (metricsAnalytics.test(message.content) && isLikelyQuestion(message.content)) {
      await message.reply(
        "You can check Garden metrics on:\n\n" +
        "🔍 **Garden Explorer**: <https://explorer.garden.finance/>\n" +
        "📊 **Dune**: <https://dune.com/garden_finance/gardenfinance>\n" +
        "📈 **DefiLlama**: <https://defillama.com/protocol/garden>"
      );
    } 
  } catch (e) {
    console.error('Something failed handling a message', e);
  } finally {
    // Always remove from processing lock when done
    processingMessages.delete(messageId);
  }
}

// Check for common patterns in support/ticket scams
function isTargetedScamMessage(message, hasOnlyBaseRole, hasMentions, hasExternalUrl) {
  const hasSupportOrTicketTerms = /\b(?:support|ticket|assistance|help desk|live support|faq|questions)\b/i.test(message.content);
  const hasDmRequest = /\b(?:dm|message|reach out|contact)\s+(?:me|us|support|team)\b/i.test(message.content);
  const hasDiscordInvite = /(?:discord\.gg|discord\.com\/invite)/i.test(message.content);
  
  return (hasOnlyBaseRole && 
         (hasMentions && (hasExternalUrl || hasDmRequest)) ||
         (hasSupportOrTicketTerms && hasDiscordInvite));
}

function isSuspectedScammer(userId) {
  const scammer = suspectedScammers.get(userId);
  return scammer && scammer.timeout > Date.now();
}

async function handleScamMessage(message) {
  try {
    const { author, content, channel, member, guild } = message;
    const key = `${author.id}:${content}`;
    
    console.log(`\n==== SCAM CHECK: ${author.tag} ====`);
    console.log(`Message: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);
    console.log(`Channel: ${channel.name} (${channel.id})`);
    
    // Skip for users with protected roles
    if (hasProtectedRole(member)) {
      console.log(`SKIPPED: User has protected role`);
      return false;
    }

    // Get the bot's member object properly
    const botMember = message.guild.members.cache.get(message.client.user.id);
      
    // Check if we can moderate this user
    if (!canBeModerated(member, botMember)) {
      console.log(`SKIPPED: User cannot be moderated (higher role or missing permissions)`);
      return false;
    }

    // Run individual pattern checks with detailed logging
    console.log(`\n--- Running scam pattern checks ---`);
    
    // Check against scam patterns
    const matchedPatterns = [];
    for (let i = 0; i < scamPatterns.length; i++) {
      if (scamPatterns[i].test(content)) {
        matchedPatterns.push(i);
      }
    }
    
    const isScamContent = matchedPatterns.length > 0;
    console.log(`SCAM CONTENT CHECK: ${isScamContent ? 'MATCHED' : 'No match'}`);
    if (isScamContent) {
      console.log(`Matched patterns: ${matchedPatterns.join(', ')}`);
      matchedPatterns.forEach(i => {
        console.log(`Pattern ${i}: ${scamPatterns[i]}`);
      });
    }

    const urlObfuscation = detectUrlObfuscation(content);
    console.log(`URL OBFUSCATION CHECK: ${urlObfuscation.isObfuscated ? 'DETECTED' : 'Not detected'}`);
    if (urlObfuscation.isObfuscated) {
      console.log(`URL encoding: ${urlObfuscation.hasUrlEncoding}`);
      console.log(`Line breaks in URL: ${urlObfuscation.hasLineBreaksInUrl}`);
      console.log(`Invisible characters: ${urlObfuscation.hasInvisibleChars}`);
      console.log(`Unusual characters: ${urlObfuscation.hasUnusualChars}`);
    }
    
    // Check URL-related patterns
    const hasExternalUrl = !isAllowedUrl(content, guild);
    console.log(`EXTERNAL URL CHECK: ${hasExternalUrl ? 'FOUND' : 'Not found'}`);
    if (hasExternalUrl) {
      // Extract and log URLs
      const urlMatches = content.match(/https?:\/\/([^\/\s]+)([^\s]*)/gi) || [];
      urlMatches.forEach(url => console.log(`Found URL: ${url}`));
      
      // Also check plain domain matches
      const plainMatches = content.match(/(?<![.@\w])((?:\w+\.)+(?:com|org|net|io|finance|xyz|app|dev|info|co|gg))\b/gi) || [];
      plainMatches.forEach(domain => console.log(`Found domain: ${domain}`));
    }
    
    const hasDeceptiveUrlContent = hasDeceptiveUrl(content);
    console.log(`DECEPTIVE URL CHECK: ${hasDeceptiveUrlContent ? 'DETECTED' : 'Not detected'}`);
    
    const hasShortenerUrl = containsUrlShortener(content);
    console.log(`URL SHORTENER CHECK: ${hasShortenerUrl ? 'FOUND' : 'Not found'}`);
    
    // Check for dsc.gg links explicitly
    const hasDscGg = /dsc\.gg\//i.test(content);
    console.log(`DSC.GG CHECK: ${hasDscGg ? 'FOUND' : 'Not found'}`);
    
    // Check for discord.gg links
    const hasDiscordInvite = /discord\.gg[\\/]/i.test(content) || 
    /discord\.com\/invite[\\/]/i.test(content) ||
    /discord[\.\s]*(?:gg|com[\.\s]*[\\/][\.\s]*invite)[\\\/:]/i.test(content);
    console.log(`DISCORD INVITE CHECK: ${hasDiscordInvite ? 'FOUND' : 'Not found'}`);

    // Check user roles
    const userRoles = message.member.roles.cache;
    const hasOnlyBaseRole = userRoles.size === 2 && userRoles.has(BASE_ROLE_ID);
    console.log(`\n--- User role check ---`);
    console.log(`User has ${userRoles.size} roles`);
    console.log(`Has only base role: ${hasOnlyBaseRole ? 'YES' : 'NO'}`);
    console.log(`Roles: ${Array.from(userRoles.values()).map(r => r.name).join(', ')}`);
    
    // Check mentions
    console.log(`\n--- Mention check ---`);
    console.log(`Mentions count: ${message.mentions.users.size}`);
    console.log(`Has @everyone: ${message.mentions.everyone ? 'YES' : 'NO'}`);
    
    // Fetch mentions info
    let mentionedUsersHaveOnlyBaseRole = false;
    if (message.mentions.users.size > 0) {
      console.log(`Checking roles of mentioned users...`);
      
      const mentionRoleChecks = await Promise.all(
        message.mentions.users.map(async (user) => {
          try {
            const mentionedMember = await message.guild.members.fetch(user);
            const hasOnlyBase = mentionedMember.roles.cache.size === 2 && 
                               mentionedMember.roles.cache.has(BASE_ROLE_ID);
            console.log(`Mentioned user ${user.tag}: has only base role: ${hasOnlyBase ? 'YES' : 'NO'}`);
            return hasOnlyBase;
          } catch (e) {
            console.error(`Failed to fetch member for ${user.id}:`, e.message);
            return false;
          }
        })
      );
      
      mentionedUsersHaveOnlyBaseRole = mentionRoleChecks.every(Boolean);
      console.log(`All mentioned users have only base role: ${mentionedUsersHaveOnlyBaseRole ? 'YES' : 'NO'}`);
    }

    const hasMentions = (message.mentions.users.size > 0 && mentionedUsersHaveOnlyBaseRole) || message.mentions.everyone;
    const hasAnyMentions = (message.mentions.users.size > 0) || message.mentions.everyone;
    console.log(`Has qualifying mentions: ${hasMentions ? 'YES' : 'NO'}`);
    console.log(`Has any mentions: ${hasAnyMentions ? 'YES' : 'NO'}`);

    // Check username patterns
    const isScamUser = userDisplayName.some(pattern => pattern.test(member.displayName));
    console.log(`\n--- Username check ---`);
    console.log(`Username matches scam pattern: ${isScamUser ? 'YES' : 'NO'}`);
    console.log(`Display name: ${member.displayName}`);
        
    // Track multi-channel spam
    if (!recentMessages.has(key)) {
      recentMessages.set(key, new Set());
    }

    const channels = recentMessages.get(key);
    channels.add(channel.id);
    console.log(`\n--- Multi-channel check ---`);
    console.log(`Message seen in ${channels.size} channels`);

    // If the same message appears in more than 2 channels, quarantine it
    if (channels.size > 2 && hasOnlyBaseRole) {
      console.log(`QUARANTINE TRIGGERED: Message in ${channels.size} channels`);
      await quarantineMessage(message, channels);
      return true;
    }
    
    // Set a timeout to clean up this entry from recentMessages
    setTimeout(() => {
      const channelSet = recentMessages.get(key);
      if (channelSet) {
        channelSet.delete(channel.id);
        if (channelSet.size === 0) {
          recentMessages.delete(key);
        }
      }
    }, 3600000); // 1 hour in milliseconds

    // Check for targeted scam patterns
    const isTargetedScam = isTargetedScamMessage(message, hasOnlyBaseRole, hasMentions, hasExternalUrl);
    console.log(`\n--- Targeted scam check ---`);
    console.log(`Is targeted scam: ${isTargetedScam ? 'YES' : 'NO'}`);

    const isForwarded = message.reference !== null || message.webhookId !== null;
    console.log(`FORWARDED MESSAGE CHECK: ${isForwarded ? 'DETECTED' : 'Not detected'}`);

    if (isForwarded) {
      console.log(`Reference: ${message.reference ? 'Yes' : 'No'}`);
      console.log(`Webhook: ${message.webhookId ? 'Yes' : 'No'}`);
      
      // If it's forwarded and user has only base role, treat as higher risk
      if (hasOnlyBaseRole) {
        console.log(`ELEVATED RISK: Forwarded message from base role user`);
      }
    }

    // Final decision logic
    console.log(`\n--- FINAL DECISION ---`);
    
    // Modified condition to always catch dsc.gg and discord invites
    const shouldQuarantine = (
      ((isScamContent || (hasExternalUrl && hasMentions) || hasDeceptiveUrlContent || hasShortenerUrl || urlObfuscation.isObfuscated) && hasOnlyBaseRole) ||
      isTargetedScam || 
      isScamUser ||
      (hasDscGg && !hasProtectedRole(member)) ||  // Always catch dsc.gg links unless protected
      (hasDiscordInvite && !hasProtectedRole(member) && !content.includes('garden.finance') || // Always catch discord invites unless protected or official
      isForwarded && hasOnlyBaseRole) //disallow forwarded messages by regular users
    );
    
    console.log(`Should quarantine: ${shouldQuarantine ? 'YES' : 'NO'}`);
    
    if (shouldQuarantine) {
      console.log(`QUARANTINE TRIGGERED: Scam detected`);
      await quarantineMessage(message, new Set([channel.id]));
      return true;
    }

    // Handle repeated mentions and spam occurrences
    console.log(`\n--- SUSPECTED SCAMMER CHECK ---`);
    const isSuspected = isSuspectedScammer(author.id);
    console.log(`Is suspected scammer: ${isSuspected ? 'YES' : 'NO'}`);
    
    if (isSuspected) {
      console.log(`Processing actions for suspected scammer...`);
      let actionTaken = false;
      if (hasAnyMentions) {
        actionTaken = await handleRepeatedMentions(message);
        console.log(`Handled repeated mentions: action taken: ${actionTaken ? 'YES' : 'NO'}`);
      }
      const spamActionTaken = await handleSpamOccurrences(message);
      console.log(`Handled spam occurrences: action taken: ${spamActionTaken ? 'YES' : 'NO'}`);
      return actionTaken || spamActionTaken;
    }
    
    console.log(`NO ACTION TAKEN: Message passed all checks`);
    console.log(`==== END SCAM CHECK ====\n`);
    return false; // No action taken
  } catch (e) {
    console.error('Error in handleScamMessage:', e);
    console.log(`ERROR in handleScamMessage: ${e.message}`);
    console.log(`==== END SCAM CHECK (ERROR) ====\n`);
    return false;
  }
}

async function quarantineMessage(message, channelIds) {
  try {
    const { guild, author, content, member } = message;
    const scammer = addSuspectedScammer(author.id);
    
    // Delete all instances of the message
    const deletionPromises = Array.from(channelIds).map(async (channelId) => {
      try {
        const channel = await guild.channels.fetch(channelId);
        if (!channel) {
          console.log(`Channel ${channelId} not found, skipping`);
          return;
        }

        try {
          const messages = await channel.messages.fetch({ limit: 100 });
          const userMessages = messages.filter(m => 
            m.author.id === author.id && m.content === content
          );
          
          for (const m of userMessages.values()) {
            try {
              if (m.deletable) {
                await m.delete();
                console.log(`Deleted message ${m.id} from ${author.tag}`);
              }
            } catch (deleteError) {
              console.error(`Failed to delete message ${m.id}:`, deleteError.message);
            }
          }
        } catch (messagesError) {
          console.error(`Failed to fetch messages in channel ${channelId}:`, messagesError.message);
        }
      } catch (channelError) {
        console.error(`Failed to fetch channel ${channelId}:`, channelError.message);
      }
    });
    
    // Wait for all deletion attempts to complete
    await Promise.allSettled(deletionPromises);
    
    if (global.updateReportData) {
      let scamType = 'otherScams';
      if (containsUrlShortener(content)) {
        scamType = 'urlShorteners';
      } else if (/discord\.gg[\\/]|discord\.com\/invite[\\/]/i.test(content)) {
        scamType = 'discordInvites';
      } else if (detectUrlObfuscation(content).isObfuscated) {
        scamType = 'encodedUrls';
      }
      
      global.updateReportData(scamType, author.id, member.displayName || author.username);
    }

    console.log(`Quarantined message from ${author.tag} in ${channelIds.size} channel(s).`);

    // Gather user info for the report
    let joinDate = "Unknown";
    let displayName = author.username;
    let username = author.username;
    let userId = author.id;
    let accountCreatedAt = author.createdAt ? author.createdAt.toDateString() : "Unknown";
    let roles = "None";

    try {
      joinDate = member.joinedAt ? member.joinedAt.toDateString() : "Unknown";
      displayName = member.displayName || "Unknown";
      
      const memberRoles = member.roles?.cache;
      if (memberRoles && memberRoles.size > 0) {
        roles = memberRoles
          .filter(role => role.name !== '@everyone')
          .map(role => role.name)
          .join(', ') || "None";
      }
    } catch (memberError) {
      console.error(`Error getting member details: ${memberError.message}`);
    }

    const originalMessage = content.trim();

    // Create an embed with the provided information
    const warningMessageEmbed = createWarningMessageEmbed(
      accountCreatedAt, joinDate, displayName, username, userId, roles, channelIds, originalMessage,
      scammer.spamOccurrences
    );

    // Send the report to the scam channel
    try {
      const reportChannel = await guild.channels.fetch(SCAM_CHANNEL_ID);
      if (reportChannel) {
        await sendThreadedReport(reportChannel, author, warningMessageEmbed);
      } else {
        console.error('Scam report channel not found (ID:', SCAM_CHANNEL_ID, ')');
      }
    } catch (reportError) {
      console.error('Failed to send scam report:', reportError.message);
    }

    return true; // Indicate that action was taken
  } catch (error) {
    console.error('Failed to quarantine message:', error);
    return false; // Indicate failure
  }
}

async function sendThreadedReport(reportChannel, author, warningMessageEmbed) {
  try {
    let threadId = suspiciousUserThreads.get(author.id);
    let thread;

    if (threadId) {
      try {
        thread = await reportChannel.threads.fetch(threadId);
      } catch (error) {
        console.error(`Failed to fetch existing thread for user ${author.id}:`, error);
        thread = null;
      }
    }

    if (!thread) {
      const threadName = `Suspicious Activity - ${author.tag}`;
      try {
        thread = await reportChannel.threads.create({
          name: threadName,
          autoArchiveDuration: 1440, // 1 hour in minutes
          type: ChannelType.PublicThread, // Changed from PrivateThread to PublicThread
          reason: 'New suspicious activity detected'
        });
        suspiciousUserThreads.set(author.id, thread.id);

      } catch (error) {
        console.error(`Failed to create thread for user ${author.id}:`, error);
        // If thread creation fails, send the report to the main channel instead
        await reportChannel.send({ embeds: [warningMessageEmbed] });
        return;
      }
    }

    const banButton = new ButtonBuilder()
      .setCustomId(`ban_${author.id}`)
      .setLabel('Ban User')
      .setStyle(ButtonStyle.Danger);

    const actionRow = new ActionRowBuilder().addComponents(banButton);

    await thread.send({
      content: `Suspicious activity detected for user ${author.tag} (${author.id})`,
      embeds: [warningMessageEmbed],
      components: [actionRow],
      allowedMentions: { parse: [] }
    });
  } catch (error) {
    console.error('Failed to send threaded report:', error);
    // If all else fails, try to send the report to the main channel
    await reportChannel.send({ embeds: [warningMessageEmbed] });
  }
}

function addSuspectedScammer(userId) {
  const existingEntry = suspectedScammers.get(userId);
  const newTimeout = Date.now() + SCAMMER_TIMEOUT_DURATION;
  
  if (existingEntry) {
    existingEntry.timeout = existingEntry.timeout + SCAMMER_TIMEOUT_DURATION;
    existingEntry.spamOccurrences = (existingEntry.spamOccurrences || 0) + 1;
    return existingEntry;
  } else {
    const newEntry = { 
      timeout: newTimeout, 
      offenseCount: 1,
      spamOccurrences: 1,
      mentionCount: 0,
      mentionTimestamp: 0
    };
    suspectedScammers.set(userId, newEntry);
    return newEntry;
  }
}

async function handleSpamOccurrences(message) {
  const { author, guild } = message;
  const scammer = suspectedScammers.get(author.id);

  if (scammer.spamOccurrences >= MAX_SPAM_OCCURRENCES) {
    try {
      const member = await guild.members.fetch(author.id);
      //await member.ban({ days: 1, reason: 'Excessive spam occurrences' });
      await member.kick('Excessive mentions while under suspicion');
      
      const reportChannel = await guild.channels.fetch(SCAM_CHANNEL_ID);
      if (reportChannel) {
        const threadId = suspiciousUserThreads.get(author.id);
        if (threadId) {
          const thread = await reportChannel.threads.fetch(threadId);
          await thread.send(`User ${author.tag} (${author.id}) has been kicked for excessive spam occurrences (${scammer.spamOccurrences}).`);
        } else {
          await reportChannel.send(`User ${author.tag} (${author.id}) has been kicked for excessive spam occurrences (${scammer.spamOccurrences}).`);
        }
      }
    } catch (error) {
      console.error('Failed to ban user for spam occurrences:', error);
    }
  }
}

async function listSuspectedScammers(message) {

  const now = Date.now();
  const activeScammers = Array.from(suspectedScammers.entries())
    .filter(([_, entry]) => entry.timeout > now)
    .map(([userId, entry]) => ({
      userId,
      timeLeft: Math.ceil((entry.timeout - now) / 60000), // minutes
      offenseCount: entry.offenseCount
    }));

  if (activeScammers.length === 0) {
    await message.reply("There are no suspected scammers at the moment.");
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("Suspected Scammers List")
    .setColor("#FF0000")
    .setDescription("Here's a list of currently suspected scammers:");

  activeScammers.forEach(scammer => {
    embed.addFields({
      name: `User ID: ${scammer.userId}`,
      value: `Time left: ${scammer.timeLeft} minutes\nOffense count: ${scammer.offenseCount}`
    });
  });

  await message.reply({ embeds: [embed] });
}
async function handleRepeatedMentions(message) {
  const { author, guild } = message;
  const scammer = suspectedScammers.get(author.id);

  if (!scammer.mentionCount) {
    scammer.mentionCount = 1;
    scammer.mentionTimestamp = Date.now();
  } else {
    const timeSinceLastMention = Date.now() - scammer.mentionTimestamp;
    
    if (timeSinceLastMention < MENTION_COOLDOWN) {
      scammer.mentionCount++;
    } else {
      scammer.mentionCount = 1;
    }
    
    scammer.mentionTimestamp = Date.now();
  }

  if (scammer.mentionCount > MAX_MENTIONS) {
    try {
      const member = await guild.members.fetch(author.id);
      await member.kick('Excessive mentions while under suspicion');
      
      const reportChannel = await guild.channels.fetch(SCAM_CHANNEL_ID);
      if (reportChannel) {
        const threadId = suspiciousUserThreads.get(author.id);
        if (threadId) {
          const thread = await reportChannel.threads.fetch(threadId);
          await thread.send(`User ${author.tag} (${author.id}) has been kicked for excessive mentions (${scammer.mentionCount}) while under suspicion. In the future this will be a ban after some testing.`);
        } else {
          // If no thread exists, create one
          const threadName = `Suspicious Activity - ${author.tag}`;
          const newThread = await reportChannel.threads.create({
            name: threadName,
            autoArchiveDuration: 10080, // 7 days in minutes
            type: ChannelType.PublicThread,
            reason: 'New suspicious activity detected'
          });
          suspiciousUserThreads.set(author.id, newThread.id);
          
          await newThread.send(`User ${author.tag} (${author.id}) has been kicked for excessive mentions (${scammer.mentionCount}) while under suspicion. In the future this will be a ban after some testing.`);
        }
      }
    } catch (error) {
      console.error('Failed to kick user:', error);
    }
  }
}

function isChannelExcluded(channel) {
  // Check by channel ID
  if (EXCLUDED_CHANNELS.includes(channel.id)) {
    return true;
  }

  // Check by channel name patterns
  if (excludedPatterns.some(pattern => pattern.test(channel.name))) {
    return true;
  }

  // If it's a thread, check its parent channel
  if (channel.isThread()) {
    const parentChannel = channel.parent;
    if (parentChannel) {
      // Check parent channel ID
      if (EXCLUDED_CHANNELS.includes(parentChannel.id)) {
        return true;
      }
      // Check parent channel name patterns
      if (excludedPatterns.some(pattern => pattern.test(parentChannel.name))) {
        return true;
      }
    }
  }

  return false;
}

// Enhanced URL detection function
function hasDeceptiveUrl(content) {
  const urlMatches = content.match(urlPattern) || [];
  
  // Check each URL for allowed domains before running deceptive checks
  for (const url of urlMatches) {
    const domainMatch = url.match(/https?:\/\/([^\/\s]+)/i);
    if (domainMatch) {
      const domain = domainMatch[1].toLowerCase();
      // Check if domain is allowed
      const isAllowed = ALLOWED_DOMAINS.some(allowedDomain => 
        domain === allowedDomain || domain.endsWith('.' + allowedDomain)
      );
      
      // If it's from an allowed domain, skip deceptive URL checks
      if (isAllowed) {
        return false;
      }
    }
  }
  // Check for URLs disguised with zero-width spaces or other invisible characters
  const hasHiddenChars = /https?:\/\/\S*[\u200B-\u200D\uFEFF\u2060\u180E]\S*/i.test(content);
  
  // Check for lookalike domains (Discord variants and crypto-related)
  const hasLookalikeDomain = /https?:\/\/(?:dlscord|d1scord|discorcl|discorb|discord\.(?!com|gg)|discordd|diamondhand|gem-|airdr[o0]p-|nft-claim|crypto-|swap-|fomo-|claim-|web3-|dao-|seed-)\.\w+/i.test(content);
  
  // Check for URL shorteners which might hide malicious destinations
  const hasUrlShortener = /https?:\/\/(?:bit\.ly|tinyurl\.com|goo\.gl|t\.co|is\.gd|buff\.ly|ow\.ly|tr\.im|adf\.ly|dub\.sh|cutt\.ly|soo\.gd|clck\.ru|qr\.ae|bc\.vc)/i.test(content);
  
  // Check for irregular Discord invite formats
  const hasIrregularDiscordInvite = /discord(?:\.gg|\.com\/invite)\/[a-zA-Z0-9]{8,}/i.test(content);
  
  // Check for suspicious domains related to airdrops, claims, etc.
  const hasSuspiciousDomain = /https?:\/\/(?:[a-z0-9-]+\.)*(?:claim|airdrop|fomo|diamond|hands|nft|crypto|web3|seed|free|reward)(?:[a-z0-9-]*)\.[a-z]+/i.test(content);
  
  // Check for domains with hyphens (common in scam sites)
  const hasHyphenatedDomain = /https?:\/\/[a-z0-9]+-[a-z0-9]+-[a-z0-9]+\.[a-z]+/i.test(content);
  
  // Check for ticket or support related links
  const hasTicketRelatedUrl = /(?:ticket|support|help|query|assistance).*https?:\/\//i.test(content) || /https?:\/\/.*(?:ticket|support|help|query|assistance)/i.test(content);
  
  return hasHiddenChars || hasLookalikeDomain || hasUrlShortener || hasIrregularDiscordInvite || 
         hasSuspiciousDomain || hasHyphenatedDomain || hasTicketRelatedUrl;
}

function detectUrlObfuscation(content) {
  // Remove Discord formatting to get cleaner text
  const cleanContent = content.replace(/\*\*|__|\*|_|`|~~|>/g, '');
  
  // Extract all URLs from the original content (for allowed domain checking)
  const urlMatches = content.match(urlPattern) || [];
  
  // Check each URL for allowed domains before running obfuscation checks
  for (const url of urlMatches) {
    const domainMatch = url.match(/https?:\/\/([^\/\s]+)/i);
    if (domainMatch) {
      const domain = domainMatch[1].toLowerCase();
      // Check if domain is allowed
      const isAllowed = ALLOWED_DOMAINS.some(allowedDomain => 
        domain === allowedDomain || domain.endsWith('.' + allowedDomain)
      );
      
      // If all URLs are from allowed domains, skip obfuscation checks
      if (isAllowed) {
        return {
          hasUrlEncoding: false,
          hasLineBreaksInUrl: false,
          hasInvisibleChars: false,
          hasUnusualChars: false,
          hasBrokenScheme: false,
          hasAlternativeSlashes: false,
          isObfuscated: false
        };
      }
    }
  }
  
  // Enhanced obfuscation detection
  const hasUrlEncoding = /%[0-9A-Fa-f]{2}/.test(cleanContent);
  
  // Detect line breaks within URLs (including in the scheme)
  const hasLineBreaksInUrl = /h\s*t\s*t\s*p\s*s?\s*:\s*[\/\@\s]*\s*[\/\@\s]*/.test(cleanContent);
  
  // Detect broken HTTP/HTTPS schemes
  const hasBrokenScheme = /h\s*t\s*t\s*p\s*s?\s*:/.test(cleanContent) && 
                         !/https?:\/\//.test(cleanContent);
  
  // Detect alternative characters used instead of //
  const hasAlternativeSlashes = /https?:\s*[@#*]{2,}/.test(cleanContent) || 
                               /https?:\s*[\/\@][\/\@]/.test(cleanContent);
  
  // Detect invisible characters
  const hasInvisibleChars = /https?:\/\/\S*[\u200B-\u200D\uFEFF\u2060\u180E]\S*/i.test(cleanContent);
  
  // Detect unusual characters in URLs
  const hasUnusualChars = /https?:\/\/[^\/\s]*[<>()\[\]{}\\|^`~]+[^\/\s]*/i.test(cleanContent);
  
  // Additional check: look for Discord-like domains that are heavily obfuscated
  const hasObfuscatedDiscord = /d\s*i\s*s\s*c\s*o\s*r\s*d\s*\.\s*g\s*g/i.test(cleanContent) ||
                              /d\s*i\s*s\s*c\s*o\s*r\s*d\s*\.\s*c\s*o\s*m/i.test(cleanContent);

  const isObfuscated = hasUrlEncoding || hasLineBreaksInUrl || hasInvisibleChars || 
                      hasUnusualChars || hasBrokenScheme || hasAlternativeSlashes || 
                      hasObfuscatedDiscord;

  return {
    hasUrlEncoding,
    hasLineBreaksInUrl,
    hasInvisibleChars,
    hasUnusualChars,
    hasBrokenScheme,
    hasAlternativeSlashes,
    hasObfuscatedDiscord,
    isObfuscated
  };
}

//Function to detect unauthorized URLs
function hasUnauthorizedUrl(message, guild) {
  const content = message.content;

  // Skip if the message only contains a Discord sticker or a gif
  const isOnlySticker = message.stickers && message.stickers.size > 0 && !content.trim();
  const isOnlyGif = message.embeds && 
    message.embeds.length === 1 && 
    message.embeds[0].type === 'gifv' && 
    !content.trim();
  
  // Skip URL checking for pure media messages
  if (isOnlySticker || isOnlyGif) {
    return false;
  }

  if (containsUrlShortener(content)) {
    return true;
  }

  // Regular expression to match URLs
  const urlRegex = /https?:\/\/([^\/\s]+)(\/[^\s]*)?/gi;
  const plainUrlRegex = /(?<![.@\w])((?:\w+\.)+(?:com|org|network|ca|net|io|finance|xyz|app|dev|info|co|gg))\b/gi;
  
  // First check for standard URLs (with http/https)
  let match;
  while ((match = urlRegex.exec(content)) !== null) {
    const domain = match[1].toLowerCase();
    const path = match[2] || '';
    
    // Check if the domain is in the allowed list
    const isAllowed = ALLOWED_DOMAINS.some(allowedDomain => 
      domain === allowedDomain || domain.endsWith('.' + allowedDomain)
    );
    
    if (isAllowed) {
      continue; // Domain is explicitly allowed
    }
    
    // Special handling for Discord URLs
    if (domain === 'discord.com' || domain === 'discord.gg' || domain.endsWith('.discord.com')) {
      // Check if it's a link to internal channels/messages in the current guild
      if (path.includes('/channels/')) {
        // Extract guild ID from the path
        const pathParts = path.split('/');
        const channelsIndex = pathParts.indexOf('channels');
        
        if (channelsIndex !== -1 && pathParts.length > channelsIndex + 1) {
          const linkedGuildId = pathParts[channelsIndex + 1];
          
          // If it links to the current guild, allow it
          if (linkedGuildId === guild.id) {
            continue;
          }
        }
      }
      
      // If it's a Discord invite link to external servers, it's unauthorized
      if (domain === 'discord.gg' || path.includes('/invite/')) {
        return true;
      }
      
      // Allow other Discord links (like to Discord support, etc.)
      continue;
    }
    
    // If we get here, the URL is not from an allowed domain or internal Discord link
    console.log(`Unauthorized URL detected: ${domain}`);
    return true;
  }
  
  // Also check for URLs without the protocol (e.g., ghost.com instead of https://ghost.com)
  while ((match = plainUrlRegex.exec(content)) !== null) {
    const plainDomain = match[1].toLowerCase();
    
    // Check if the domain is in the allowed list
    const isAllowed = ALLOWED_DOMAINS.some(allowedDomain => 
      plainDomain === allowedDomain || plainDomain.endsWith('.' + allowedDomain)
    );
    
    if (!isAllowed && plainDomain !== 'discord.com' && plainDomain !== 'discord.gg') {
      console.log(`Unauthorized plain domain detected: ${plainDomain}`);
      return true;
    }
  }
  
  return false; // No unauthorized URLs found
}

function containsUrlShortener(content) {
  // First check for URLs with protocol
  const urlRegex = /https?:\/\/([^\/\s]+)(\/[^\s]*)?/gi;
  let match;
  
  while ((match = urlRegex.exec(content)) !== null) {
    const domain = match[1].toLowerCase();
    
    // Check if the domain is a known URL shortener
    if (URL_SHORTENERS.some(shortener => domain === shortener || domain.endsWith('.' + shortener))) {
      console.log(`URL shortener detected: ${domain}`);
      return true;
    }
  }
  
  // For URL shorteners without protocol, be more careful
  for (const shortener of URL_SHORTENERS) {
    // This pattern requires word boundaries on both sides or the beginning of a line
    // and looks for domain-like patterns (e.g., bit.ly/xyz), not just the text
    const shortenerRegex = new RegExp(`(?:^|\\s)${shortener}(?:/[^\\s]+)?(?:\\s|$)`, 'i');
    if (shortenerRegex.test(content)) {
      // Double-check with a more restrictive pattern for shorteners that could be common words
      if (['to', 'is', 'us', 'id'].includes(shortener.split('.')[0])) {
        // For these, require the domain pattern to be more domain-like
        const stricterRegex = new RegExp(`(?:^|\\s)${shortener}/[^\\s]+(?:\\s|$)`, 'i');
        if (stricterRegex.test(content)) {
          console.log(`URL shortener detected without protocol: ${shortener}`);
          return true;
        }
      } else {
        console.log(`URL shortener detected without protocol: ${shortener}`);
        return true;
      }
    }
  }
  
  return false;
}

// Function to check if a URL is to an internal Discord channel or an allowed domain
function isAllowedUrl(content, guild) {
  // Check for URLs with http/https protocol
  let match;
  while ((match = urlPattern.exec(content)) !== null) {
    const fullUrl = match[0];
    const domain = match[1].toLowerCase();
    const path = match[2] || '';
    
    // Check allowed domains first
    const isAllowedDomain = ALLOWED_DOMAINS.some(allowedDomain => 
      domain === allowedDomain || domain.endsWith('.' + allowedDomain)
    );
    
    if (isAllowedDomain) {
      continue; // URL is from an allowed domain, carry on
    }
    
    // Check if it's an internal Discord link (to the current server)
    if ((domain === 'discord.com' || domain.endsWith('.discord.com')) && path.includes('/channels/')) {
      const pathParts = path.split('/');
      const channelsIndex = pathParts.indexOf('channels');
      
      if (channelsIndex !== -1 && pathParts.length > channelsIndex + 1) {
        const linkedGuildId = pathParts[channelsIndex + 1];
        
        // If it links to the current guild, it's allowed
        if (linkedGuildId === guild.id) {
          continue;
        }
      }
    }
    
    // It's not an allowed domain or internal Discord link
    return false;
  }
  
  // Check for plain domain references (without http/https)
  urlPattern.lastIndex = 0; // Reset the regex index
  plainDomainPattern.lastIndex = 0; // Reset the regex index
  
  let plainMatch;
  while ((plainMatch = plainDomainPattern.exec(content)) !== null) {
    const plainDomain = plainMatch[1].toLowerCase();
    
    // Skip discord.com as we handle those separately
    if (plainDomain === 'discord.com' || plainDomain === 'discord.gg') {
      continue;
    }
    
    // Check if the domain is allowed
    const isAllowedDomain = ALLOWED_DOMAINS.some(allowedDomain => 
      plainDomain === allowedDomain || plainDomain.endsWith('.' + allowedDomain)
    );
    
    if (!isAllowedDomain) {
      return false;
    }
  }
  
  // No unauthorized URLs found
  return true;
}

// Function to handle unauthorized URLs
async function handleUnauthorizedUrl(message) {
  try {
    const userId = message.author.id;
    const userName = message.author.tag;
    const messageId = message.id;
    const content = message.content;

    // Determine the URL type for reporting
    const hasShortenerUrl = containsUrlShortener(content);
    const hasDiscordInvite = /discord\.gg[\\/]|discord\.com\/invite[\\/]/i.test(content);
    const urlObfuscation = detectUrlObfuscation(content);

    dailyInterceptCount++;
    console.log(`Intercepting unauthorized URL (count: ${dailyInterceptCount}): ${content.substring(0, 100)}...`);
    
    // First check if message still exists and is deletable
    try {
      // Try to fetch the message to ensure it exists
      const fetchedMessage = await message.channel.messages.fetch(messageId);
      if (fetchedMessage.deletable) {
        await fetchedMessage.delete();
        console.log(`Successfully deleted message ${messageId} with unauthorized URL`);
      } else {
        console.log(`Message ${messageId} is not deletable`);
        return false;
      }
    } catch (fetchError) {
      // Message likely doesn't exist anymore
      console.log(`Message ${messageId} could not be fetched, likely already deleted: ${fetchError.message}`);
      return false;
    }
    
    // Simple notification message
    const dmContent = `🌱 Hey ${message.author.username}, your message in #${message.channel.name} was removed due to an unauthorized URL.\n\n Only links from garden.finance, x.com, and internal Discord links are allowed. If you need to share something else, raise a ticket and our mods will help you 🌸.`;    
    
    // Send DM to user
    try {
      await message.author.send({ content: dmContent });
    } catch (dmError) {
      // DM failed, user might have DMs disabled - fall back to a temporary channel message
      console.log(`Failed to send DM to ${userName}: ${dmError.message}`);
      
      // Send a brief notice in the channel that will be deleted shortly
      try {
        const tempMsg = await message.channel.send({
          content: `<@${userId}> Your message with an unauthorized URL was removed. Please check server rules about acceptable links.`,
          allowedMentions: { users: [userId] }
        });
        
        // Delete the notice after a short delay
        setTimeout(() => {
          if (tempMsg && tempMsg.deletable) {
            tempMsg.delete().catch(err => console.error(`Failed to delete temp message ${tempMsg.id}: ${err.message}`));
          }
        }, 8000); // Delete after 8 seconds
      } catch (tempMsgError) {
        console.error(`Failed to send temporary notification: ${tempMsgError.message}`);
      }
    }
    
    // Log the action
    console.log(`Unauthorized URL removed from ${userName} (${userId})`);

    if (global.updateReportData) {
      // Determine the type of scam
      let scamType = 'otherScams';
      if (hasShortenerUrl) scamType = 'urlShorteners';
      else if (hasDiscordInvite) scamType = 'discordInvites';  
      else if (urlObfuscation.isObfuscated) scamType = 'encodedUrls';
      
      const displayName = message.member?.displayName || message.author.username;
      global.updateReportData(scamType, message.author.id, displayName);
    }
    
    return true;
  } catch (error) {
    console.error(`Failed to handle unauthorized URL (message ${message.id}): ${error.message}`);
    return false;
  }
}

// Add a function to check if a user has a protected role
function hasProtectedRole(member) {
  if (!member || !member.roles) {
    return false;
  }
  
  // Check if the user has any of the protected roles
  return PROTECTED_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));
}

    // Create more detailed report
    async function sendDetailedReport(guild) {
      try {
        const reportChannel = await guild.channels.fetch(SCAM_CHANNEL_ID);
        if (!reportChannel) {
          console.error(`Report channel with ID ${SCAM_CHANNEL_ID} not found`);
          return;
        }
  
        // For testing purposes, use current time instead of yesterday
        const now = new Date();
        const formattedDate = now.toISOString().split('T')[0];
        const formattedTime = now.toTimeString().split(' ')[0];
  
        // Handle no interceptions case
        if (reportData.dailyInterceptCount === 0) {
          await reportChannel.send({
            embeds: [
              new EmbedBuilder()
                .setTitle(`📊 Security Report for ${formattedDate} at ${formattedTime}`)
                .setColor('#00FF00')  // Green color for all-clear
                .setDescription(`No scam attempts intercepted! 🎉`)
                .setFooter({ text: 'Garden Security Bot - TEST MODE' })
                .setTimestamp()
            ]
          });
          
          console.log(`Sent empty test report at ${formattedTime}`);
          return;
        }
  
        // Create a more detailed embed report
        const embed = new EmbedBuilder()
          .setTitle(`📊 Security Report for ${formattedDate} at ${formattedTime}`)
          .setColor('#FF0000')
          .setDescription(`Total interceptions: **${reportData.dailyInterceptCount}**`)
          .addFields(
            { 
              name: 'URL Shorteners', 
              value: reportData.scamTypes.urlShorteners.toString(), 
              inline: true 
            },
            { 
              name: 'Discord Invites', 
              value: reportData.scamTypes.discordInvites.toString(), 
              inline: true 
            },
            { 
              name: 'Encoded URLs', 
              value: reportData.scamTypes.encodedUrls.toString(), 
              inline: true 
            },
            { 
              name: 'Other Scams', 
              value: reportData.scamTypes.otherScams.toString(), 
              inline: true 
            }
          )
          .setFooter({ text: 'Garden Security Bot - TEST MODE' })
          .setTimestamp();
  
        // Add top offenders if any exist
        if (reportData.topScammers.size > 0) {
          const topOffenders = Array.from(reportData.topScammers.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([userId, count], index) => `${index + 1}. <@${userId}>: ${count} violation${count !== 1 ? 's' : ''}`)
            .join('\n');
  
          if (topOffenders) {
            embed.addFields({ name: 'Top Offenders', value: topOffenders });
          }
        } else {
          // No repeat offenders
          embed.addFields({ 
            name: 'Top Offenders', 
            value: 'No repeat offenders.' 
          });
        }
  
        // Send the embed report
        await reportChannel.send({ embeds: [embed] });
        
        console.log(`Sent detailed test security report at ${formattedTime}`);
      } catch (error) {
        console.error('Error sending test report:', error);
      }
    }

    function setupReportingSystem(client) {
      // Store report data
      const reportData = {
        interceptCount: 0,
        lastReportTime: Date.now(), // Start from now
        scamTypes: {
          urlShorteners: 0,
          discordInvites: 0,
          encodedUrls: 0,
          otherScams: 0
        },
        topScammers: new Map()
      };
    
      console.log(`Reporting system initialized at ${new Date(reportData.lastReportTime).toISOString()}`);
      
      // Reset report data function
      function resetReportData() {
        reportData.interceptCount = 0;
        reportData.scamTypes = {
          urlShorteners: 0,
          discordInvites: 0, 
          encodedUrls: 0,
          otherScams: 0
        };
        reportData.topScammers.clear();
        console.log(`Report data reset at ${new Date().toISOString()}`);
      }
    
      // Update stats function - expose this globally
      global.updateReportData = function(type, userId) {
        reportData.interceptCount++;
        
        // Update scam type counters
        if (type && reportData.scamTypes[type] !== undefined) {
          reportData.scamTypes[type]++;
        } else {
          reportData.scamTypes.otherScams++;
        }
        
        // Track user violations if userId is provided
        if (userId) {
          const currentCount = reportData.topScammers.get(userId) || 0;
          reportData.topScammers.set(userId, currentCount + 1);
        }
        
        console.log(`Report data updated: ${type} by user ${userId || 'unknown'}, total count: ${reportData.interceptCount}`);
      };
    
      // Send detailed report function
      async function sendDetailedReport(guild) {
        try {
          const { EmbedBuilder } = require('discord.js');
          const config = require('./config');
          
          const reportChannel = await guild.channels.fetch(config.SCAM_CHANNEL_ID);
          if (!reportChannel) {
            console.error(`Report channel with ID ${config.SCAM_CHANNEL_ID} not found`);
            return;
          }
    
          // Current date/time formatting
          const now = new Date();
          const formattedDate = now.toISOString().split('T')[0];
          const formattedTime = now.toTimeString().split(' ')[0];
    
          // Handle no interceptions case
          if (reportData.interceptCount === 0) {
            await reportChannel.send({
              embeds: [
                new EmbedBuilder()
                  .setTitle(`📊 Security Report for ${formattedDate} at ${formattedTime}`)
                  .setColor('#00FF00')  // Green color for all-clear
                  .setDescription(`No scam attempts intercepted in the last 4 hours! 🎉`)
                  .setFooter({ text: 'Garden Security Bot - TEST MODE (4-hour interval)' })
                  .setTimestamp()
              ]
            });
            
            console.log(`Sent empty report at ${formattedTime}`);
            return;
          }
    
          // Create a detailed embed report
          const embed = new EmbedBuilder()
            .setTitle(`📊 Security Report for ${formattedDate} at ${formattedTime}`)
            .setColor('#FF0000')
            .setDescription(`Total interceptions in the last 4 hours: **${reportData.interceptCount}**`)
            .addFields(
              { 
                name: 'URL Shorteners', 
                value: reportData.scamTypes.urlShorteners.toString(), 
                inline: true 
              },
              { 
                name: 'Discord Invites', 
                value: reportData.scamTypes.discordInvites.toString(), 
                inline: true 
              },
              { 
                name: 'Encoded URLs', 
                value: reportData.scamTypes.encodedUrls.toString(), 
                inline: true 
              },
              { 
                name: 'Other Scams', 
                value: reportData.scamTypes.otherScams.toString(), 
                inline: true 
              }
            )
            .setFooter({ text: 'Garden Security Bot - TEST MODE (4-hour interval)' })
            .setTimestamp();
    
          // Add top offenders if any exist
          if (reportData.topScammers.size > 0) {
            const topOffenders = Array.from(reportData.topScammers.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([userId, count], index) => `${index + 1}. <@${userId}>: ${count} violation${count !== 1 ? 's' : ''}`)
              .join('\n');
    
            if (topOffenders) {
              embed.addFields({ name: 'Top Offenders', value: topOffenders });
            }
          } else {
            // No repeat offenders
            embed.addFields({ 
              name: 'Top Offenders', 
              value: 'No repeat offenders.' 
            });
          }
    
          // Send the embed report
          await reportChannel.send({ embeds: [embed] });
          console.log(`Sent detailed security report at ${formattedTime}`);
        } catch (error) {
          console.error('Error sending report:', error);
        }
      }
    
      // Run reports every 4 hours
      const REPORT_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours in milliseconds
      
      const intervalId = setInterval(async () => {
        try {
          const now = Date.now();
          const guild = client.guilds.cache.first();
          
          if (!guild) {
            console.error("No guild found");
            return;
          }
          
          console.log(`Running report check at: ${new Date(now).toISOString()}`);
          console.log(`Time since last report: ${(now - reportData.lastReportTime) / 60000} minutes`);
          
          // If it's been approximately 4 hours since the last report
          if (now - reportData.lastReportTime >= REPORT_INTERVAL) {
            console.log("4 hours elapsed, sending report...");
            
            await sendDetailedReport(guild);
            
            // Update last report time and reset data AFTER sending report
            reportData.lastReportTime = now;
            resetReportData();
          } else {
            console.log("Not time to send report yet");
          }
        } catch (error) {
          console.error('Error in report interval handler:', error);
        }
      }, 15 * 60 * 1000); // Check every 15 minutes
      
      client.reportInterval = intervalId;
      console.log('Security reporting system initialized - will send reports every 4 hours');
      
      return global.updateReportData;
    }

module.exports = {
  handleMessage,
  handleScamMessage,
  addSuspectedScammer,
  quarantineMessage,
  celebratoryGifs,
  suspiciousUserThreads,
  setupReportingSystem,
  detectUrlObfuscation,
  hasDeceptiveUrl,
  containsUrlShortener
};