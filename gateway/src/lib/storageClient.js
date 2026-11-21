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

const LVM_PV = 'kube_persistentvolume_info{storageclass=~"openebs-lvmpv.*"}';
const LVM_PVC = 'kube_persistentvolumeclaim_info{storageclass=~"openebs-lvmpv.*"}';

const LVM_QUERIES = {
  volumes: `count(${LVM_PV})`,
  provisionedBytes: `sum(kube_persistentvolume_capacity_bytes * on(persistentvolume) group_left(storageclass) ${LVM_PV})`,
  usedBytes: `sum(kubelet_volume_stats_used_bytes * on(namespace, persistentvolumeclaim) group_left(storageclass) ${LVM_PVC})`,
  pluginsReady: 'sum(kube_daemonset_status_number_ready{daemonset=~".*lvm.*node.*"})',
  pluginsDesired:
    'sum(kube_daemonset_status_desired_number_scheduled{daemonset=~".*lvm.*node.*"})',
};

// Returns null when Prometheus cannot say whether the node plugins are running.
export async function fetchLvmStatus() {
  const names = Object.keys(LVM_QUERIES);
  const values = await Promise.all(names.map((name) => queryScalar(LVM_QUERIES[name])));
  const status = Object.fromEntries(names.map((name, i) => [name, values[i]]));
  if (status.pluginsReady == null || status.pluginsDesired == null) return null;
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

async function queryVector(promql, label) {
  try {
    const res = await fetch(`${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(promql)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.data?.result ?? [];
  } catch (err) {
    console.error(`[storageClient] ${label} query failed:`, err.message);
    return [];
  }
}

// Carrier and negotiated speed of the machines' own network ports, keyed
// "hostname|device" -> { carrier: bool, speedBps: number|null }: the same
// shape as the routers' ports from Mimir, which does not carry these series.
export async function fetchHostPortStatus() {
  const byHost = ' * on (instance) group_left (nodename) node_uname_info';
  const [carrier, speed] = await Promise.all([
    queryVector(`node_network_carrier{device=~"en.*|eth.*"}${byHost}`, 'port carrier'),
    queryVector(`(node_network_speed_bytes{device=~"en.*|eth.*"} * 8)${byHost}`, 'port speed'),
  ]);
  const map = {};
  for (const r of carrier) {
    const { nodename, device } = r.metric ?? {};
    if (nodename && device) {
      map[`${nodename}|${device}`] = { carrier: r.value?.[1] === '1', speedBps: null };
    }
  }
  for (const r of speed) {
    const { nodename, device } = r.metric ?? {};
    const entry = map[`${nodename}|${device}`];
    const bps = parseFloat(r.value?.[1]);
    if (entry && bps > 0) entry.speedBps = bps;
  }
  return map;
}

// Results of the ICMP probes of devices that have no exporter, keyed like
// scrape liveness: "job|instance" -> true/false.
export async function fetchProbeStatus() {
  const results = await queryVector('probe_success{job="icmp-infra"}', 'probe');
  const map = {};
  for (const r of results) {
    const { job, instance } = r.metric ?? {};
    if (job && instance) map[`${job}|${instance}`] = r.value?.[1] === '1';
  }
  return map;
}
