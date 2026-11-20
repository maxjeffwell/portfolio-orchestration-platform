// Mayastor volume-layer status from the in-cluster Prometheus
// (kube-state-metrics and kubelet volume stats; Mimir does not carry these).

const PROMETHEUS_URL =
  process.env.PROMETHEUS_URL ||
  'http://prometheus-kube-prometheus-prometheus.monitoring:9090';

const MAYASTOR_PV = 'kube_persistentvolume_info{storageclass=~"mayastor.*"}';
const MAYASTOR_PVC = 'kube_persistentvolumeclaim_info{storageclass=~"mayastor.*"}';

const QUERIES = {
  volumes: `count(${MAYASTOR_PV})`,
  provisionedBytes: `sum(kube_persistentvolume_capacity_bytes * on(persistentvolume) group_left(storageclass) ${MAYASTOR_PV})`,
  usedBytes: `sum(kubelet_volume_stats_used_bytes * on(namespace, persistentvolumeclaim) group_left(storageclass) ${MAYASTOR_PVC})`,
  enginesReady: 'sum(kube_daemonset_status_number_ready{daemonset="mayastor-io-engine"})',
  enginesDesired:
    'sum(kube_daemonset_status_desired_number_scheduled{daemonset="mayastor-io-engine"})',
};

async function queryScalar(promql) {
  try {
    const res = await fetch(
      `${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(promql)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const value = data.data?.result?.[0]?.value?.[1];
    return value == null ? null : parseFloat(value);
  } catch (err) {
    console.error('[storageClient] query failed:', err.message);
    return null;
  }
}

// Returns null when Prometheus cannot say whether the io-engines are running.
export async function fetchMayastorStatus() {
  const names = Object.keys(QUERIES);
  const values = await Promise.all(names.map((name) => queryScalar(QUERIES[name])));
  const status = Object.fromEntries(names.map((name, i) => [name, values[i]]));
  if (status.enginesReady == null || status.enginesDesired == null) return null;
  return status;
}
