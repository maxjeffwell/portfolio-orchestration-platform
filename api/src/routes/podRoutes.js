import express from 'express';
import podController from '../controllers/podController.js';
import validate from '../middleware/validation/validationMiddleware.js';
import { podName, podNamespace, podLogs } from '../middleware/validation/rules.js';

const router = express.Router();

// Get all pods in a namespace
router.get('/', validate(podNamespace), podController.getAllPods.bind(podController));

// Get all portfolio pods (filtered by label portfolio=true)
router.get('/portfolio', podController.getPortfolioPods.bind(podController));

// Get all pods across all namespaces
router.get('/all', podController.getAllPodsAllNamespaces.bind(podController));

// Get a specific pod by name
router.get('/:name', validate([...podName, ...podNamespace]), podController.getPodByName.bind(podController));

// Get logs for a specific pod
router.get('/:name/logs', validate(podLogs), podController.getPodLogs.bind(podController));

// Restart a pod (deletes it, will be recreated if part of deployment/statefulset)
router.post('/:name/restart', validate([...podName, ...podNamespace]), podController.restartPod.bind(podController));

// Delete a pod (will trigger restart if part of deployment)
router.delete('/:name', validate([...podName, ...podNamespace]), podController.deletePod.bind(podController));

export default router;
