import rateLimit from 'express-rate-limit';
import logger from '../utils/logger.js';

/**
 * Brute-force protection for POST /api/auth/login.
 *
 * Counts FAILED logins per client IP (successful logins are not counted), so a
 * user who logs in correctly is never slowed down. The client IP is req.ip,
 * which relies on `trust proxy` = 2 in index.js (Cloudflare -> Traefik -> API).
 *
 * Env overrides: LOGIN_RATE_LIMIT_MAX (default 10), LOGIN_RATE_LIMIT_WINDOW_MIN (default 15).
 */
const windowMinutes = parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MIN || '15', 10);
const max = parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '10', 10);

export const loginLimiter = rateLimit({
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
});
