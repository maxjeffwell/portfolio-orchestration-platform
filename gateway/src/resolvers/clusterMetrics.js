import k8sClient from '../lib/k8sClient.js';
import { parseCpu, parseMemory } from '../lib/parsers.js';

export const clusterMetricsResolvers = {
  Query: {
    clusterMetrics: async () => {
      const api = k8sClient.getCoreV1Api();

      const [nodesRes, podsRes, nsRes] = await Promise.all([
        api.listNode(),
        api.listPodForAllNamespaces(),
        api.listNamespace(),
      ]);

      const pods = podsRes.body.items;

      let cpuUsageCores = null;
      let memoryUsageBytes = null;

      try {
        const metrics = k8sClient.getMetricsClient();
        const podMetrics = await metrics.getPodMetrics();
        let totalCpu = 0;
        let totalMemory = 0;
        for (const item of podMetrics.items) {
          for (const c of item.containers) {
            totalCpu += parseCpu(c.usage.cpu);
            totalMemory += parseMemory(c.usage.memory);
          }
        }
        cpuUsageCores = totalCpu;
        memoryUsageBytes = totalMemory;
      } catch {
        // metrics-server may not be available
      }

      return {
        nodeCount: nodesRes.body.items.length,
        totalPods: pods.length,
        runningPods: pods.filter((p) => p.status?.phase === 'Running').length,
        pendingPods: pods.filter((p) => p.status?.phase === 'Pending').length,
        failedPods: pods.filter((p) => p.status?.phase === 'Failed').length,
        namespaceCount: nsRes.body.items.length,
        cpuUsageCores,
        memoryUsageBytes,
      };
    },
  },
};
