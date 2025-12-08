import { v4 as uuidv4 } from 'uuid';

/**
 * Middleware to generate and attach a unique request ID to each request
 * The request ID is used for error correlation and logging
 */
const requestIdMiddleware = (req, res, next) => {
  // Check if request ID is already present (e.g., from load balancer)
  const requestId = req.headers['x-request-id'] || uuidv4();

  // Attach to request object for use in controllers and error handlers
  req.requestId = requestId;

  // Return in response headers for client-side correlation
  res.setHeader('X-Request-ID', requestId);

  next();
};

export default requestIdMiddleware;
