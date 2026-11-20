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
//             HOST_DISK (directly on the servers' disks) or NONE (a cache that
//             keeps nothing across restarts)
//   backups   `source` names the live signal that proves the backup ran:
//               cnpg       CloudNativePG "last available backup" for a cluster
//               cron       last success of a Kubernetes CronJob
//               velero     last success of a Velero schedule (Velero copies the
//                          volume's files; `daily-backup` covers every
//                          namespace, `weekly-offsite` a fixed list)
//               pgha       the HA Postgres backup / off-site mirror timers

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
const dailyDump = (cronjob, name = 'Daily dump (restore-tested weekly)') => ({
  name,
  target: 'GARAGE',
  source: { type: 'cron', cronjob },
  maxAgeS: 26 * HOUR,
});

const cnpg = ({ id, displayName, namespace, cluster, scraped = true, offsite = true, unused = false, extra = [] }) => ({
  id,
  displayName,
  engine: 'POSTGRES',
  // Three clusters are still running but their databases moved to HA Postgres.
  manager: unused ? 'CloudNativePG · no app uses it now' : 'CloudNativePG',
  expectedInstances: 2,
  pods: { namespace, labels: { 'cnpg.io/cluster': cluster }, roleLabel: 'cnpg.io/instanceRole' },
  storage: 'MAYASTOR',
  backups: [
    {
      name: 'Base backup + WAL archive',
      target: 'BACKBLAZE_B2',
      // The vaultwarden namespace is not scraped, so there is no live signal.
      source: scraped ? { type: 'cnpg', cluster } : null,
      maxAgeS: 26 * HOUR,
    },
    { name: 'Daily volume snapshot', target: 'VOLUME_SNAPSHOT', source: null, maxAgeS: null },
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

export const DATABASES = [
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
    ],
  },
  cnpg({ id: 'pg-auth', displayName: 'Auth (old)', namespace: 'default', cluster: 'cnpg-auth', unused: true }),
  cnpg({ id: 'pg-lunary', displayName: 'Lunary (old)', namespace: 'default', cluster: 'cnpg-lunary', unused: true }),
  cnpg({
    id: 'pg-vaultwarden',
    displayName: 'Vaultwarden (old)',
    namespace: 'vaultwarden',
    cluster: 'cnpg-vaultwarden',
    scraped: false,
    unused: true,
  }),
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
];

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
  { id: 'grafana', displayName: 'Grafana', databases: ['pg-ha', 'influxdb'] },
  { id: 'crowdsec', displayName: 'CrowdSec', databases: ['pg-ha'] },
  { id: 'tenantflow', displayName: 'TenantFlow', databases: ['neon-tenantflow'] },
  { id: 'educationelly', displayName: 'EducationELLy', databases: ['mongo-educationelly'] },
  {
    id: 'educationelly-graphql',
    displayName: 'EducationELLy GraphQL',
    databases: ['mongo-educationelly-graphql'],
  },
  { id: 'intervalai', displayName: 'IntervalAI', databases: ['mongo-intervalai', 'qdrant-ha'] },
  { id: 'firebook', displayName: 'Firebook', databases: ['redis-ha'] },
  { id: 'shared-ai-gateway', displayName: 'Shared AI Gateway', databases: ['redis-ha', 'kafka'] },
  { id: 'graphql-gateway', displayName: 'GraphQL Gateway', databases: ['kafka'] },
];

// Databases that are running but that no application points at any more.
export const UNUSED_DATABASES = ['pg-auth', 'pg-lunary', 'pg-vaultwarden'];
