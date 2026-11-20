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
//   storage   MAYASTOR (replicated volumes), LVM_LOCAL (node-local volumes) or
//             HOST_DISK (directly on the servers' disks)
//   backups   `source` names the live signal that proves the backup ran:
//               cnpg       CloudNativePG "last available backup" for a cluster
//               cron       last success of a Kubernetes CronJob
//               velero     last success of a Velero schedule
//               pgha       the HA Postgres backup / off-site mirror timers

const HOUR = 3600;
const DAY = 86400;

const cnpg = ({ id, displayName, namespace, cluster, scraped = true }) => ({
  id,
  displayName,
  engine: 'POSTGRES',
  manager: 'CloudNativePG',
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
  ],
});

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
    {
      name: 'Daily dump',
      target: 'BACKBLAZE_B2',
      source: { type: 'cron', cronjob },
      maxAgeS: 26 * HOUR,
    },
  ],
});

const withBackup = (db, backup) => ({ ...db, backups: [...db.backups, backup] });

export const DATABASES = [
  cnpg({ id: 'pg-bookmarked', displayName: 'Bookmarked', namespace: 'default', cluster: 'cnpg-bookmarked' }),
  withBackup(
    cnpg({ id: 'pg-codetalk', displayName: 'Code Talk', namespace: 'default', cluster: 'cnpg-codetalk' }),
    {
      name: 'Daily dump',
      target: 'BACKBLAZE_B2',
      source: { type: 'cron', cronjob: 'postgresql-backup' },
      maxAgeS: 26 * HOUR,
    },
  ),
  cnpg({ id: 'pg-auth', displayName: 'Auth', namespace: 'default', cluster: 'cnpg-auth' }),
  cnpg({ id: 'pg-lunary', displayName: 'Lunary', namespace: 'default', cluster: 'cnpg-lunary' }),
  cnpg({ id: 'pg-immich', displayName: 'Immich', namespace: 'immich', cluster: 'cnpg-immich' }),
  cnpg({
    id: 'pg-vaultwarden',
    displayName: 'Vaultwarden',
    namespace: 'vaultwarden',
    cluster: 'cnpg-vaultwarden',
    scraped: false,
  }),
  {
    id: 'pg-ha',
    displayName: 'HA Postgres',
    engine: 'POSTGRES',
    manager: 'Patroni',
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
    backups: [
      {
        name: 'Cluster backup',
        target: 'GARAGE',
        source: { type: 'velero', schedule: 'daily-backup' },
        maxAgeS: 26 * HOUR,
      },
    ],
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
    manager: 'KubeBlocks',
    expectedInstances: 5,
    pods: {
      namespace: 'default',
      labels: { 'app.kubernetes.io/instance': 'redis-ha' },
      roleLabel: 'kubeblocks.io/role',
      fallbackRoleLabel: 'apps.kubeblocks.io/component-name',
    },
    storage: 'LVM_LOCAL',
    backups: [
      {
        name: 'Cluster backup',
        target: 'GARAGE',
        source: { type: 'velero', schedule: 'daily-backup' },
        maxAgeS: 26 * HOUR,
      },
    ],
  },
  {
    id: 'qdrant-ha',
    displayName: 'Qdrant',
    engine: 'QDRANT',
    manager: 'KubeBlocks',
    expectedInstances: 3,
    pods: { namespace: 'qdrant', labels: { 'app.kubernetes.io/instance': 'qdrant-ha' }, roleLabel: null },
    storage: 'LVM_LOCAL',
    backups: [
      {
        name: 'Cluster backup',
        target: 'GARAGE',
        source: { type: 'velero', schedule: 'daily-backup' },
        maxAgeS: 26 * HOUR,
      },
      {
        name: 'Weekly off-site backup',
        target: 'BACKBLAZE_B2',
        source: { type: 'velero', schedule: 'weekly-offsite' },
        maxAgeS: 8 * DAY,
      },
    ],
  },
];

// Which application talks to which database. Each pair is permitted by a
// NetworkPolicy in the cluster; pairs without one are not listed.
export const DATABASE_APPS = [
  { id: 'bookmarked', displayName: 'Bookmarked', databases: ['pg-bookmarked'] },
  { id: 'tenantflow', displayName: 'TenantFlow', databases: ['pg-bookmarked', 'neon-tenantflow'] },
  { id: 'code-talk', displayName: 'Code Talk', databases: ['pg-codetalk', 'redis-ha'] },
  { id: 'portfolio-api', displayName: 'Portfolio API', databases: ['pg-auth', 'pg-ha', 'redis-ha'] },
  { id: 'vertex-platform', displayName: 'Vertex Platform', databases: ['pg-auth', 'redis-ha'] },
  { id: 'lunary', displayName: 'Lunary', databases: ['pg-lunary', 'pg-ha'] },
  { id: 'litellm', displayName: 'LiteLLM', databases: ['pg-ha'] },
  { id: 'immich', displayName: 'Immich', databases: ['pg-immich'] },
  { id: 'vaultwarden', displayName: 'Vaultwarden', databases: ['pg-vaultwarden'] },
  { id: 'educationelly', displayName: 'EducationELLy', databases: ['mongo-educationelly'] },
  {
    id: 'educationelly-graphql',
    displayName: 'EducationELLy GraphQL',
    databases: ['mongo-educationelly-graphql'],
  },
  { id: 'intervalai', displayName: 'IntervalAI', databases: ['mongo-intervalai', 'qdrant-ha'] },
];
