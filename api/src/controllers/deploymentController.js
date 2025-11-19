import deploymentService from '../services/deploymentService.js';
import logger from '../utils/logger.js';

class DeploymentController {
  async getAllDeployments(req, res) {
    try {
      const namespace = req.query.namespace || 'default';
      const deployments = await deploymentService.getAllDeployments(namespace);

      res.json({
        success: true,
        count: deployments.length,
        data: deployments,
      });
    } catch (error) {
      logger.error('Error in getAllDeployments controller:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get deployments',
      });
    }
  }

  async getPortfolioDeployments(req, res) {
    try {
      const deployments = await deploymentService.getPortfolioDeployments();

      res.json({
        success: true,
        count: deployments.length,
        data: deployments,
      });
    } catch (error) {
      logger.error('Error in getPortfolioDeployments controller:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get portfolio deployments',
      });
    }
  }

  async getDeploymentByName(req, res) {
    try {
      const { name } = req.params;
      const namespace = req.query.namespace || 'default';

      const deployment = await deploymentService.getDeploymentByName(name, namespace);

      res.json({
        success: true,
        data: deployment,
      });
    } catch (error) {
      logger.error('Error in getDeploymentByName controller:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get deployment',
      });
    }
  }

  async scaleDeployment(req, res) {
    try {
      const { name } = req.params;
      const namespace = req.query.namespace || 'default';
      const { replicas } = req.body;

      if (typeof replicas !== 'number' || replicas < 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid replicas value. Must be a positive number.',
        });
      }

      const result = await deploymentService.scaleDeployment(name, namespace, replicas);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Error in scaleDeployment controller:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to scale deployment',
      });
    }
  }

  async restartDeployment(req, res) {
    try {
      const { name } = req.params;
      const namespace = req.query.namespace || 'default';

      const result = await deploymentService.restartDeployment(name, namespace);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Error in restartDeployment controller:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to restart deployment',
      });
    }
  }
}

export default new DeploymentController();
