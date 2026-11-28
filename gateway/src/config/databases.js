// Database map: which databases exist, who uses them, where they keep data and
// how they are backed up.
//
// Hand-maintained, like config/networkNodes.js. What is live: which instances
// are running, on which machine, which one is primary, and how fresh each
// backup is. Update this file when a database or an app's wiring changes.
//
//   pods      how to find the instances: namespace + label selector, and the
//             label that carries the role (primary/replica) if there is one
//   patroni   set instead of `pods` for the host-level Patroni cluster
//   storage   MAYASTOR (replicated volumes), LVM_LOCAL (node-local volumes),
//             HOST_DISK (directly on the servers' disks), NONE (a cache that
//             keeps nothing across restarts) or EXTERNAL (a hosted service
//             outside the cluster: no instances here, nothing to monitor)
//   backups   `source` names the live signal that proves the backup ran:
//               cnpg       CloudNativePG "last available backup" for a cluster
//               cron       last success of a Kubernetes CronJob
//               velero     last success of a Velero schedule (Velero copies the
//                          volume's files; `daily-backup` covers every
//                          namespace, `weekly-offsite` a fixed list)
//               pgha       the HA Postgres backup / off-site mirror / R2 dump timers
//             `target` is GARAGE, BACKBLAZE_B2, CLOUDFLARE_R2 or VOLUME_SNAPSHOT

const HOUR = 3600;
const DAY = 86400;

// Velero file-level copies. The daily one goes to Garage and covers every
// namespace; the weekly one goes to Backblaze B2 and covers a fixed list of
// namespaces (immich is not on it).
const VELERO_DAILY = {
  name: 'Velero daily volume copy',
  target: 'GARAGE',
  source: { type: 'velero', schedule: 'daily-backup' },
  maxAgeS: 26 * HOUR,
};
const VELERO_OFFSITE = {
  name: 'Velero weekly off-site copy',
  target: 'BACKBLAZE_B2',
  source: { type: 'velero', schedule: 'weekly-offsite' },
  maxAgeS: 8 * DAY,
};
// Dumps land in Garage and are copied to B2 once a week by one job.
const DUMPS_OFFSITE = {
  name: 'Weekly off-site copy of the dumps',
  target: 'BACKBLAZE_B2',
  source: { type: 'cron', cronjob: 'garage-offsite-sync' },
  maxAgeS: 8 * DAY,
};
// Second off-site copy (2026-11-27): a daily job mirrors every B2 bucket to
// Cloudflare R2, a different provider. withR2Mirror() below adds this row to
// every database that has a B2 backup, so the two lists cannot drift apart.
const R2_MIRROR = {
  name: 'Daily copy of the B2 backups',
  target: 'CLOUDFLARE_R2',
  source: { type: 'cron', cronjob: 'b2-r2-mirror' },
  maxAgeS: 26 * HOUR,
};
const withR2Mirror = (db) =>
  db.backups.some((b) => b.target === 'BACKBLAZE_B2') ? { ...db, backups: [...db.backups, R2_MIRROR] } : db;

const dailyDump = (cronjob, name = 'Daily dump (restore-tested weekly)') => ({
  name,
  target: 'GARAGE',
  source: { type: 'cron', cronjob },
  maxAgeS: 26 * HOUR,
});

const cnpg = ({ id, displayName, namespace, cluster, scraped = true, offsite = true, extra = [] }) => ({
  id,
  displayName,
  engine: 'POSTGRES',
  manager: 'CloudNativePG',
  // 3 since 2026-11-28: one per storage server, quorum synchronous replication.
  expectedInstances: 3,
  pods: { namespace, labels: { 'cnpg.io/cluster': cluster }, roleLabel: 'cnpg.io/instanceRole' },
  storage: 'MAYASTOR',
  backups: [
    {
      name: 'Base backup + WAL archive',
      target: 'BACKBLAZE_B2',
      // A cluster in a namespace Prometheus does not scrape has no live signal
      // (pass scraped: false). None is in that position at the moment.
      source: scraped ? { type: 'cnpg', kind: 'barman', cluster } : null,
      maxAgeS: 26 * HOUR,
    },
    {
      name: 'Daily volume snapshot',
      target: 'VOLUME_SNAPSHOT',
      source: scraped ? { type: 'cnpg', kind: 'snapshot', cluster } : null,
      maxAgeS: 26 * HOUR,
    },
    VELERO_DAILY,
    ...(offsite ? [VELERO_OFFSITE] : []),
    ...extra,
  ],
});

// Velero deliberately skips the MongoDB data volumes (they are annotated as
// excluded): these are backed up logically instead.
const mongo = ({ id, displayName, cluster, cronjob }) => ({
  id,
  displayName,
  engine: 'MONGODB',
  manager: 'Percona Operator',
  expectedInstances: 3,
  pods: {
    namespace: 'percona-mongodb',
    labels: { 'app.kubernetes.io/instance': cluster, 'app.kubernetes.io/component': 'mongod' },
    roleLabel: null,
  },
  storage: 'LVM_LOCAL',
  backups: [
    { name: 'Operator daily backup', target: 'GARAGE', source: null, maxAgeS: null },
    dailyDump(cronjob),
    DUMPS_OFFSITE,
  ],
});

const CATALOG = [
  cnpg({ id: 'pg-bookmarked', displayName: 'Bookmarked', namespace: 'default', cluster: 'cnpg-bookmarked' }),
  cnpg({
    id: 'pg-codetalk',
    displayName: 'Code Talk',
    namespace: 'default',
    cluster: 'cnpg-codetalk',
    extra: [dailyDump('postgresql-backup'), DUMPS_OFFSITE],
  }),
  cnpg({ id: 'pg-immich', displayName: 'Immich', namespace: 'immich', cluster: 'cnpg-immich', offsite: false }),
  {
    id: 'pg-ha',
    displayName: 'HA Postgres',
    engine: 'POSTGRES',
    manager: 'Patroni · 7 databases',
    expectedInstances: 3,
    patroni: { scope: 'pg-ha' },
    storage: 'HOST_DISK',
    backups: [
      { name: 'Scheduled backup', target: 'GARAGE', source: { type: 'pgha', kind: 'backup' }, maxAgeS: 26 * HOUR },
      {
        name: 'Hourly off-site mirror',
        target: 'BACKBLAZE_B2',
        source: { type: 'pgha', kind: 'offsite' },
        maxAgeS: 3 * HOUR,
      },
      // pg_dump of every database, written straight to R2 by the leader.
      {
        name: 'Nightly logical dump',
        target: 'CLOUDFLARE_R2',
        source: { type: 'pgha', kind: 'dumpR2' },
        maxAgeS: 26 * HOUR,
      },
    ],
  },
  {
    id: 'neon-tenantflow',
    displayName: 'TenantFlow (Neon)',
    engine: 'POSTGRES',
    manager: 'Neon (self-hosted)',
    expectedInstances: 6,
    pods: {
      namespace: 'neon',
      labels: { 'app.kubernetes.io/instance': 'tenantflow-neon' },
      roleLabel: 'apps.kubeblocks.io/component-name',
    },
    storage: 'MAYASTOR',
    backups: [VELERO_DAILY, VELERO_OFFSITE],
  },
  mongo({
    id: 'mongo-educationelly',
    displayName: 'EducationELLy',
    cluster: 'mongodb-educationelly',
    cronjob: 'mongodb-backup-educationelly',
  }),
  mongo({
    id: 'mongo-educationelly-graphql',
    displayName: 'EducationELLy GraphQL',
    cluster: 'mongodb-educationelly-graphql',
    cronjob: 'mongodb-backup-educationelly-graphql',
  }),
  mongo({
    id: 'mongo-intervalai',
    displayName: 'IntervalAI',
    cluster: 'mongodb-intervalai',
    cronjob: 'mongodb-backup',
  }),
  {
    id: 'redis-ha',
    displayName: 'Redis HA',
    engine: 'REDIS',
    manager: 'KubeBlocks · shared',
    expectedInstances: 5,
    pods: {
      namespace: 'default',
      labels: { 'app.kubernetes.io/instance': 'redis-ha' },
      roleLabel: 'kubeblocks.io/role',
      fallbackRoleLabel: 'apps.kubeblocks.io/component-name',
    },
    storage: 'LVM_LOCAL',
    backups: [VELERO_DAILY, VELERO_OFFSITE],
  },
  {
    id: 'immich-redis',
    displayName: 'Immich cache',
    engine: 'REDIS',
    manager: 'Valkey · cache only',
    expectedInstances: 1,
    pods: { namespace: 'immich', labels: { app: 'immich', component: 'redis' }, roleLabel: null },
    storage: 'NONE',
    backups: [],
  },
  {
    id: 'qdrant-ha',
    displayName: 'Qdrant',
    engine: 'QDRANT',
    manager: 'KubeBlocks',
    expectedInstances: 3,
    pods: { namespace: 'qdrant', labels: { 'app.kubernetes.io/instance': 'qdrant-ha' }, roleLabel: null },
    storage: 'LVM_LOCAL',
    backups: [VELERO_DAILY, VELERO_OFFSITE],
  },
  {
    id: 'influxdb',
    displayName: 'InfluxDB',
    engine: 'INFLUXDB',
    manager: 'StatefulSet',
    expectedInstances: 1,
    pods: { namespace: 'monitoring', labels: { app: 'influxdb' }, roleLabel: null },
    storage: 'LVM_LOCAL',
    backups: [
      dailyDump('influxdb-backup', 'Daily backup'),
      VELERO_DAILY,
      VELERO_OFFSITE,
    ],
  },
  {
    id: 'kafka',
    displayName: 'Kafka',
    engine: 'KAFKA',
    manager: 'Strimzi · event log',
    expectedInstances: 1,
    pods: {
      namespace: 'microservices',
      labels: { 'strimzi.io/cluster': 'vertex-kafka', 'strimzi.io/broker-role': 'true' },
      roleLabel: null,
    },
    storage: 'LVM_LOCAL',
    backups: [VELERO_DAILY, VELERO_OFFSITE],
  },
  {
    // Metrics only. Its volume is deliberately excluded from Velero: long-term
    // metrics are kept in Mimir, so losing this one loses recent history only.
    id: 'prometheus',
    displayName: 'Prometheus',
    engine: 'PROMETHEUS',
    manager: 'Metrics \u00b7 recent only',
    expectedInstances: 1,
    pods: {
      namespace: 'monitoring',
      labels: { 'app.kubernetes.io/name': 'prometheus' },
      roleLabel: null,
    },
    storage: 'LVM_LOCAL',
    backups: [],
  },
  {
    // Hosted by Google, outside the cluster: nothing here runs or measures it.
    id: 'firestore',
    displayName: 'Cloud Firestore',
    engine: 'FIRESTORE',
    manager: 'Google Firebase \u00b7 hosted',
    expectedInstances: 0,
    external: true,
    storage: 'EXTERNAL',
    backups: [],
  },
];

export const DATABASES = CATALOG.map(withR2Mirror);

// Which application talks to which data store, read from each workload's
// connection settings (host and database name only).
export const DATABASE_APPS = [
  { id: 'bookmarked', displayName: 'Bookmarked', databases: ['pg-bookmarked', 'redis-ha'] },
  { id: 'code-talk', displayName: 'Code Talk', databases: ['pg-codetalk', 'redis-ha'] },
  { id: 'immich', displayName: 'Immich', databases: ['pg-immich', 'immich-redis'] },
  { id: 'pop-portfolio', displayName: 'Pop!_Portfolio', databases: ['pg-ha', 'redis-ha'] },
  { id: 'vertex-platform', displayName: 'Vertex Platform', databases: ['pg-ha', 'redis-ha', 'influxdb', 'kafka'] },
  { id: 'lunary', displayName: 'Lunary', databases: ['pg-ha'] },
  { id: 'litellm', displayName: 'LiteLLM', databases: ['pg-ha', 'redis-ha'] },
  { id: 'vaultwarden', displayName: 'Vaultwarden', databases: ['pg-ha'] },
  { id: 'netbox', displayName: 'NetBox', databases: ['pg-ha', 'redis-ha'] },
  { id: 'grafana', displayName: 'Grafana', databases: ['pg-ha', 'influxdb', 'prometheus'] },
  { id: 'crowdsec', displayName: 'CrowdSec', databases: ['pg-ha'] },
  { id: 'tenantflow', displayName: 'TenantFlow', databases: ['neon-tenantflow', 'prometheus'] },
  { id: 'educationelly', displayName: 'EducationELLy', databases: ['mongo-educationelly'] },
  {
    id: 'educationelly-graphql',
    displayName: 'EducationELLy GraphQL',
    databases: ['mongo-educationelly-graphql'],
  },
  { id: 'intervalai', displayName: 'IntervalAI', databases: ['mongo-intervalai', 'qdrant-ha'] },
  // Firebook keeps its data in Firestore and uses Redis HA, through an HTTP
  // proxy, as a cache.
  { id: 'firebook', displayName: 'Firebook', databases: ['firestore', 'redis-ha'] },
  // Podrick has no database of its own: it reads cluster metrics.
  { id: 'podrick', displayName: 'Podrick', databases: ['prometheus'] },
  { id: 'shared-ai-gateway', displayName: 'Shared AI Gateway', databases: ['redis-ha', 'kafka'] },
  { id: 'graphql-gateway', displayName: 'GraphQL Gateway', databases: ['kafka'] },
];

// Databases that are running but that no application points at any more.
// Empty since 2026-11-21: the three old CloudNativePG clusters (auth, lunary,
// vaultwarden), kept as rollback copies after the move to HA Postgres, were
// retired. The test asserts this list matches the catalog, so a database that
// loses its last application has to be listed here or removed.
export const UNUSED_DATABASES = [];
