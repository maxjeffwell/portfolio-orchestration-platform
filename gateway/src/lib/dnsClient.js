// Live health and load of the resolvers that expose metrics: CoreDNS and
// node-local-dns from the in-cluster Prometheus, Blocky and the routers from
// Mimir.

const PROMETHEUS_URL =
  process.env.PROMETHEUS_URL ||
  'http://prometheus-kube-prometheus-prometheus.monitoring:9090';
const MIMIR_URL =
  process.env.MIMIR_URL ||
  'http://mimir-monolithic.monitoring.svc.cluster.local:8080/prometheus';

async function scalar(baseUrl, promql) {
  try {
    const res = await fetch(`${baseUrl}/api/v1/query?query=${encodeURIComponent(promql)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const value = data.data?.result?.[0]?.value?.[1];
    return value == null ? null : parseFloat(value);
  } catch (err) {
    console.error('[dnsClient] query failed:', err.message);
    return null;
  }
}

const QUERIES = {
  corednsReady: [PROMETHEUS_URL, 'sum(kube_deployment_status_replicas_ready{deployment="coredns"})'],
  corednsWanted: [PROMETHEUS_URL, 'sum(kube_deployment_spec_replicas{deployment="coredns"})'],
  corednsQps: [PROMETHEUS_URL, 'sum(rate(coredns_dns_requests_total{job="coredns"}[5m]))'],
  nodeLocalReady: [PROMETHEUS_URL, 'sum(kube_daemonset_status_number_ready{daemonset="node-local-dns"})'],
  nodeLocalWanted: [
    PROMETHEUS_URL,
    'sum(kube_daemonset_status_desired_number_scheduled{daemonset="node-local-dns"})',
  ],
  nodeLocalQps: [PROMETHEUS_URL, 'sum(rate(coredns_dns_requests_total{job="node-local-dns"}[5m]))'],
  nodeLocalHits: [PROMETHEUS_URL, 'sum(rate(coredns_cache_hits_total{job="node-local-dns"}[5m]))'],
  blockyUp: [MIMIR_URL, 'max(up{job="blocky-dns"})'],
  blockyQps: [MIMIR_URL, 'sum(rate(blocky_query_total[5m]))'],
  primaryRouterUp: [MIMIR_URL, 'max(up{job="router-node",instance="be88u"})'],
  meshNodeUp: [MIMIR_URL, 'max(up{job="router-node",instance="ax86u-pro"})'],
};

// Each value is a number, or null when the source has no answer.
export async function fetchDnsSignals() {
  const names = Object.keys(QUERIES);
  const values = await Promise.all(names.map((name) => scalar(...QUERIES[name])));
  return Object.fromEntries(names.map((name, i) => [name, values[i]]));
}
