// Overlay network status: Headscale (tailnet control) from the in-cluster
// Prometheus, WireGuard tunnel handshakes from Mimir.

const PROMETHEUS_URL =
  process.env.PROMETHEUS_URL ||
  'http://prometheus-kube-prometheus-prometheus.monitoring:9090';
const MIMIR_URL =
  process.env.MIMIR_URL ||
  'http://mimir-monolithic.monitoring.svc.cluster.local:8080/prometheus';

async function query(baseUrl, promql) {
  try {
    const res = await fetch(`${baseUrl}/api/v1/query?query=${encodeURIComponent(promql)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.result ?? null;
  } catch (err) {
    console.error('[overlayClient] query failed:', err.message);
    return null;
  }
}

const asBool = (result) => {
  const value = result?.[0]?.value?.[1];
  return value == null ? null : value === '1';
};

// { primaryUp, publicUp, standbySynced }, each true/false/null (unknown).
// Returns null when Prometheus cannot say whether the primary is running.
export async function fetchHeadscaleStatus() {
  const [primary, publicProbe, standby] = await Promise.all([
    query(PROMETHEUS_URL, 'max(headscale_standby_health_up{target="dm"})'),
    query(PROMETHEUS_URL, 'max(probe_success{instance=~".*headscale.*/health"})'),
    query(PROMETHEUS_URL, 'max(headscale_standby_sync_ok)'),
  ]);
  const status = {
    primaryUp: asBool(primary),
    publicUp: asBool(publicProbe),
    standbySynced: asBool(standby),
  };
  if (status.primaryUp == null && status.publicUp == null) return null;
  return status;
}

// Seconds since the last WireGuard handshake, keyed by the peer's mesh address.
// Several hosts report the same peer; the most recent handshake wins. Peers
// that have never completed a handshake are left out.
export async function fetchWireguardHandshakes() {
  const result = await query(
    MIMIR_URL,
    'time() - max by (allowed_ips) (wireguard_latest_handshake_seconds > 0)',
  );
  const ages = {};
  for (const r of result ?? []) {
    const age = parseFloat(r.value?.[1]);
    for (const cidr of (r.metric?.allowed_ips ?? '').split(',')) {
      const [addr, bits] = cidr.trim().split('/');
      if (bits === '32' && (ages[addr] == null || age < ages[addr])) ages[addr] = age;
    }
  }
  return ages;
}
