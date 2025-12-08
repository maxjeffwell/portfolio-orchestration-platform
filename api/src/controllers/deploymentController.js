import deploymentService from '../services/deploymentService.js';
import { asyncHandler, sendSuccess, ApiError } from '../utils/asyncHandler.js';

class DeploymentController {
  getAllDeployments = asyncHandler(async (req, res) => {
    const namespace = req.query.namespace || 'default';
    const deployments = await deploymentService.getAllDeployments(namespace);
    sendSuccess(res, deployments);
  });

  getPortfolioDeployments = asyncHandler(async (req, res) => {
    const deployments = await deploymentService.getPortfolioDeployments();
    sendSuccess(res, deployments);
  });

  getDeploymentByName = asyncHandler(async (req, res) => {
    const { name } = req.params;
    const namespace = req.query.namespace || 'default';
    const deployment = await deploymentService.getDeploymentByName(name, namespace);
    sendSuccess(res, deployment);
  });

  scaleDeployment = asyncHandler(async (req, res) => {
    const { name } = req.params;
    const namespace = req.query.namespace || 'default';
    const { replicas } = req.body;

    if (typeof replicas !== 'number' || replicas < 0) {
      throw new ApiError('Invalid replicas value. Must be a positive number.', 400);
    }

    const result = await deploymentService.scaleDeployment(name, namespace, replicas);
    sendSuccess(res, result);
  });

  restartDeployment = asyncHandler(async (req, res) => {
    const { name } = req.params;
    const namespace = req.query.namespace || 'default';
    const result = await deploymentService.restartDeployment(name, namespace);
    sendSuccess(res, result);
  });
}

export default new DeploymentController();
