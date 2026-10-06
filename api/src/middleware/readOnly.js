import logger from '../utils/logger.js';

/**
 * Read-only mode (2026-10-06).
 *
 * The dashboard is reachable from the internet. In read-only mode the API
 * refuses every request that would change cluster state or user-visible
 * state (scale / restart / delete pods and deployments, send / delete
 * notifications) regardless of who is logged in. Reads, login and AI chat
 * still work. Defaults to ON; set READ_ONLY=false to re-enable mutations.
 *
 * This is the application layer of a two-layer guard: the ServiceAccount's
 * ClusterRole (k8s/deployments/portfolio-api-rbac.yaml) only grants
 * get/list/watch, so even a bypass here cannot mutate the cluster.
 */
export const READ_ONLY = (process.env.READ_ONLY || 'true').toLowerCase() !== 'false';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const readOnlyGuard = (req, res, next) => {
  if (!READ_ONLY || !MUTATING_METHODS.has(req.method)) {
    return next();
  }
  logger.warn('Blocked mutation in read-only mode', {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    user: req.user?.username,
  });
  return res.status(403).json({
    success: false,
    error: 'This dashboard is read-only',
    readOnly: true,
  });
};
