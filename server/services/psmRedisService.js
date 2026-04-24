// ============================================================================
// REDIS SERVICE FOR PSM DATA (Redis v4 Compatible)
// server/services/psmRedisService.js
// ============================================================================

const redis = require('redis');

// Create Redis client with v4 API
const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        return new Error('Redis retry limit exhausted');
      }
      return Math.min(retries * 100, 3000);
    }
  }
});

// Error handling
redisClient.on('error', (err) => {
  console.error('❌ Redis Error:', err.message);
});

redisClient.on('connect', () => {
  console.log('✅ Redis connected (read-only mode)');
});

redisClient.on('ready', () => {
  console.log('✅ Redis ready to accept commands');
});

// Connect to Redis (v4 requires explicit connect)
(async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    console.error('❌ Failed to connect to Redis:', err.message);
  }
})();

/**
 * Get PSM data for a protein from Redis
 * @param {string} proteinId - The protein ID (e.g., "HVO_0001")
 * @returns {Promise<Array>} Array of {dataset, psmCount} objects
 */
async function getPsmsByDataset(proteinId) {
  const cacheKey = `psms:${proteinId}`;
  
  try {
    // Check if client is connected
    if (!redisClient.isOpen) {
      console.error('❌ Redis client is not connected');
      throw new Error('Redis client is not connected');
    }
    
    const data = await redisClient.get(cacheKey);
    
    if (data) {
      return JSON.parse(data);
    } else {
      console.log(`⚠️  No data found in Redis for key: ${cacheKey}`);
      return [];
    }
  } catch (err) {
    console.error(`❌ Redis error for ${proteinId}:`, err.message);
    throw err;
  }
}

/**
 * Get cache statistics
 * @returns {Promise<Object>} Stats about cached data
 */
async function getCacheStats() {
  try {
    if (!redisClient.isOpen) {
      return {
        totalProteinsCached: 0,
        redisConnected: false,
        memoryUsedMB: 0
      };
    }
    
    // Get all PSM keys
    const keys = await redisClient.keys('psms:*');
    
    // Get memory info
    const memInfo = await redisClient.info('memory');
    const memoryMatch = memInfo.match(/used_memory:(\d+)/);
    const memoryBytes = memoryMatch ? parseInt(memoryMatch[1]) : 0;
    const memoryMB = (memoryBytes / (1024 * 1024)).toFixed(2);
    
    return {
      totalProteinsCached: keys.length,
      redisConnected: redisClient.isOpen,
      memoryUsedMB: parseFloat(memoryMB)
    };
  } catch (err) {
    console.error('❌ Error getting cache stats:', err);
    throw err;
  }
}

/**
 * Check if a protein exists in cache
 * @param {string} proteinId 
 * @returns {Promise<boolean>}
 */
async function proteinExistsInCache(proteinId) {
  const cacheKey = `psms:${proteinId}`;
  
  try {
    if (!redisClient.isOpen) {
      return false;
    }
    
    const exists = await redisClient.exists(cacheKey);
    return exists === 1;
  } catch (err) {
    console.error(`❌ Error checking if protein exists:`, err);
    return false;
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Closing Redis connection...');
  await redisClient.quit();
  process.exit(0);
});

/**
 * Get bundled plot-page data for a protein from Redis.
 * @param {string} proteinId
 * @returns {Promise<Object|null>}
 */
async function getProteinPage(proteinId) {
  if (!redisClient.isOpen) return null;
  try {
    const raw = await redisClient.get(`protein:page:${proteinId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error(`Redis protein:page error for ${proteinId}:`, err.message);
    return null;
  }
}

module.exports = {
  getPsmsByDataset,
  getProteinPage,
  getCacheStats,
  proteinExistsInCache,
  redisClient
};