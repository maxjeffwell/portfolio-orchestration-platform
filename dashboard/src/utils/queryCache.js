/**
 * Simple in-memory cache for API queries
 * Prevents redundant fetches and reduces load on backend
 */

class QueryCache {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Get cached data if available and not expired
   * @param {string} key - Cache key
   * @param {number} ttl - Time to live in milliseconds
   * @returns {any|null} Cached data or null if expired/missing
   */
  get(key, ttl = 30000) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const isExpired = Date.now() - entry.timestamp > ttl;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set cached data
   * @param {string} key - Cache key
   * @param {any} data - Data to cache
   */
  set(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear specific cache entry or all entries
   * @param {string} [key] - Optional key to clear specific entry
   */
  clear(key) {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Get cache size
   * @returns {number} Number of cached entries
   */
  size() {
    return this.cache.size;
  }
}

// Export singleton instance
export const queryCache = new QueryCache();

/**
 * Higher-order function to wrap async functions with caching
 * @param {Function} fetchFn - Async function to fetch data
 * @param {string} cacheKey - Cache key
 * @param {number} ttl - Time to live in milliseconds (default: 30s)
 * @returns {Promise} Cached or fresh data
 */
export async function withCache(fetchFn, cacheKey, ttl = 30000) {
  // Check cache first
  const cached = queryCache.get(cacheKey, ttl);
  if (cached !== null) {
    console.debug(`Cache HIT: ${cacheKey}`);
    return cached;
  }

  // Cache miss - fetch fresh data
  console.debug(`Cache MISS: ${cacheKey}`);
  try {
    const data = await fetchFn();
    queryCache.set(cacheKey, data);
    return data;
  } catch (error) {
    // Don't cache errors
    throw error;
  }
}
