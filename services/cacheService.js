const fs = require('fs').promises;
const path = require('path');
const logger = require('../logger');

/**
 * Cache Service - Handles caching of TestRail test cases
 */
class CacheService {
  constructor() {
    this.cache = new Map(); // In-memory cache
    this.cacheDir = path.join(__dirname, '..', 'cache');
    this.defaultTTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  }

  /**
   * Initialize cache directory
   */
  async initialize() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      logger.info('Cache service initialized');
      
      // Load existing cache files into memory
      await this.loadCacheFromDisk();
    } catch (error) {
      logger.error(`Failed to initialize cache: ${error.message}`);
    }
  }

  /**
   * Load cache files from disk into memory
   */
  async loadCacheFromDisk() {
    try {
      const files = await fs.readdir(this.cacheDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.cacheDir, file);
          const content = await fs.readFile(filePath, 'utf8');
          const cacheData = JSON.parse(content);
          
          // Only load if not expired
          if (cacheData.expiresAt > Date.now()) {
            const key = file.replace('.json', '');
            this.cache.set(key, cacheData);
            logger.info(`Loaded cache: ${key}`);
          } else {
            // Delete expired cache file
            await fs.unlink(filePath);
            logger.info(`Deleted expired cache: ${file}`);
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to load cache from disk: ${error.message}`);
    }
  }

  /**
   * Get cached data
   * @param {string} key - Cache key
   * @returns {any|null} Cached data or null if not found/expired
   */
  async get(key) {
    const cacheData = this.cache.get(key);
    
    if (!cacheData) {
      logger.info(`Cache miss: ${key}`);
      return null;
    }

    // Check if expired
    if (cacheData.expiresAt < Date.now()) {
      logger.info(`Cache expired: ${key}`);
      await this.delete(key);
      return null;
    }

    logger.info(`Cache hit: ${key}`);
    return cacheData.data;
  }

  /**
   * Set cache data
   * @param {string} key - Cache key
   * @param {any} data - Data to cache
   * @param {number} ttl - Time to live in milliseconds (optional)
   */
  async set(key, data, ttl = this.defaultTTL) {
    const cacheData = {
      data,
      cachedAt: Date.now(),
      expiresAt: Date.now() + ttl
    };

    // Store in memory
    this.cache.set(key, cacheData);

    // Store on disk
    try {
      const filePath = path.join(this.cacheDir, `${key}.json`);
      await fs.writeFile(filePath, JSON.stringify(cacheData, null, 2));
      logger.info(`Cached: ${key} (TTL: ${ttl / 1000 / 60} minutes)`);
    } catch (error) {
      logger.error(`Failed to write cache to disk: ${error.message}`);
    }
  }

  /**
   * Delete cached data
   * @param {string} key - Cache key
   */
  async delete(key) {
    // Remove from memory
    this.cache.delete(key);

    // Remove from disk
    try {
      const filePath = path.join(this.cacheDir, `${key}.json`);
      await fs.unlink(filePath);
      logger.info(`Deleted cache: ${key}`);
    } catch (error) {
      // File might not exist, that's ok
      if (error.code !== 'ENOENT') {
        logger.error(`Failed to delete cache file: ${error.message}`);
      }
    }
  }

  /**
   * Clear all cache
   */
  async clearAll() {
    // Clear memory
    this.cache.clear();

    // Clear disk
    try {
      const files = await fs.readdir(this.cacheDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          await fs.unlink(path.join(this.cacheDir, file));
        }
      }
      logger.info('All cache cleared');
    } catch (error) {
      logger.error(`Failed to clear cache: ${error.message}`);
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    const stats = {
      totalCached: this.cache.size,
      caches: []
    };

    for (const [key, cacheData] of this.cache.entries()) {
      stats.caches.push({
        key,
        cachedAt: new Date(cacheData.cachedAt).toISOString(),
        expiresAt: new Date(cacheData.expiresAt).toISOString(),
        dataSize: JSON.stringify(cacheData.data).length
      });
    }

    return stats;
  }

  /**
   * Generate cache key for test run
   * @param {string} runId - TestRail Run ID
   * @returns {string} Cache key
   */
  static getTestsCacheKey(runId) {
    return `tests-run-${runId}`;
  }
}

module.exports = new CacheService();
