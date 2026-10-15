import rateLimit from 'express-rate-limit';
import logger from '../utils/logger.js';
import { createRateLimitStore } from '../utils/rateLimitStore.js';

/**
 * Brute-force protection for POST /api/auth/login.
 *
 * Counts FAILED logins per client IP (successful logins are not counted), so a
 * user who logs in correctly is never slowed down. The client IP is req.ip,
 * which relies on `trust proxy` = 2 in index.js (Cloudflare -> Traefik -> API).
 *
 * Env overrides: LOGIN_RATE_LIMIT_MAX (default 10), LOGIN_RATE_LIMIT_WINDOW_MIN (default 15).
 *
 * The counter is shared across replicas through Redis when REDIS_URL is set
 * (utils/rateLimitStore.js); otherwise it is per pod, i.e. 2 replicas = 2x max.
 */
const windowMinutes = parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MIN || '15', 10);
const max = parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '10', 10);

const baseOptions = {
  windowMs: windowMinutes * 60 * 1000,
  limit: max,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    logger.warn(`Login rate limit hit for ${req.ip} (username: ${req.body?.username ?? '?'})`);
    res.status(options.statusCode).json({
      success: false,
      error: `Too many failed login attempts. Try again in ${windowMinutes} minutes.`,
    });
  },
};

const sharedStore = createRateLimitStore('login'); // undefined without REDIS_URL

/**
 * Either a single in-memory limiter (no REDIS_URL) or a chain of two: the
 * Redis-backed limiter shared by all replicas, then an in-memory per-pod
 * backstop. When Redis is down or not yet connected the first one lets the
 * request through (passOnStoreError) and the backstop still enforces today's
 * per-pod limit, so an outage never means "no limit". Express accepts the
 * array anywhere a middleware goes.
 */
export const loginLimiter = sharedStore
  ? [rateLimit({ ...baseOptions, store: sharedStore, passOnStoreError: true }), rateLimit(baseOptions)]
  : rateLimit(baseOptions);
