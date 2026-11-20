// Signals from the in-cluster Prometheus that Mimir does not carry:
// Mayastor volume-layer status (kube-state-metrics, kubelet volume stats) and
// each node's uplink speed (node-exporter).

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

// Negotiated uplink speed of each k3s node in bits per second, keyed by
// hostname: the bond if there is one, otherwise the fastest NIC that is up.
export async function fetchUplinkSpeeds() {
  const promql =
    'max by (nodename) (((node_network_speed_bytes{device=~"bond0|en.*"} * 8)' +
    ' and on (instance, device) (node_network_up == 1))' +
    ' * on (instance) group_left (nodename) node_uname_info)';
  try {
    const res = await fetch(`${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(promql)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return {};
    const data = await res.json();
    const speeds = {};
    for (const r of data.data?.result ?? []) {
      const bps = parseFloat(r.value?.[1]);
      if (r.metric?.nodename && bps > 0) speeds[r.metric.nodename] = bps;
    }
    return speeds;
  } catch (err) {
    console.error('[storageClient] uplink query failed:', err.message);
    return {};
  }
}
