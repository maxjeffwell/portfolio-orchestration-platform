import k8sClient from '../config/kubernetes.js';
import logger from '../utils/logger.js';

class MetricsController {
  async getPodMetrics(req, res) {
    try {
      const metricsClient = k8sClient.getMetricsClient();
      const namespace = req.query.namespace || 'default';

      const response = await metricsClient.getPodMetrics(namespace);

      const metrics = response.items.map(item => ({
        metadata: {
          name: item.metadata.name,
          namespace: item.metadata.namespace,
        },
        usage: {
          cpu: item.containers.reduce((sum, c) => sum + this.parseCpu(c.usage.cpu), 0),
          memory: item.containers.reduce((sum, c) => sum + this.parseMemory(c.usage.memory), 0),
        },
        containers: item.containers.map(c => ({
          name: c.name,
          usage: {
            cpu: this.parseCpu(c.usage.cpu),
            memory: this.parseMemory(c.usage.memory),
          },
        })),
      }));

      res.json({
        success: true,
        count: metrics.length,
        data: metrics,
      });
    } catch (error) {
      logger.error('Error fetching pod metrics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch pod metrics',
        message: error.message,
      });
    }
  }

  async getNodeMetrics(req, res) {
    try {
      const metricsClient = k8sClient.getMetricsClient();

      const response = await metricsClient.getNodeMetrics();

      const metrics = response.items.map(item => ({
        metadata: {
          name: item.metadata.name,
        },
        usage: {
          cpu: this.parseCpu(item.usage.cpu),
          memory: this.parseMemory(item.usage.memory),
        },
      }));

      res.json({
        success: true,
        count: metrics.length,
        data: metrics,
      });
    } catch (error) {
      logger.error('Error fetching node metrics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch node metrics',
        message: error.message,
      });
    }
  }

  async getClusterMetrics(req, res) {
    try {
      const coreV1Api = k8sClient.getCoreV1Api();

      // Get nodes
      const nodesResponse = await coreV1Api.listNode();
      const nodes = nodesResponse.body.items;

      // Get pods
      const podsResponse = await coreV1Api.listPodForAllNamespaces();
      const pods = podsResponse.body.items;

      // Try to get metrics if available
      let totalCpu = 0;
      let totalMemory = 0;
      let metricsAvailable = false;

      try {
        const metricsClient = k8sClient.getMetricsClient();
        const podMetrics = await metricsClient.getPodMetrics();

        podMetrics.items.forEach(item => {
          item.containers.forEach(c => {
            totalCpu += this.parseCpu(c.usage.cpu);
            totalMemory += this.parseMemory(c.usage.memory);
          });
        });
        metricsAvailable = true;
      } catch (err) {
        logger.warn('Metrics not available:', err.message);
      }

      const clusterMetrics = {
        nodes: nodes.length,
        totalPods: pods.length,
        runningPods: pods.filter(p => p.status.phase === 'Running').length,
        pendingPods: pods.filter(p => p.status.phase === 'Pending').length,
        failedPods: pods.filter(p => p.status.phase === 'Failed').length,
        namespaces: [...new Set(pods.map(p => p.metadata.namespace))].length,
      };

      if (metricsAvailable) {
        clusterMetrics.cpuUsage = Math.round(totalCpu);
        clusterMetrics.memoryUsage = Math.round(totalMemory / (1024 * 1024 * 1024) * 100) / 100; // GB
      }

      res.json({
        success: true,
        data: clusterMetrics,
      });
    } catch (error) {
      logger.error('Error fetching cluster metrics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch cluster metrics',
        message: error.message,
      });
    }
  }

  // Helper methods to parse CPU and memory values
  parseCpu(cpuString) {
    // CPU can be in formats like "250m" (250 millicores), "1" (1 core), "0.5" (500 millicores)
    if (!cpuString) return 0;

    if (cpuString.endsWith('n')) {
      return parseFloat(cpuString) / 1000000000; // nanocores to cores
    } else if (cpuString.endsWith('u')) {
      return parseFloat(cpuString) / 1000000; // microcores to cores
    } else if (cpuString.endsWith('m')) {
      return parseFloat(cpuString) / 1000; // millicores to cores
    }
    return parseFloat(cpuString);
  }

  parseMemory(memoryString) {
    // Memory can be in formats like "128Mi", "1Gi", "1024Ki", or raw bytes
    if (!memoryString) return 0;

    const units = {
      'Ki': 1024,
      'Mi': 1024 * 1024,
      'Gi': 1024 * 1024 * 1024,
      'Ti': 1024 * 1024 * 1024 * 1024,
      'K': 1000,
      'M': 1000 * 1000,
      'G': 1000 * 1000 * 1000,
      'T': 1000 * 1000 * 1000 * 1000,
    };

    for (const [unit, multiplier] of Object.entries(units)) {
      if (memoryString.endsWith(unit)) {
        return parseFloat(memoryString) * multiplier;
      }
    }

    return parseFloat(memoryString); // Assume bytes if no unit
  }
}

export default new MetricsController();
