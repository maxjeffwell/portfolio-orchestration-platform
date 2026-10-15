import Redis from 'ioredis';
import { RedisStore } from 'rate-limit-redis';
import logger from './logger.js';

/**
 * Shared (cross-replica) counter store for express-rate-limit.
 *
 * portfolio-api runs 2 replicas; express-rate-limit's default MemoryStore
 * counts per pod, so the login limiter silently allowed 2x the configured
 * failed attempts. With REDIS_URL set the counter lives in Redis (default/redis,
 * Sentinel-backed) and both replicas see the same number. Without it this
 * returns undefined and the limiter keeps its in-memory behaviour (local dev).
 *
 * Keys are `rl:<name>:<ip>`. Fail-open: rateLimit() is created with
 * `passOnStoreError: true`, so a Redis outage lets logins through (logged)
 * instead of returning 500s; CrowdSec still sits in front.
 */

let sharedClient;
let lastErrorLog = 0;

function clientFor(url, password) {
  if (sharedClient) return sharedClient;
  sharedClient = new Redis(url, {
    password: password || undefined,
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    retryStrategy: (times) => Math.min(times * 500, 5000),
  });
  sharedClient.on('error', (err) => {
    const now = Date.now();
    if (now - lastErrorLog > 60_000) {
      lastErrorLog = now;
      logger.warn(`Rate-limit Redis error (requests pass unthrottled meanwhile): ${err.message}`);
    }
  });
  sharedClient.connect().catch(() => {});
  return sharedClient;
}

export function createRateLimitStore(name, opts = {}) {
  if (!name) throw new Error('createRateLimitStore: a limiter name is required');
  const url = 'url' in opts ? opts.url : process.env.REDIS_URL;
  if (!url) {
    logger.warn(`REDIS_URL unset: "${name}" rate limit is per-pod (in-memory)`);
    return undefined;
  }
  const client = opts.client ?? clientFor(url, opts.password ?? process.env.REDIS_PASSWORD);
  const store = new RedisStore({
    prefix: `rl:${name}:`,
    sendCommand: (...args) => client.call(...args),
  });
  // rate-limit-redis 4.x issues SCRIPT LOAD in its constructor and only awaits
  // the stored promises (inside try/catch, with a reload on failure) on the
  // first increment/get. If Redis is unreachable at boot that early rejection
  // has no handler yet and Node kills the process. Observe them here; the real
  // consumers still see (and recover from) the rejection.
  store.incrementScriptSha?.catch?.(() => {});
  store.getScriptSha?.catch?.(() => {});
  return store;
}
