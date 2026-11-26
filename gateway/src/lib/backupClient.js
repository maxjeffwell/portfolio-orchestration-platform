// Off-site backup freshness from the in-cluster Prometheus: seconds since each
// job that copies data to Backblaze B2 last succeeded.

const PROMETHEUS_URL =
  process.env.PROMETHEUS_URL ||
  'http://prometheus-kube-prometheus-prometheus.monitoring:9090';

const QUERIES = {
  // Velero's weekly cluster backup written straight to B2.
  veleroAgeS: 'time() - max(velero_backup_last_successful_timestamp{schedule="weekly-offsite"})',
  // Weekly rclone copy of database dumps from Garage to B2.
  garageSyncAgeS:
    'time() - max(kube_cronjob_status_last_successful_time{cronjob="garage-offsite-sync"})',
  // Hourly mirror of the HA Postgres backups; only the current leader runs
  // it, so the freshest of the three servers is the one that counts.
  postgresAgeS: 'time() - max(pg_ha_offsite_last_success_timestamp_seconds)',
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
    console.error('[backupClient] query failed:', err.message);
    return null;
  }
}

// Machines that back themselves up to B2 stamp the time of each success into
// a small metric file. Hosts are scraped by the in-cluster Prometheus; the
// NAS's figure arrives through its own collector, in Mimir.
const MIMIR_URL =
  process.env.MIMIR_URL ||
  'http://mimir-monolithic.monitoring.svc.cluster.local:8080/prometheus';

const PER_HOST = {
  hostAgeS: [
    PROMETHEUS_URL,
    'time() - max by (host) (host_offsite_backup_last_success_timestamp_seconds)',
  ],
  nasAgeS: [
    MIMIR_URL,
    'time() - max by (host) (nas_offsite_backup_last_success_timestamp_seconds)',
  ],
};

// { host: seconds }, empty when the source has no answer.
async function queryByHost(baseUrl, promql) {
  try {
    const res = await fetch(`${baseUrl}/api/v1/query?query=${encodeURIComponent(promql)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return {};
    const data = await res.json();
    return Object.fromEntries(
      (data.data?.result ?? []).map((r) => [r.metric.host, parseFloat(r.value[1])]),
    );
  } catch (err) {
    console.error('[backupClient] per-host query failed:', err.message);
    return {};
  }
}

// Each job value is a number of seconds, or null when Prometheus has no
// answer; hostAgeS and nasAgeS are maps of host to seconds.
export async function fetchOffsiteBackupStatus() {
  const names = Object.keys(QUERIES);
  const perHost = Object.keys(PER_HOST);
  const [values, maps] = await Promise.all([
    Promise.all(names.map((name) => queryScalar(QUERIES[name]))),
    Promise.all(perHost.map((name) => queryByHost(...PER_HOST[name]))),
  ]);
  return {
    ...Object.fromEntries(names.map((name, i) => [name, values[i]])),
    ...Object.fromEntries(perHost.map((name, i) => [name, maps[i]])),
  };
}
