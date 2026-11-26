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

// Bits per second exchanged with each WireGuard peer, keyed by the peer's
// mesh address like fetchWireguardHandshakes. Both ends of a tunnel report it,
// so the larger figure is used, not the sum.
export async function fetchWireguardTraffic() {
  const result = await query(
    MIMIR_URL,
    'max by (allowed_ips) (rate(wireguard_received_bytes_total[2m])' +
      ' + rate(wireguard_sent_bytes_total[2m])) * 8',
  );
  const traffic = {};
  for (const r of result ?? []) {
    const bps = parseFloat(r.value?.[1]);
    if (!Number.isFinite(bps)) continue;
    for (const cidr of (r.metric?.allowed_ips ?? '').split(',')) {
      const [addr, bits] = cidr.trim().split('/');
      if (bits === '32' && (traffic[addr] == null || bps > traffic[addr])) traffic[addr] = bps;
    }
  }
  return traffic;
}
