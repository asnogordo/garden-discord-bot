// Simple health check script for docker
const fs = require('fs');

try {
  // Check if the bot process is running
  if (fs.existsSync('bot.pid')) {
    const pid = parseInt(fs.readFileSync('bot.pid', 'utf8').trim());
    
    try {
      // Try to send a signal 0 to the process (doesn't actually send a signal)
      // Will throw an error if the process doesn't exist
      process.kill(pid, 0);
      console.log("Bot process is running");
      process.exit(0);
    } catch (e) {
      console.error("Bot process is not running");
      process.exit(1);
    }
  } else {
    // Check if bot is in startup phase
    if (process.env.NODE_ENV === 'development') {
      // Be more lenient in development
      console.log("PID file not found, but we're in development mode");
      process.exit(0);
    } else {
      console.error("PID file not found");
      process.exit(1);
    }
  }
} catch (error) {
  console.error("Health check failed:", error);
  process.exit(1);
}