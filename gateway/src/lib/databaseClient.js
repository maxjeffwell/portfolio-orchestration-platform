// Live inputs for the database map: database pods from the Kubernetes API,
// roles and backup freshness from the in-cluster Prometheus.

import k8sClient from './k8sClient.js';

const PROMETHEUS_URL =
  process.env.PROMETHEUS_URL ||
  'http://prometheus-kube-prometheus-prometheus.monitoring:9090';

async function queryMap(promql, label) {
  try {
    const res = await fetch(
      `${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(promql)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return {};
    const data = await res.json();
    const map = {};
    for (const r of data.data?.result ?? []) {
      const key = label ? r.metric?.[label] : 'value';
      if (key != null) map[key] = parseFloat(r.value?.[1]);
    }
    return map;
  } catch (err) {
    console.error('[databaseClient] query failed:', err.message);
    return {};
  }
}

// Every pod in the cluster, reduced to what the map needs.
export async function fetchDatabasePods() {
  const res = await k8sClient.getCoreV1Api().listPodForAllNamespaces();
  return res.body.items.map((pod) => ({
    name: pod.metadata.name,
    namespace: pod.metadata.namespace,
    labels: pod.metadata.labels || {},
    node: pod.spec?.nodeName || null,
    phase: pod.status?.phase || 'Unknown',
    ready: (pod.status?.conditions || []).some((c) => c.type === 'Ready' && c.status === 'True'),
  }));
}

// Ages are seconds since the last success; a missing key means "no signal".
export async function fetchDatabaseSignals() {
  const [
    cnpgBarmanAge,
    cnpgSnapshotAge,
    cronAge,
    veleroAge,
    patroniPrimary,
    patroniRunning,
    patroniSyncStandby,
    pgha,
    pghaOffsite,
    pghaDumpR2,
  ] = await Promise.all([
    // Two different backups of the same cluster, two different metrics:
    // the Barman plugin reports the base backup it sent to B2, while the
    // operator's own collector reports the last backup recorded in the
    // cluster status, which on these clusters is the daily volume snapshot
    // (plugin backups are not recorded there). Until 2026-11-21 the B2 row
    // read the collector metric, so it showed the snapshot's time and the
    // snapshot row showed nothing.
    queryMap(
      'time() - max by (pod) (barman_cloud_cloudnative_pg_io_last_available_backup_timestamp > 0)',
      'pod',
    ),
    queryMap('time() - max by (pod) (cnpg_collector_last_available_backup_timestamp > 0)', 'pod'),
    queryMap('time() - max by (cronjob) (kube_cronjob_status_last_successful_time)', 'cronjob'),
    queryMap('time() - max by (schedule) (velero_backup_last_successful_timestamp)', 'schedule'),
    queryMap('max by (name) (patroni_primary)', 'name'),
    queryMap('max by (name) (patroni_postgres_running)', 'name'),
    queryMap('max by (name) (patroni_sync_standby)', 'name'),
    // Only the current leader runs these, so the freshest server counts.
    queryMap('time() - max(pg_ha_backup_last_success_timestamp_seconds)'),
    queryMap('time() - max(pg_ha_offsite_last_success_timestamp_seconds)'),
    queryMap('time() - max(pg_ha_dump_r2_last_success_timestamp_seconds)'),
  ]);
  return {
    cnpgBarmanAge,
    cnpgSnapshotAge,
    cronAge,
    veleroAge,
    patroniPrimary,
    patroniRunning,
    patroniSyncStandby,
    pghaAge: {
      backup: pgha.value ?? null,
      offsite: pghaOffsite.value ?? null,
      dumpR2: pghaDumpR2.value ?? null,
    },
  };
}
