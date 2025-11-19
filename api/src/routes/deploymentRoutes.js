import express from 'express';
import deploymentController from '../controllers/deploymentController.js';

const router = express.Router();

// Get all deployments in a namespace
router.get('/', deploymentController.getAllDeployments.bind(deploymentController));

// Get all portfolio deployments (filtered by label portfolio=true)
router.get('/portfolio', deploymentController.getPortfolioDeployments.bind(deploymentController));

// Get a specific deployment by name
router.get('/:name', deploymentController.getDeploymentByName.bind(deploymentController));

// Scale a deployment
router.post('/:name/scale', deploymentController.scaleDeployment.bind(deploymentController));

// Restart a deployment (rolling restart)
router.post('/:name/restart', deploymentController.restartDeployment.bind(deploymentController));

export default router;
