import podService from '../services/podService.js';
import logger from '../utils/logger.js';

class PodController {
  async getAllPods(req, res) {
    try {
      const namespace = req.query.namespace || 'default';
      const pods = await podService.getAllPods(namespace);

      res.json({
        success: true,
        count: pods.length,
        data: pods,
      });
    } catch (error) {
      logger.error('Error in getAllPods controller:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get pods',
      });
    }
  }

  async getPortfolioPods(req, res) {
    try {
      const pods = await podService.getPortfolioPods();

      res.json({
        success: true,
        count: pods.length,
        data: pods,
      });
    } catch (error) {
      logger.error('Error in getPortfolioPods controller:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get portfolio pods',
      });
    }
  }

  async getPodByName(req, res) {
    try {
      const { name } = req.params;
      const namespace = req.query.namespace || 'default';

      const pod = await podService.getPodByName(name, namespace);

      res.json({
        success: true,
        data: pod,
      });
    } catch (error) {
      logger.error('Error in getPodByName controller:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get pod',
      });
    }
  }

  async getPodLogs(req, res) {
    try {
      const { name } = req.params;
      const namespace = req.query.namespace || 'default';
      const containerName = req.query.container || null;
      const tailLines = parseInt(req.query.tail) || 100;

      const logs = await podService.getPodLogs(name, namespace, containerName, tailLines);

      res.json({
        success: true,
        data: logs,
      });
    } catch (error) {
      logger.error('Error in getPodLogs controller:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get pod logs',
      });
    }
  }

  async deletePod(req, res) {
    try {
      const { name } = req.params;
      const namespace = req.query.namespace || 'default';

      const result = await podService.deletePod(name, namespace);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Error in deletePod controller:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete pod',
      });
    }
  }

  async restartPod(req, res) {
    try {
      const { name } = req.params;
      const namespace = req.query.namespace || 'default';

      const result = await podService.restartPod(name, namespace);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Error in restartPod controller:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to restart pod',
      });
    }
  }
}

export default new PodController();
