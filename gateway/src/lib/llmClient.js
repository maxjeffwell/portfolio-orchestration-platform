// Live figures for the LLM map, all from the in-cluster Prometheus.

const PROMETHEUS_URL =
  process.env.PROMETHEUS_URL ||
  'http://prometheus-kube-prometheus-prometheus.monitoring:9090';

async function query(promql) {
  try {
    const res = await fetch(`${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(promql)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.result ?? null;
  } catch (err) {
    console.error('[llmClient] query failed:', err.message);
    return null;
  }
}

// name -> { ready, wanted } for every Deployment.
async function fetchWorkloads() {
  const [ready, wanted] = await Promise.all([
    query('kube_deployment_status_replicas_ready'),
    query('kube_deployment_spec_replicas'),
  ]);
  if (!ready || !wanted) return null;
  const out = {};
  const fill = (rows, field) =>
    rows.forEach((r) => {
      const name = r.metric?.deployment;
      if (!name) return;
      out[name] = out[name] || { ready: null, wanted: null };
      out[name][field] = parseFloat(r.value?.[1]);
    });
  fill(ready, 'ready');
  fill(wanted, 'wanted');
  return out;
}

// [{ namespace, pod, ready }] for pods that are not owned by a Deployment
// (operator-managed databases), matched by name prefix in the resolver.
async function fetchPods() {
  const rows = await query(
    'kube_pod_status_ready{condition="true", namespace=~"default|qdrant|microservices"}',
  );
  if (!rows) return null;
  return rows.map((r) => ({
    namespace: r.metric.namespace,
    pod: r.metric.pod,
    ready: parseFloat(r.value?.[1]) === 1,
  }));
}

// model name -> requests in the last seven days. Text models are counted as
// accepted requests on their graph; the interval model, served the classic
// way, as successful inferences.
async function fetchModelRequests() {
  const [graphs, classic] = await Promise.all([
    query('sum by (name) (increase(ovms_requests_accepted[7d]))'),
    query('sum by (name) (increase(ovms_requests_success{method="ModelInfer"}[7d]))'),
  ]);
  if (!graphs && !classic) return null;
  const out = {};
  [...(classic ?? []), ...(graphs ?? [])].forEach((r) => {
    const name = r.metric?.name;
    const value = parseFloat(r.value?.[1]);
    if (!name || Number.isNaN(value)) return;
    out[name] = Math.max(out[name] ?? 0, value);
  });
  return out;
}

export async function fetchLlmSignals() {
  const [workloads, pods, modelRequests] = await Promise.all([
    fetchWorkloads(),
    fetchPods(),
    fetchModelRequests(),
  ]);
  return { workloads, pods, modelRequests };
}
