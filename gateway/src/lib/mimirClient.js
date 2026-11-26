const MIMIR_URL =
  process.env.MIMIR_URL ||
  'http://mimir-monolithic.monitoring.svc.cluster.local:8080/prometheus';

async function queryMimir(promql) {
  const url = `${MIMIR_URL}/api/v1/query?query=${encodeURIComponent(promql)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return data.data?.result ?? [];
  } catch (err) {
    console.error('[mimirClient] query failed:', promql, err.message);
    return [];
  }
}

function resultToMap(results, labelKey = 'instance') {
  const map = {};
  for (const r of results) {
    const key = r.metric?.[labelKey];
    if (key) map[key] = parseFloat(r.value?.[1] ?? 0);
  }
  return map;
}

export async function fetchNodeMetrics() {
  const [cpuResults, memUsed, memTotal, storageUsed, storageTotal, uptimeResults] =
    await Promise.all([
      queryMimir(
        'avg by (instance) (1 - rate(node_cpu_seconds_total{mode="idle"}[5m]))'
      ),
      queryMimir('node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes'),
      queryMimir('node_memory_MemTotal_bytes'),
      queryMimir(
        'node_filesystem_size_bytes{mountpoint="/"} - node_filesystem_avail_bytes{mountpoint="/"}'
      ),
      queryMimir('node_filesystem_size_bytes{mountpoint="/"}'),
      queryMimir('time() - node_boot_time_seconds'),
    ]);

  const normalize = (map) => {
    const out = {};
    for (const [key, val] of Object.entries(map)) {
      const ip = key.split(':')[0];
      out[ip] = val;
    }
    return out;
  };

  return {
    cpu: normalize(resultToMap(cpuResults)),
    memUsed: normalize(resultToMap(memUsed)),
    memTotal: normalize(resultToMap(memTotal)),
    storageUsed: normalize(resultToMap(storageUsed)),
    storageTotal: normalize(resultToMap(storageTotal)),
    uptime: normalize(resultToMap(uptimeResults)),
  };
}

// Scrape-target liveness, keyed "job|instance" -> true/false.
// An empty map means Mimir itself could not be queried.
export async function fetchUpStatus() {
  const results = await queryMimir(
    'up{job=~"integrations/unix|router-node|garage"}'
  );
  const map = {};
  for (const r of results) {
    const { job, instance } = r.metric ?? {};
    if (job && instance) map[`${job}|${instance}`] = r.value?.[1] === '1';
  }
  return map;
}

// Carrier and negotiated speed of the routers' network ports, keyed
// "instance|device" -> { carrier: bool, speedBps: number|null }.
export async function fetchPortStatus() {
  const [carrier, speed] = await Promise.all([
    queryMimir('node_network_carrier{job="router-node"}'),
    queryMimir('node_network_speed_bytes{job="router-node"} * 8'),
  ]);
  const map = {};
  for (const r of carrier) {
    const { instance, device } = r.metric ?? {};
    if (instance && device) {
      map[`${instance}|${device}`] = { carrier: r.value?.[1] === '1', speedBps: null };
    }
  }
  for (const r of speed) {
    const { instance, device } = r.metric ?? {};
    const entry = map[`${instance}|${device}`];
    const bps = parseFloat(r.value?.[1]);
    if (entry && bps > 0) entry.speedBps = bps;
  }
  return map;
}

// Bits per second through the routers' network ports, both directions,
// keyed "instance|device" like fetchPortStatus.
export async function fetchPortTraffic() {
  const results = await queryMimir(
    '(rate(node_network_receive_bytes_total{job="router-node"}[2m])' +
      ' + rate(node_network_transmit_bytes_total{job="router-node"}[2m])) * 8'
  );
  const map = {};
  for (const r of results) {
    const { instance, device } = r.metric ?? {};
    const bps = parseFloat(r.value?.[1]);
    if (instance && device && Number.isFinite(bps)) map[`${instance}|${device}`] = bps;
  }
  return map;
}

export function formatUptime(seconds) {
  if (!seconds) return null;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return `${days}d ${hours}h`;
}
