import k8sClient from '../config/kubernetes.js';
import logger from '../utils/logger.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import axios from 'axios';

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://prometheus:9090';

class MetricsController {
  getAllMetrics = asyncHandler(async (req, res) => {
    const coreV1Api = k8sClient.getCoreV1Api();
    const metricsClient = k8sClient.getMetricsClient();

    // Get cluster info
    const nodesResponse = await coreV1Api.listNode();
    const nodes = nodesResponse.body.items;
    const podsResponse = await coreV1Api.listPodForAllNamespaces();
    const allPods = podsResponse.body.items;

    // Get pod metrics
    let podMetrics = [];
    try {
      const podMetricsResponse = await metricsClient.getPodMetrics('default');
      podMetrics = podMetricsResponse.items.map(item => ({
        metadata: {
          name: item.metadata.name,
          namespace: item.metadata.namespace,
        },
        usage: {
          cpu: item.containers.reduce((sum, c) => sum + this.parseCpu(c.usage.cpu), 0) * 1000, // millicores
          memory: item.containers.reduce((sum, c) => sum + this.parseMemory(c.usage.memory), 0) / (1024 * 1024), // MiB
        },
      }));
    } catch (err) {
      logger.warn('Pod metrics not available:', err.message);
    }

    // GPU metrics from Prometheus (NVIDIA DCGM Exporter)
    const gpuMetrics = await this.getGpuMetrics();

    const clusterMetrics = {
      nodes: nodes.length,
      totalPods: allPods.length,
      runningPods: allPods.filter(p => p.status.phase === 'Running').length,
      pendingPods: allPods.filter(p => p.status.phase === 'Pending').length,
      failedPods: allPods.filter(p => p.status.phase === 'Failed').length,
      namespaces: [...new Set(allPods.map(p => p.metadata.namespace))].length,
    };

    res.json({
      success: true,
      pods: podMetrics,
      cluster: clusterMetrics,
      gpu: gpuMetrics,
    });
  });

  getPodMetrics = asyncHandler(async (req, res) => {
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
  });

  getNodeMetrics = asyncHandler(async (req, res) => {
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
  });

  getClusterMetrics = asyncHandler(async (req, res) => {
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
  });

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

  // Fetch GPU metrics from Prometheus (NVIDIA DCGM Exporter)
  getGpuMetrics = async () => {
    try {
      // Query for all NVIDIA GPUs and their metrics
      const queries = {
        utilization: 'DCGM_FI_DEV_GPU_UTIL',
        memoryUtil: 'DCGM_FI_DEV_MEM_COPY_UTIL',
        memoryUsed: 'DCGM_FI_DEV_FB_USED',
        memoryFree: 'DCGM_FI_DEV_FB_FREE',
        temperature: 'DCGM_FI_DEV_GPU_TEMP',
        powerDraw: 'DCGM_FI_DEV_POWER_USAGE',
        powerLimit: 'DCGM_FI_DEV_POWER_MGMT_LIMIT',
      };

      // Fetch all metrics in parallel
      const results = await Promise.all(
        Object.entries(queries).map(async ([key, query]) => {
          try {
            const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
              params: { query },
              timeout: 5000,
            });
            return { key, data: response.data.data.result || [] };
          } catch (err) {
            logger.warn(`Failed to query GPU metric ${key}:`, err.message);
            return { key, data: [] };
          }
        })
      );

      // Convert results to a map for easy access
      const metricsMap = {};
      results.forEach(({ key, data }) => {
        metricsMap[key] = data;
      });

      // If no GPUs found, return empty array
      if (metricsMap.utilization.length === 0) {
        return [];
      }

      // Build GPU metrics array
      const gpuMetrics = metricsMap.utilization.map((gpuUtil) => {
        const gpu = gpuUtil.metric.gpu;
        const findMetric = (metrics) => metrics.find(m => m.metric.gpu === gpu);

        const memUsed = findMetric(metricsMap.memoryUsed);
        const memFree = findMetric(metricsMap.memoryFree);
        const memUtil = findMetric(metricsMap.memoryUtil);
        const temp = findMetric(metricsMap.temperature);
        const power = findMetric(metricsMap.powerDraw);
        const powerLim = findMetric(metricsMap.powerLimit);

        return {
          index: parseInt(gpu),
          name: gpuUtil.metric.modelName || 'Unknown GPU',
          uuid: gpuUtil.metric.UUID || '',
          utilization: {
            gpu: parseFloat(gpuUtil.value[1]),
            memory: memUtil ? parseFloat(memUtil.value[1]) : 0,
          },
          memory: {
            used: memUsed ? parseFloat(memUsed.value[1]) : 0,
            free: memFree ? parseFloat(memFree.value[1]) : 0,
            total: memUsed && memFree ? parseFloat(memUsed.value[1]) + parseFloat(memFree.value[1]) : 0,
          },
          temperature: temp ? parseFloat(temp.value[1]) : null,
          power: {
            draw: power ? parseFloat(power.value[1]) / 1000 : null, // Convert mW to W
            limit: powerLim ? parseFloat(powerLim.value[1]) / 1000 : null,
          },
        };
      });

      return gpuMetrics;
    } catch (error) {
      logger.error('Error fetching GPU metrics from Prometheus:', error.message);
      return [];
    }
  }
}

export default new MetricsController();
