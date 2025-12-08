import express from 'express';
import deploymentController from '../controllers/deploymentController.js';
import validate from '../middleware/validation/validationMiddleware.js';
import { deploymentNamespace, deploymentName, scaleDeployment } from '../middleware/validation/rules.js';

const router = express.Router();

// Get all deployments in a namespace
router.get('/', validate(deploymentNamespace), deploymentController.getAllDeployments.bind(deploymentController));

// Get all portfolio deployments (filtered by label portfolio=true)
router.get('/portfolio', deploymentController.getPortfolioDeployments.bind(deploymentController));

// Get a specific deployment by name
router.get('/:name', validate([...deploymentName, ...deploymentNamespace]), deploymentController.getDeploymentByName.bind(deploymentController));

// Scale a deployment
router.post('/:name/scale', validate(scaleDeployment), deploymentController.scaleDeployment.bind(deploymentController));

// Restart a deployment (rolling restart)
router.post('/:name/restart', validate([...deploymentName, ...deploymentNamespace]), deploymentController.restartDeployment.bind(deploymentController));

export default router;
