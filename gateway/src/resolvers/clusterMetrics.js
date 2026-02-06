import k8sClient from '../lib/k8sClient.js';

const PROMETHEUS_URL =
  process.env.PROMETHEUS_URL ||
  'http://prometheus-kube-prometheus-prometheus.monitoring.svc.cluster.local:9090';

async function queryPrometheus(query) {
  const url = `${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(query)}`;
  console.log(`[Prometheus] Querying: ${url}`);
  const res = await fetch(url);
  const data = await res.json();
  console.log(`[Prometheus] Response status=${res.status}, resultCount=${data.data?.result?.length ?? 0}`);
  return data.data?.result?.[0]?.value?.[1] ?? null;
}

export const clusterMetricsResolvers = {
  Query: {
    clusterMetrics: async () => {
      const api = k8sClient.getCoreV1Api();

      const [nodesRes, podsRes, nsRes, cpuVal, memVal] = await Promise.all([
        api.listNode(),
        api.listPodForAllNamespaces(),
        api.listNamespace(),
        queryPrometheus('sum(rate(node_cpu_seconds_total{mode!="idle"}[5m]))').catch((e) => { console.error('[Prometheus] CPU query failed:', e.message); return null; }),
        queryPrometheus('sum(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes)').catch((e) => { console.error('[Prometheus] Memory query failed:', e.message); return null; }),
      ]);

      const pods = podsRes.body.items;

      return {
        nodeCount: nodesRes.body.items.length,
        totalPods: pods.length,
        runningPods: pods.filter((p) => p.status?.phase === 'Running').length,
        pendingPods: pods.filter((p) => p.status?.phase === 'Pending').length,
        failedPods: pods.filter((p) => p.status?.phase === 'Failed').length,
        namespaceCount: nsRes.body.items.length,
        cpuUsageCores: cpuVal !== null ? parseFloat(cpuVal) : null,
        memoryUsageBytes: memVal !== null ? parseFloat(memVal) : null,
      };
    },
  },
};
