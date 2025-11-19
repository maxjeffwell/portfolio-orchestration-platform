import express from 'express';
import metricsController from '../controllers/metricsController.js';

const router = express.Router();

// Get pod metrics
router.get('/pods', metricsController.getPodMetrics.bind(metricsController));

// Get node metrics
router.get('/nodes', metricsController.getNodeMetrics.bind(metricsController));

// Get cluster metrics
router.get('/cluster', metricsController.getClusterMetrics.bind(metricsController));

export default router;
