import express from 'express';
import podController from '../controllers/podController.js';

const router = express.Router();

// Get all pods in a namespace
router.get('/', podController.getAllPods.bind(podController));

// Get all portfolio pods (filtered by label portfolio=true)
router.get('/portfolio', podController.getPortfolioPods.bind(podController));

// Get a specific pod by name
router.get('/:name', podController.getPodByName.bind(podController));

// Get logs for a specific pod
router.get('/:name/logs', podController.getPodLogs.bind(podController));

// Restart a pod (deletes it, will be recreated if part of deployment/statefulset)
router.post('/:name/restart', podController.restartPod.bind(podController));

// Delete a pod (will trigger restart if part of deployment)
router.delete('/:name', podController.deletePod.bind(podController));

export default router;
