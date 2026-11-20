import { DATABASES, DATABASE_APPS } from '../config/databases.js';
import { NODE_DEFINITIONS } from '../config/networkNodes.js';
import { fetchDatabasePods, fetchDatabaseSignals } from '../lib/databaseClient.js';

// Machines are published by the same ids and display names as on the network
// map; real hostnames stay internal.
const MACHINE_BY_HOSTNAME = Object.fromEntries(
  NODE_DEFINITIONS.map((n) => [n.hostname, { id: n.id, displayName: n.displayName }]),
);

const ROLE_NAMES = {
  primary: 'PRIMARY',
  replica: 'REPLICA',
  secondary: 'REPLICA',
  'redis-sentinel': 'SENTINEL',
};

function roleOf(pod, spec) {
  const raw = pod.labels[spec.roleLabel] ?? pod.labels[spec.fallbackRoleLabel];
  if (!raw) return 'MEMBER';
  return ROLE_NAMES[raw] ?? raw.replace(/^neon-/, '').toUpperCase();
}

function machine(hostname) {
  return MACHINE_BY_HOSTNAME[hostname] ?? { id: null, displayName: 'Unknown' };
}

function podInstances(db, pods) {
  const { namespace, labels } = db.pods;
  return pods
    .filter(
      (pod) =>
        pod.namespace === namespace &&
        pod.phase !== 'Succeeded' &&
        Object.entries(labels).every(([key, value]) => pod.labels[key] === value),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((pod, i) => ({
      name: `${db.id}-${i + 1}`,
      role: roleOf(pod, db.pods),
      machineId: machine(pod.node).id,
      machineName: machine(pod.node).displayName,
      ready: pod.ready,
    }));
}

function patroniInstances(db, signals) {
  return Object.keys(signals.patroniRunning ?? {})
    .sort()
    .map((hostname, i) => ({
      name: `${db.id}-${i + 1}`,
      role: signals.patroniPrimary?.[hostname] === 1 ? 'PRIMARY' : 'REPLICA',
      machineId: machine(hostname).id,
      machineName: machine(hostname).displayName,
      ready: signals.patroniRunning[hostname] === 1,
    }));
}

function backupAge(source, signals) {
  if (!source) return null;
  if (source.type === 'cron') return signals.cronAge?.[source.cronjob] ?? null;
  if (source.type === 'velero') return signals.veleroAge?.[source.schedule] ?? null;
  if (source.type === 'pgha') return signals.pghaAge?.[source.kind] ?? null;
  if (source.type === 'cnpg') {
    // Reported per instance; the freshest instance of the cluster counts.
    const ages = Object.entries(signals.cnpgBackupAge ?? {})
      .filter(([pod]) => pod.startsWith(`${source.cluster}-`))
      .map(([, age]) => age);
    return ages.length ? Math.min(...ages) : null;
  }
  return null;
}

// UNKNOWN means there is no live signal for this backup, not that it failed.
function buildBackup(backup, signals, now) {
  const age = backupAge(backup.source, signals);
  let status = 'UNKNOWN';
  if (age != null) status = age <= backup.maxAgeS ? 'HEALTHY' : 'OFFLINE';
  return {
    name: backup.name,
    target: backup.target,
    status,
    lastSuccess: age != null ? new Date(now - age * 1000).toISOString() : null,
  };
}

// All expected instances ready is HEALTHY; none ready, or no primary where
// the engine has one, is OFFLINE; anything in between is DEGRADED.
function databaseHealth(db, instances) {
  // A hosted service has no instances here and nothing measures it. HEALTHY
  // is a placeholder; the page shows such stores as not monitored.
  if (db.external) return 'HEALTHY';
  const ready = instances.filter((i) => i.ready);
  if (ready.length === 0) return 'OFFLINE';
  const hasRoles = instances.some((i) => i.role === 'PRIMARY' || i.role === 'REPLICA');
  if (hasRoles && !ready.some((i) => i.role === 'PRIMARY')) return 'OFFLINE';
  return ready.length >= db.expectedInstances ? 'HEALTHY' : 'DEGRADED';
}

export function buildDatabaseTopology(pods, signals, now = Date.now()) {
  const databases = DATABASES.map((db) => {
    let instances = [];
    if (db.patroni) instances = patroniInstances(db, signals ?? {});
    else if (db.pods) instances = podInstances(db, pods ?? []);
    return {
      id: db.id,
      displayName: db.displayName,
      engine: db.engine,
      manager: db.manager,
      health: databaseHealth(db, instances),
      expectedInstances: db.expectedInstances,
      instances,
      storage: db.storage,
      backups: db.backups.map((backup) => buildBackup(backup, signals ?? {}, now)),
    };
  });

  return {
    apps: DATABASE_APPS,
    databases,
    lastUpdated: new Date(now).toISOString(),
  };
}

async function fetchDatabaseTopology() {
  const [pods, signals] = await Promise.all([
    fetchDatabasePods().catch((err) => {
      console.error('[databaseTopology] pod list failed:', err.message);
      return [];
    }),
    fetchDatabaseSignals().catch(() => ({})),
  ]);
  return buildDatabaseTopology(pods, signals);
}

export const databaseTopologyResolvers = {
  Query: {
    databaseTopology: () => fetchDatabaseTopology(),
  },
};
