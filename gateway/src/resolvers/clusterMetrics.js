import http from 'node:http';
import k8sClient from '../lib/k8sClient.js';

const PROMETHEUS_URL =
  process.env.PROMETHEUS_URL ||
  'http://prometheus-kube-prometheus-prometheus.monitoring:9090';

const METRICS_INTERVAL_MS = parseInt(
  process.env.CLUSTER_METRICS_INTERVAL_MS || '30000',
  10,
);

function queryPrometheus(query) {
  const url = `${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(query)}`;
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve(data.data?.result?.[0]?.value?.[1] ?? null);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function fetchClusterMetrics() {
  const api = k8sClient.getCoreV1Api();

  const [nodesRes, podsRes, nsRes, cpuVal, memVal] = await Promise.all([
    api.listNode(),
    api.listPodForAllNamespaces(),
    api.listNamespace(),
    queryPrometheus('sum(rate(node_cpu_seconds_total{mode!="idle"}[5m]))').catch(() => null),
    queryPrometheus('sum(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes)').catch(() => null),
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
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const clusterMetricsResolvers = {
  Query: {
    clusterMetrics: () => fetchClusterMetrics(),
  },

  Subscription: {
    clusterMetricsStream: {
      subscribe: async function* () {
        // Yield immediately, then every METRICS_INTERVAL_MS
        while (true) {
          try {
            const metrics = await fetchClusterMetrics();
            yield { clusterMetricsStream: metrics };
          } catch (err) {
            console.error('[Subscription] clusterMetrics error:', err.message);
          }
          await sleep(METRICS_INTERVAL_MS);
        }
      },
    },
  },
};
