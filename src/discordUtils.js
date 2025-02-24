const messageCache = new Map();
const MESSAGE_CACHE_TTL = 5000; // 5 seconds

async function sendAlert(client, embeddedMessage, channelId) {
  if (!client) {
    console.error('Discord client is not initialized.');
    return;
  }
  
  const channel = client.channels.cache.get(channelId);
  if (!channel) {
    console.error(`Channel with ID ${channelId} not found.`);
    return;
  }

  // Create a cache key from the embedded message content
  const cacheKey = JSON.stringify({
    title: embeddedMessage.data.title,
    fields: embeddedMessage.data.fields
  });

  // Check if we've sent this message recently
  const lastSent = messageCache.get(cacheKey);
  if (lastSent && Date.now() - lastSent < MESSAGE_CACHE_TTL) {
    console.log('Skipping duplicate message within TTL period');
    return;
  }

  // Update cache and send message
  messageCache.set(cacheKey, Date.now());
  await channel.send({ embeds: [embeddedMessage] });

  // Clean up old cache entries
  setTimeout(() => messageCache.delete(cacheKey), MESSAGE_CACHE_TTL);
}

module.exports = {
  sendAlert
};