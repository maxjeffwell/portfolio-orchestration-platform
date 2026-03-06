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

  const [
    nodesRes,
    totalPods, runningPods, pendingPods, failedPods, namespaceCount,
    cpuVal, memVal, cpuTotalVal, memTotalVal,
  ] = await Promise.all([
    api.listNode(),
    queryPrometheus('sum(kube_pod_status_phase)').catch(() => null),
    queryPrometheus('sum(kube_pod_status_phase{phase="Running"})').catch(() => null),
    queryPrometheus('sum(kube_pod_status_phase{phase="Pending"})').catch(() => null),
    queryPrometheus('sum(kube_pod_status_phase{phase="Failed"})').catch(() => null),
    queryPrometheus('count(kube_namespace_created)').catch(() => null),
    queryPrometheus('sum(rate(node_cpu_seconds_total{mode!="idle"}[5m]))').catch(() => null),
    queryPrometheus('sum(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes)').catch(() => null),
    queryPrometheus('count(node_cpu_seconds_total{mode="idle"})').catch(() => null),
    queryPrometheus('sum(node_memory_MemTotal_bytes)').catch(() => null),
  ]);

  return {
    nodeCount: nodesRes.body.items.length,
    totalPods: totalPods !== null ? parseInt(totalPods, 10) : 0,
    runningPods: runningPods !== null ? parseInt(runningPods, 10) : 0,
    pendingPods: pendingPods !== null ? parseInt(pendingPods, 10) : 0,
    failedPods: failedPods !== null ? parseInt(failedPods, 10) : 0,
    namespaceCount: namespaceCount !== null ? parseInt(namespaceCount, 10) : 0,
    cpuUsageCores: cpuVal !== null ? parseFloat(cpuVal) : null,
    memoryUsageBytes: memVal !== null ? parseFloat(memVal) : null,
    totalCpuCores: cpuTotalVal !== null ? parseFloat(cpuTotalVal) : null,
    totalMemoryBytes: memTotalVal !== null ? parseFloat(memTotalVal) : null,
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
