import podService from '../services/podService.js';
import { asyncHandler, sendSuccess } from '../utils/asyncHandler.js';

class PodController {
  getAllPods = asyncHandler(async (req, res) => {
    const namespace = req.query.namespace || 'default';
    const pods = await podService.getAllPods(namespace);
    sendSuccess(res, pods);
  });

  getPortfolioPods = asyncHandler(async (req, res) => {
    const pods = await podService.getPortfolioPods();
    sendSuccess(res, pods);
  });

  getAllPodsAllNamespaces = asyncHandler(async (req, res) => {
    const pods = await podService.getAllPodsAllNamespaces();
    sendSuccess(res, pods);
  });

  getPodByName = asyncHandler(async (req, res) => {
    const { name } = req.params;
    const namespace = req.query.namespace || 'default';
    const pod = await podService.getPodByName(name, namespace);
    sendSuccess(res, pod);
  });

  getPodLogs = asyncHandler(async (req, res) => {
    const { name } = req.params;
    const namespace = req.query.namespace || 'default';
    const containerName = req.query.container || null;
    const tailLines = parseInt(req.query.tail) || 100;
    const logs = await podService.getPodLogs(name, namespace, containerName, tailLines);
    sendSuccess(res, logs);
  });

  deletePod = asyncHandler(async (req, res) => {
    const { name } = req.params;
    const namespace = req.query.namespace || 'default';
    const result = await podService.deletePod(name, namespace);
    sendSuccess(res, result);
  });

  restartPod = asyncHandler(async (req, res) => {
    const { name } = req.params;
    const namespace = req.query.namespace || 'default';
    const result = await podService.restartPod(name, namespace);
    sendSuccess(res, result);
  });
}

export default new PodController();
