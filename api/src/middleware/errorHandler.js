import logger from '../utils/logger.js';

/**
 * Centralized error handling middleware
 * Logs full error details server-side with request ID for correlation
 * Returns safe, user-friendly error messages to clients
 */
const errorHandler = (err, req, res, next) => {
  const requestId = req.requestId || 'unknown';
  const statusCode = err.statusCode || err.status || 500;
  const isOperationalError = statusCode < 500;

  // Log full error details server-side with structured logging
  logger.error('Error occurred', {
    requestId,
    statusCode,
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    user: req.user?.username,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    isOperational: isOperationalError
  });

  // Determine user-facing error message
  // For operational errors (4xx), return the actual error message
  // For server errors (5xx), return a generic message to avoid leaking internals
  let userMessage;
  if (isOperationalError) {
    // Client errors (400-499): safe to return detailed message
    userMessage = err.message || 'Bad Request';
  } else {
    // Server errors (500-599): return generic message for security
    userMessage = 'An unexpected error occurred. Please try again later.';
  }

  // Send consistent error response format
  res.status(statusCode).json({
    success: false,
    error: userMessage,
    requestId // Include request ID for client-side error tracking
  });
};

export default errorHandler;
