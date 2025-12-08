import logger from './logger.js';

/**
 * Async handler wrapper for Express route handlers
 * Eliminates repetitive try-catch blocks in controllers
 *
 * @param {Function} fn - Async controller function
 * @returns {Function} - Express middleware function
 */
export const asyncHandler = (fn) => {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      logger.error(`${req.method} ${req.path} - ${error.message}`, {
        stack: error.stack,
        user: req.user?.username,
      });

      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  };
};

/**
 * Send standardized success response
 *
 * @param {Object} res - Express response object
 * @param {*} data - Response data
 * @param {number} statusCode - HTTP status code (default: 200)
 */
export const sendSuccess = (res, data, statusCode = 200) => {
  const response = { success: true };

  if (Array.isArray(data)) {
    response.count = data.length;
    response.data = data;
  } else if (data !== undefined) {
    response.data = data;
  }

  res.status(statusCode).json(response);
};

/**
 * Custom error class with status code
 */
export class ApiError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'ApiError';
  }
}
