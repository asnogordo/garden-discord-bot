const { DMChannel, MessageType, EmbedBuilder, ChannelType, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits } = require('discord.js');
const cowsay = require('cowsay');
const { 
  GM_CHANNEL_ID, SUPPORT_CHANNEL_ID, SCAM_CHANNEL_ID, BASE_ROLE_ID, CHANNEL_ID, EXCLUDED_CHANNELS,
  EXCLUDED_CHANNEL_PATTERNS,PROTECTED_ROLE_IDS
} = require('./config');
const { codeBlock, helloMsgReply, pickFromList, formatDuration,canBeModerated } = require('./utils');
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
  'images-ext-2.discordapp.net'
];

const URL_SHORTENERS = [
  'bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'is.gd', 'buff.ly', 'ow.ly', 
  'tr.im', 'dsc.gg', 'adf.ly', 'tiny.cc', 'shorten.me', 'clck.ru', 'cutt.ly',
  'rebrand.ly', 'short.io', 'bl.ink', 'snip.ly', 'lnk.to', 'hive.am',
  'shor.by', 'bc.vc', 'v.gd', 'qps.ru', 'spoo.me', 'x.co', 'yourls.org',
  'shorturl.at', 'tny.im', 'u.to', 'url.ie', 'shrturi.com', 's.id'
];

const suspiciousUserThreads = new Map();

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
  /https.*(?:👆|👇|👉)/i
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
const contractAddress = /.*(contract|token) .*address.*/i;
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
const gardenExplorer = /(?:\b(?:wh?en|where|how|can|does|do I|is|what|show|find|see|check|get|open|access|view|use|link to)(?:\s+\w+){0,5}\s+(?:garden\s*)?(?:explorer|tx\s*explorer|transaction\s*explorer|txs?|transaction\s*status|tx\s*status|transactions?))|(?:\b(?:garden\s*)?(?:explorer|tx\s*explorer|transaction\s*explorer)(?:\s+\w+){0,2}\s+(?:link|url|site|page|website))|(?:\bexplorer\b)|(?:\btx\s*link\b)/i;
const metricsAnalytics = /(?:how|where|what|which|can|is there).*(?:check|see|find|view|get|analytics|metrics|stats|statistics|volume|data|chart|graph|dashboard|numbers|tvl|defi.?llama|dune)/i;

// GIF lists
const wenMoonGifs = [
  'https://c.tenor.com/YZWhYF-xV4kAAAAd/when-moon-admin.gif',
  'https://c.tenor.com/R6Zf7aUegagAAAAd/lambo.gif',
  'https://media1.tenor.com/m/9idtwWwfCdAAAAAC/wen-when.gif',
  'https://media1.tenor.com/m/LZZfKVHwpoIAAAAC/waiting-penguin.gif',
  'https://media1.tenor.com/m/1vXRFJxqIVgAAAAC/waiting-waiting-patiently.gif',
  'https://media1.tenor.com/m/XIr-1aBPoCEAAAAC/walk-hard-the-dewey-cox-story.gif'
];

const wenLamboGifs = [
  'https://c.tenor.com/_dae-kRV6jUAAAAS/lambo-cardboard.gif',
  'https://c.tenor.com/R6Zf7aUegagAAAAd/lambo.gif',
];

const meaningOfLifeGifs = [
  'https://pa1.narvii.com/6331/0e0ef4cfaf24742e0ca39e79a4df2a1aff6f928c_hq.gif',
  'https://i.giphy.com/media/dYgDRfc61SGtO/giphy.webp',
  'https://i.giphy.com/media/OY9XK7PbFqkNO/giphy.webp',
  'https://media1.tenor.com/m/Qc-OTTAsDnAAAAAd/best-field-day-ever.gif'
];

const workingOnItGifs = [
  'Soon™\nhttps://media1.tenor.com/m/RXGEDEM_odoAAAAC/burstofenergy.gif',
  'Soon™\nhttps://media1.tenor.com/m/GS--K_H775kAAAAC/gardener-expert.gif',
  'Soon™\nhttps://media1.tenor.com/m/OiuNG8MQKkYAAAAC/nature-flower.gif',
  'Soon™\nhttps://media1.tenor.com/m/W42sxw9yTZkAAAAC/ponste9.gif',
  'Soon™\nhttps://media1.tenor.com/m/1ZPySWYcQkAAAAAC/cem-gif.gif',
  'Soon™\nhttps://media1.tenor.com/m/vo2C5ig9SIMAAAAd/erkenci-kus-sanem.gif',
  'Soon™\nhttps://media1.tenor.com/m/CmogjUfSyckAAAAd/aum-animation-andy-pirki.gif'
];

const wenDudeGifs = [
  'https://media1.tenor.com/m/FC_My5JT638AAAAC/the-big-lebowski-the-dude.gif',
  'https://media1.tenor.com/m/GscrdOO29OUAAAAd/the-dude-big-lebowski.gif',
  'https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExcWZnaWkyOTQ2aDE3ZWgzejB1bnFhM3JrZGFxdWZtNXpwbmljbDljaCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/lnDvZtsnWfnnX4T0KA/giphy-downsized-large.gif',
  'https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExdGl6NTdwemdzNDM0eDVha3I1eXFraWU2ZXVreXQ1MmJlY2Q3MHc0ayZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/J6JDizWgG3bX704JEU/giphy-downsized-large.gif',
  'https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExaWdpZ3U3b3pzb3RmOHB4cHpkZ2s0NDczYXdzbmZ5NGpyMmt1bjRjaiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3o7bueYrEU0GcwzTKo/giphy.gif',
  'https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExdTR1ZDk2ZGRjNWhidzl2djUxM3U1bG9pODV4NDhsNHFhNXVraTR4ZyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/hzrvwvnbgIV6E/giphy.gif',
];

const celebratoryGifs = [
  'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
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
  
  // Skip if message is already being processed
  if (processingLock.has(messageId)) {
    return;
  }

  try {

    processingLock.add(messageId);

    const { author, content, member, channel, guild } = message;

    // Check if channel should be excluded from message handling
    if (isChannelExcluded(channel)) {
      return;
    }
    
    if (message.author.bot) {
      console.log('Do not reply to bots', message.author.tag);
      return;
    }
    if (message.type !== MessageType.Default && message.type !== MessageType.Reply) {
      console.log('Can only interact with default messages and replies', message.type);
      return;
    }
    console.log(message.type);
    if (message.type !== MessageType.Default) {
      console.log('Can only interact with default messages', message.type);
      return;
    }
    if (channel.type === ChannelType.DM) {
      message.reply(
        codeBlock(cowsay.say({ text: "I am a bot and can't reply, beep bop" })),
      );
      return;
    }
    
    const isProtected = hasProtectedRole(member);
    await handleScamMessage(message);

    if (!message.deleted && hasUnauthorizedUrl(message, guild) && !isProtected) {
      await handleUnauthorizedUrl(message);
      return;
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
    } else if (metricsAnalytics.test(message.content)) {
      await message.reply(
        "You can check Garden Finance metrics on:\n\n" +
        "🔍 **Garden Explorer**: <https://explorer.garden.finance/>\n" +
        "📈 **Dune Analytics**: <https://dune.com/garden_finance/gardenfinance>\n" +
        "📊 **DefiLlama**: <https://defillama.com/protocol/garden>"

      );
    } 
  } catch (e) {
    console.error('Something failed handling a message', e);
  } finally {
    // Always remove from processing lock when done
    processingLock.delete(messageId);
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
  const { author, content, channel, member, guild } = message;
  const key = `${author.id}:${content}`;

  // Skip for users with protected roles
  if (hasProtectedRole(member)) {
    return;
  }

  // Get the bot's member object properly
  const botMember = message.guild.members.cache.get(message.client.user.id);
    
  // Do scam pattern checks before the moderation check
  const isScamContent = scamPatterns.some(pattern => pattern.test(message.content));
  const hasExternalUrl = !isAllowedUrl(content, guild);
  const hasDeceptiveUrlContent = hasDeceptiveUrl(message.content);
  const hasShortenerUrl = containsUrlShortener(message.content);

  if (!canBeModerated(member, botMember)) {
    let scamDetected = false;
    let scamReasons = [];
    
    if (isScamContent) {
      scamDetected = true;
      scamReasons.push("matched scam pattern");
    }
    
    if (hasExternalUrl||hasShortenerUrl) {
      scamDetected = true;
      scamReasons.push("contains external URL");
    }
    
    if (hasDeceptiveUrlContent) {
      scamDetected = true;
      scamReasons.push("contains deceptive URL");
    }
    
    console.log(`Skipping scam check for protected/higher role user ${author.tag}${scamDetected ? ` [WOULD TRIGGER: ${scamReasons.join(", ")}]` : ""}`);
    return;
  }

  // Check if all mentioned users have only the base role
  const mentionedUsersHaveOnlyBaseRole = message.mentions.users.size > 0 
    ? await Promise.all(
        message.mentions.users.map(async (user) => {
          const member = await message.guild.members.fetch(user);
          return member.roles.cache.size === 2 && member.roles.cache.has(BASE_ROLE_ID);
        })
      ).then(results => results.every(Boolean))
    : false;
  const isScamUser = userDisplayName.some(pattern => pattern.test(member.displayName));
  const hasMentions = (message.mentions.users.size > 0 && mentionedUsersHaveOnlyBaseRole) || message.mentions.everyone;
  const hasAnyMentions = (message.mentions.users.size > 0) || message.mentions.everyone;

  const userRoles = message.member.roles.cache;
  // Check if the user has only the base role
  const hasOnlyBaseRole = userRoles.size === 2 && userRoles.has(BASE_ROLE_ID);
      
  if (!recentMessages.has(key)) {
    recentMessages.set(key, new Set());
  }

  const channels = recentMessages.get(key);
  channels.add(channel.id);

  // If the same message appears in more than 2 channels, quarantine it
  if (channels.size > 2 && hasOnlyBaseRole) {
    await quarantineMessage(message, channels);
    return;
  }
  setTimeout(() => {
    channels.delete(channel.id);
    if (channels.size === 0) {
      recentMessages.delete(key);
    }
  }, 3600000); // 1 hour in milliseconds

  const isTargetedScam = isTargetedScamMessage(message, hasOnlyBaseRole, hasMentions, hasExternalUrl);

  if (((isScamContent || (hasExternalUrl && hasMentions) || hasDeceptiveUrlContent || hasShortenerUrl) && hasOnlyBaseRole) || isTargetedScam || isScamUser) {
    await quarantineMessage(message, new Set([channel.id]));
  }

  // Handle repeated mentions and spam occurrences
  if (isSuspectedScammer(author.id)) {
    if (hasAnyMentions) {
      await handleRepeatedMentions(message);
    }
    await handleSpamOccurrences(message);
  }
}

async function quarantineMessage(message, channelIds) {
  try {
    const { guild, author, content, member } = message;
    const scammer = addSuspectedScammer(author.id);
    
    // Delete all instances of the message
    const deletionPromises = Array.from(channelIds).map(async (channelId) => {
      const channel = await guild.channels.fetch(channelId);
      const messages = await channel.messages.fetch({ limit: 100 });
      const userMessages = messages.filter(m => m.author.id === author.id && m.content === content);
      return Promise.all(userMessages.map(async m => 
      {
          if (m.deletable) {
            await m.delete();
          }
      }));
    });
    
    await Promise.all(deletionPromises);
    
    console.log(`Quarantined message from ${author.tag} in ${channelIds.size} channel(s).`);

    const joinDate = member.joinedAt.toDateString();
    const displayName = member.displayName;
    const username = author.username;
    const userId = author.id;
    const accountCreatedAt = author.createdAt.toDateString();
    
    const roles = member.roles.cache
      .filter(role => role.name !== '@everyone')
      .map(role => role.name)
      .join(', ');

    const originalMessage = content.trim();

    // Create an embed with the provided information
    const warningMessageEmbed = createWarningMessageEmbed(
      accountCreatedAt, joinDate, displayName, username, userId, roles, channelIds, originalMessage,
      scammer.spamOccurrences
    );

    const reportChannel = await guild.channels.fetch(SCAM_CHANNEL_ID);
    if (reportChannel) {
      await sendThreadedReport(reportChannel, author, warningMessageEmbed);
    } else {
      console.error('Report channel not found');
    }
  } catch (error) {
    console.error('Failed to quarantine message or send warning:', error);
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
  const plainUrlRegex = /(?<![.@\w])((?:\w+\.)+(?:com|org|net|io|finance|xyz|app|dev|info|co|gg))\b/gi;
  
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
  // Regular expression to match URLs
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
  
  // Also check for shortened links without http/https
  for (const shortener of URL_SHORTENERS) {
    const shortenerRegex = new RegExp(`\\b${shortener}\\b`, 'i');
    if (shortenerRegex.test(content)) {
      console.log(`URL shortener detected without protocol: ${shortener}`);
      return true;
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
    
    // Delete the message with the unauthorized URL
    await message.delete();
    
    dailyInterceptCount++; //keep track of daily intercepts

    // Simple notification message
    const dmContent = `🌱 Hey ${message.author.username}, your message in #${message.channel.name} was removed due to an unauthorized URL.\n\n Only links from garden.finance, x.com, and internal Discord links are allowed. If you need to share something else, raise a ticket and our mods will help you🌸.`;    
    // Send DM to user
    try {
      await message.author.send({ content: dmContent });
    } catch (dmError) {
      // DM failed, user might have DMs disabled - fall back to a temporary channel message
      console.log(`Failed to send DM to ${userName}: ${dmError.message}`);
      
      // Send a brief notice in the channel that will be deleted shortly
      const tempMsg = await message.channel.send({
        content: `<@${userId}> Your message with an unauthorized URL was removed. Please check server rules about acceptable links.`,
        allowedMentions: { users: [userId] }
      });
      
      // Delete the notice after a short delay
      setTimeout(() => {
        if (tempMsg.deletable) {
          tempMsg.delete().catch(err => console.error('Failed to delete temp message:', err));
        }
      }, 8000); // Delete after 8 seconds
    }
    
    // Log the action
    console.log(`Unauthorized URL removed from ${userName} (${userId})`);
    
    return true;
  } catch (error) {
    console.error('Failed to handle unauthorized URL:', error);
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

function setupSimpleDailyReport(client) {
  // Check every hour if we should send a report
  setInterval(async () => {
    const now = new Date();
    const todayMidnight = new Date().setHours(0, 0, 0, 0);
    
    // If it's a new day and we haven't reported yet
    if (todayMidnight > lastReportTime) {
      try {
        // Get the guild
        const guild = client.guilds.cache.first();
        if (!guild) return;
        
        // Get the report channel
        const reportChannel = await guild.channels.fetch(SCAM_CHANNEL_ID);
        if (!reportChannel) return;
        
        // Format the date for yesterday (UTC)
        const yesterday = new Date(lastReportTime);
        const formattedDate = yesterday.toISOString().split('T')[0];
        
        // Send the report with the date
        await reportChannel.send(
          `📊 **URL Filter Report for ${formattedDate} (UTC)**\n\nUnauthorized URLs intercepted: **${dailyInterceptCount}**`
        );
        
        // Reset for the new day
        lastReportTime = todayMidnight;
        dailyInterceptCount = 0;
        
        console.log(`Sent URL report for ${formattedDate}`);
      } catch (error) {
        console.error('Error sending daily report:', error);
      }
    }
  }, 60 * 60 * 1000); // Check once per hour
}

module.exports = {
  handleMessage,
  handleScamMessage,
  addSuspectedScammer,
  quarantineMessage,
  celebratoryGifs,
  suspiciousUserThreads,
  setupSimpleDailyReport
};