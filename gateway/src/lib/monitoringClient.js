// Live figures for the monitoring map, all from the in-cluster Prometheus
// except the reachability of off-cluster scrape jobs, which only Mimir has.

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
    if (!res.ok) return [];
    const data = await res.json();
    return data.data?.result ?? [];
  } catch (err) {
    console.error('[monitoringClient] query failed:', err.message);
    return [];
  }
}

const number = (result) => {
  const value = result?.[0]?.value?.[1];
  return value == null ? null : parseFloat(value);
};

// name -> { ready, wanted } for every Deployment, StatefulSet and DaemonSet.
async function fetchWorkloads() {
  const [depReady, depWanted, stsReady, stsWanted, dsReady, dsWanted] = await Promise.all([
    query(PROMETHEUS_URL, 'kube_deployment_status_replicas_ready'),
    query(PROMETHEUS_URL, 'kube_deployment_spec_replicas'),
    query(PROMETHEUS_URL, 'kube_statefulset_status_replicas_ready'),
    query(PROMETHEUS_URL, 'kube_statefulset_replicas'),
    query(PROMETHEUS_URL, 'kube_daemonset_status_number_ready'),
    query(PROMETHEUS_URL, 'kube_daemonset_status_desired_number_scheduled'),
  ]);
  const out = {};
  const fill = (rows, label, field) =>
    rows.forEach((r) => {
      const name = r.metric?.[label];
      if (!name) return;
      out[name] = out[name] || { ready: null, wanted: null };
      out[name][field] = parseFloat(r.value?.[1]);
    });
  fill(depReady, 'deployment', 'ready');
  fill(depWanted, 'deployment', 'wanted');
  fill(stsReady, 'statefulset', 'ready');
  fill(stsWanted, 'statefulset', 'wanted');
  fill(dsReady, 'daemonset', 'ready');
  fill(dsWanted, 'daemonset', 'wanted');
  return out;
}

// job -> { up, total } per scrape job. Mimir has the off-cluster jobs; jobs that
// only the in-cluster Prometheus scrapes (its ScrapeConfigs, such as the SNMP
// exporter) are filled in from Prometheus. Where both know a job, Mimir wins.
async function fetchJobsFrom(baseUrl) {
  const [up, total] = await Promise.all([
    query(baseUrl, 'sum by (job) (up)'),
    query(baseUrl, 'count by (job) (up)'),
  ]);
  const out = {};
  total.forEach((r) => {
    out[r.metric.job] = { up: 0, total: parseFloat(r.value[1]) };
  });
  up.forEach((r) => {
    if (out[r.metric.job]) out[r.metric.job].up = parseFloat(r.value[1]);
  });
  return out;
}

async function fetchJobs() {
  const [mimir, prometheus] = await Promise.all([
    fetchJobsFrom(MIMIR_URL),
    fetchJobsFrom(PROMETHEUS_URL),
  ]);
  return { ...prometheus, ...mimir };
}

export async function fetchMonitoringSignals() {
  const q = (promql) => query(PROMETHEUS_URL, promql).then(number);
  const [workloads, jobs, figures] = await Promise.all([
    fetchWorkloads(),
    fetchJobs(),
    Promise.all([
      q('count(up)'),
      q('count(up == 1)'),
      q('sum(prometheus_tsdb_head_series)'),
      q('sum(rate(prometheus_tsdb_head_samples_appended_total[5m]))'),
      q('sum(cortex_ingester_memory_series)'),
      q('sum(rate(cortex_distributor_received_samples_total[5m]))'),
      q('sum(rate(tempo_distributor_spans_received_total[5m]))'),
      q('sum(rate(pyroscope_distributor_received_compressed_bytes_sum[5m]))'),
      q('sum(prometheus_rule_group_rules)'),
      q('count(ALERTS{alertstate="firing", alertname!="Watchdog"}) or vector(0)'),
      q('time() - max(kube_cronjob_status_last_successful_time{cronjob="healthchecks-heartbeat"})'),
      // Pushover (second alert channel, 2026-11-27): Alertmanager's own counters.
      q('sum(increase(alertmanager_notifications_total{integration="pushover"}[7d]))'),
      q('sum(increase(alertmanager_notifications_failed_total{integration="pushover"}[24h]))'),
    ]),
  ]);
  const [
    targets,
    targetsUp,
    promSeries,
    promSamples,
    mimirSeries,
    mimirSamples,
    tempoSpans,
    pyroscopeBytes,
    rules,
    firing,
    heartbeatAgeS,
    pushoverSent7d,
    pushoverFailed24h,
  ] = figures;
  return {
    workloads,
    jobs,
    targets,
    targetsUp,
    promSeries,
    promSamples,
    mimirSeries,
    mimirSamples,
    tempoSpans,
    pyroscopeBytes,
    rules,
    firing,
    heartbeatAgeS,
    pushoverSent7d,
    pushoverFailed24h,
  };
}
