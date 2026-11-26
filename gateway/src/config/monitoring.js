// The monitoring stack: where telemetry comes from, what collects it, where it
// is kept, who reads it, and how an alert reaches a person.
//
// Hand-maintained from the live configuration (the Alloy pipelines, the
// Prometheus, Mimir, Tempo and Alertmanager settings, Grafana's datasources),
// read on 2026-11-20. Health and throughput are live; the structure is not.
//
//   stage    column on the page, left to right
//   signal   which live figures to attach (see resolvers/monitoringTopology.js)

export const MONITORING_STAGES = [
  { id: 'SOURCE', label: 'Sources' },
  { id: 'COLLECT', label: 'Collectors' },
  { id: 'STORE', label: 'Stores' },
  { id: 'USE', label: 'Read and evaluate' },
  { id: 'NOTIFY', label: 'Alerting' },
];

export const MONITORING_NODES = [
  // --- sources
  {
    id: 'workloads',
    stage: 'SOURCE',
    displayName: 'Pods and apps',
    location: 'Every namespace',
    role: 'Write logs to stdout, expose metrics endpoints, and send traces and profiles when instrumented.',
  },
  {
    id: 'kube-state',
    stage: 'SOURCE',
    displayName: 'Kubernetes state',
    location: 'kube-state-metrics, kubelet, node-exporter',
    role: 'What the cluster says about itself: object state, container resource use, and per-node hardware metrics.',
    signal: { workloads: ['prometheus-kube-state-metrics', 'prometheus-prometheus-node-exporter'] },
  },
  {
    id: 'hosts',
    stage: 'SOURCE',
    displayName: 'Hosts',
    location: 'Seven nodes and the ASUSTOR',
    role: 'Operating-system metrics and the systemd journal of each machine.',
  },
  {
    id: 'devices',
    stage: 'SOURCE',
    displayName: 'Network & storage gear',
    location: 'Routers, NAS units, UPS, Garage, WireGuard',
    role: 'Things that are not Kubernetes: router and NAS metrics over SNMP and node_exporter, UPS state, Garage and WireGuard exporters, the DNS filter.',
  },
  {
    id: 'caretta',
    stage: 'SOURCE',
    displayName: 'Caretta',
    location: 'eBPF probe on every node',
    role: 'Watches TCP connections in the kernel and reports which workload talks to which, with no changes to the apps.',
    signal: { workloads: ['caretta'], up: 'caretta' },
  },
  {
    id: 'beyla',
    stage: 'SOURCE',
    displayName: 'Beyla',
    location: 'eBPF probe inside Alloy',
    role: 'Instruments HTTP and gRPC calls from the kernel, producing request metrics and traces for apps that have no tracing code.',
    signal: { up: 'beyla' },
  },
  {
    id: 'probes',
    stage: 'SOURCE',
    displayName: 'Synthetic probes',
    location: 'Blackbox exporters',
    role: 'Ask from outside whether sites and hosts answer: HTTP checks of public pages and pings of home devices.',
    signal: { workloads: ['blackbox-exporter', 'blackbox-exporter-home'] },
  },
  {
    id: 'browsers',
    stage: 'SOURCE',
    displayName: 'Browsers',
    location: 'Visitors to the web apps',
    role: 'Front-end errors, web vitals and traces sent from the page itself (Faro).',
  },

  // --- collectors
  {
    id: 'alloy',
    stage: 'COLLECT',
    displayName: 'Alloy',
    location: 'One per node',
    role: 'The main collector. Scrapes hosts, devices and the eBPF probes; tails pod logs, the journal and the ingress access log; profiles processes; and forwards each signal to its store.',
    signal: { workloads: ['prometheus-alloy'] },
  },
  {
    id: 'alloy-receivers',
    stage: 'COLLECT',
    displayName: 'Alloy receivers',
    location: 'Two pods',
    role: 'The front door for telemetry that is pushed: OpenTelemetry from apps and Faro from browsers.',
    signal: { workloads: ['alloy-receivers'] },
  },
  {
    id: 'alloy-nas',
    stage: 'COLLECT',
    displayName: 'Alloy on the NAS',
    location: 'ASUSTOR, outside the cluster',
    role: 'Collects from the NAS itself and its containers, scrapes the routers and takes in their syslog, so the home network is observed even when the cluster is not.',
    signal: { up: 'cadvisor-asustor' },
  },

  // --- stores
  {
    id: 'prometheus',
    stage: 'STORE',
    displayName: 'Prometheus',
    location: 'In the cluster, 15 days',
    role: 'Scrapes cluster targets itself and keeps recent metrics. It evaluates the alert rules.',
    signal: { workloads: ['prometheus-prometheus-kube-prometheus-prometheus'], stat: 'prometheus' },
  },
  {
    id: 'mimir',
    stage: 'STORE',
    displayName: 'Mimir',
    location: 'In the cluster, 90 days',
    role: 'Long-term metrics, and the home for everything that is not Kubernetes. Blocks are stored in Garage.',
    signal: { workloads: ['mimir-monolithic'], stat: 'mimir' },
  },
  {
    id: 'loki',
    stage: 'STORE',
    displayName: 'Loki',
    location: 'On the ASUSTOR',
    role: 'All logs. It runs outside the cluster, so logs keep arriving and stay readable when the cluster is down.',
    signal: { up: 'cadvisor-asustor', inferred: true },
  },
  {
    id: 'tempo',
    stage: 'STORE',
    displayName: 'Tempo',
    location: 'In the cluster, 30 days',
    role: 'Traces: the path of one request across services. Stored in Garage.',
    signal: { workloads: ['tempo-monolithic'], stat: 'tempo' },
  },
  {
    id: 'pyroscope',
    stage: 'STORE',
    displayName: 'Pyroscope',
    location: 'In the cluster',
    role: 'Continuous profiles: where each process spends its CPU time. Stored in Garage.',
    signal: { workloads: ['pyroscope'], stat: 'pyroscope' },
  },
  {
    id: 'garage',
    stage: 'STORE',
    displayName: 'Garage S3',
    location: 'Seven-node object store',
    role: 'The disks underneath Mimir, Tempo and Pyroscope.',
    signal: { up: 'garage' },
  },

  // --- read and evaluate
  {
    id: 'grafana',
    stage: 'USE',
    displayName: 'Grafana',
    location: 'Two pods',
    role: 'Dashboards and ad-hoc queries over every store.',
    signal: { workloads: ['prometheus-grafana'] },
  },
  {
    id: 'rules',
    stage: 'USE',
    displayName: 'Alert rules',
    location: 'Evaluated by Prometheus',
    role: 'Conditions checked continuously against the metrics. A rule that holds for long enough fires an alert.',
    signal: { stat: 'rules' },
  },
  {
    id: 'site',
    stage: 'USE',
    displayName: 'This site',
    location: 'The gateway behind these pages',
    role: 'The cluster pages you are looking at read their live figures from Prometheus and Mimir.',
  },

  // --- alerting
  {
    id: 'alertmanager',
    stage: 'NOTIFY',
    displayName: 'Alertmanager',
    location: 'Two replicas',
    role: 'Groups and de-duplicates firing alerts and decides who hears about them. Critical and warning alerts are sent on; the rest are dropped.',
    signal: { workloads: ['alertmanager-prometheus-kube-prometheus-alertmanager'], stat: 'alertmanager' },
  },
  {
    id: 'gotify',
    stage: 'NOTIFY',
    displayName: 'Gotify',
    location: 'Self-hosted push server',
    role: 'Delivers the alert to a phone. A small bridge translates Alertmanager webhooks into Gotify messages.',
    signal: { workloads: ['gotify', 'alertmanager-gotify-bridge'] },
  },
  {
    id: 'heartbeat',
    stage: 'NOTIFY',
    displayName: "Dead man's switch",
    location: 'healthchecks.io, outside the home',
    role: 'A job pings an outside service every five minutes. If the whole stack dies and nothing can send an alert, the missing ping raises one.',
    signal: { cron: 'healthchecks-heartbeat' },
  },
];

const flow = (from, to, signal, note) => ({ from, to, signal, note });

// signal: METRICS, LOGS, TRACES, PROFILES, ALERTS, QUERY or STORAGE.
export const MONITORING_FLOWS = [
  // metrics
  flow('kube-state', 'prometheus', 'METRICS', 'Prometheus scrapes cluster targets directly, found through ServiceMonitors.'),
  flow('workloads', 'prometheus', 'METRICS', 'Apps and operators that expose a metrics endpoint are scraped the same way.'),
  flow('probes', 'prometheus', 'METRICS', 'Probe results are scraped like any other target.'),
  flow('hosts', 'alloy', 'METRICS', 'Alloy reads host metrics on the node it runs on.'),
  flow('devices', 'alloy', 'METRICS', 'Alloy scrapes Garage and the WireGuard exporters.'),
  flow('caretta', 'alloy', 'METRICS', 'Alloy scrapes the connection map Caretta builds.'),
  flow('beyla', 'alloy', 'METRICS', 'Request rates and durations measured in the kernel.'),
  flow('devices', 'alloy-nas', 'METRICS', 'The NAS collects from itself, its containers, the routers, the UPS and SNMP devices.'),
  flow('alloy', 'mimir', 'METRICS', 'Remote-written to Mimir for long-term keeping.'),
  flow('alloy', 'prometheus', 'METRICS', 'A copy of host metrics is also remote-written to Prometheus.'),
  flow('alloy-nas', 'mimir', 'METRICS', 'Remote-written to Mimir across the tailnet.'),

  // logs
  flow('workloads', 'alloy', 'LOGS', 'Alloy tails every pod log on its node.'),
  flow('hosts', 'alloy', 'LOGS', 'The systemd journal and the ingress access log.'),
  flow('devices', 'alloy-nas', 'LOGS', 'Routers send syslog to the NAS.'),
  flow('browsers', 'alloy-receivers', 'LOGS', 'Front-end errors and events from Faro.'),
  flow('alloy', 'loki', 'LOGS', 'Pushed to Loki on the NAS.'),
  flow('alloy-receivers', 'loki', 'LOGS', 'Pushed to Loki on the NAS.'),
  flow('alloy-nas', 'loki', 'LOGS', 'Written to Loki on the same machine.'),

  // traces
  flow('workloads', 'alloy-receivers', 'TRACES', 'Instrumented apps send OpenTelemetry traces.'),
  flow('browsers', 'alloy-receivers', 'TRACES', 'Page loads and requests traced from the browser.'),
  flow('beyla', 'alloy', 'TRACES', 'Traces generated in the kernel for uninstrumented apps.'),
  flow('alloy', 'tempo', 'TRACES', 'Batched and sent to Tempo.'),
  flow('alloy-receivers', 'tempo', 'TRACES', 'Batched and sent to Tempo.'),

  // profiles
  flow('workloads', 'alloy', 'PROFILES', 'Alloy profiles running processes with eBPF and scrapes profile endpoints.'),
  flow('workloads', 'alloy-receivers', 'PROFILES', 'Apps with a profiling SDK push their own.'),
  flow('alloy', 'pyroscope', 'PROFILES', 'Written to Pyroscope.'),
  flow('alloy-receivers', 'pyroscope', 'PROFILES', 'Written to Pyroscope.'),

  // storage
  flow('mimir', 'garage', 'STORAGE', 'Metric blocks.'),
  flow('tempo', 'garage', 'STORAGE', 'Trace blocks.'),
  flow('pyroscope', 'garage', 'STORAGE', 'Profile blocks.'),

  // reading
  flow('prometheus', 'grafana', 'QUERY', 'Recent cluster metrics.'),
  flow('mimir', 'grafana', 'QUERY', 'The default datasource: long-term and non-cluster metrics.'),
  flow('loki', 'grafana', 'QUERY', 'Logs.'),
  flow('tempo', 'grafana', 'QUERY', 'Traces, linked from logs and metrics.'),
  flow('pyroscope', 'grafana', 'QUERY', 'Profiles.'),
  flow('prometheus', 'site', 'QUERY', 'Cluster state, database and DNS health for these pages.'),
  flow('mimir', 'site', 'QUERY', 'Host, router and tunnel health for these pages.'),
  flow('prometheus', 'rules', 'QUERY', 'Rules are evaluated against Prometheus.'),

  // alerting
  flow('rules', 'alertmanager', 'ALERTS', 'A firing rule becomes an alert.'),
  flow('alertmanager', 'gotify', 'ALERTS', 'Critical and warning alerts are pushed to a phone.'),
  flow('alertmanager', 'heartbeat', 'ALERTS', 'An always-firing test alert proves the path works; a job reports that to the outside service.'),
];
