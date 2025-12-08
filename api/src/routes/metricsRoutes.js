import express from 'express';
import metricsController from '../controllers/metricsController.js';
import validate from '../middleware/validation/validationMiddleware.js';
import { metricsNamespace } from '../middleware/validation/rules.js';

const router = express.Router();

// Get all metrics (for Analytics page)
router.get('/', metricsController.getAllMetrics.bind(metricsController));

// Get pod metrics
router.get('/pods', validate(metricsNamespace), metricsController.getPodMetrics.bind(metricsController));

// Get node metrics
router.get('/nodes', metricsController.getNodeMetrics.bind(metricsController));

// Get cluster metrics
router.get('/cluster', metricsController.getClusterMetrics.bind(metricsController));

export default router;
