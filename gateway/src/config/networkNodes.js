// Network visualization topology.
//
// This file is the hand-maintained map of the infrastructure. Health and
// metrics are live (Mimir); which machines exist and how they connect is not,
// so update this file when hardware or roles change.
//
// `hostname` is internal only: the resolver publishes `displayName` and never
// sends real hostnames or addresses to the client.
//
//   metricsInstance  `instance` label of the host's node_exporter series
//   up               { job, instance } of the scrape target that decides
//                    whether the node is reachable
//   garageInstance   `instance` label under job="garage" for Garage members
//
// A service may name a `signal` whose live state replaces the default
// "healthy while the machine is up": `headscale` (the tailnet coordination
// server) or `headscaleStandby` (its cold standby's sync).
//
// A link may name a `port` ({ instance, device }): the network interface that
// carries it. Its carrier and negotiated speed then drive the link's status
// and bandwidth instead of the link being inferred from its two ends alone.
// `instance` is a router's scrape instance, or a machine's hostname.
//
// The house has a SECOND NETWORK with its own router, deliberately separate
// from the homelab: no cluster traffic uses it. Five
// machines have one extra interface on it, as a management and backup path.
// Its devices and links are published like the rest (by role, never by make
// or address); links carry the type SECOND_NETWORK so the page can show the
// whole layer or hide it. A node with `tailnet: false` is not a tailnet member.

const UNIX = 'integrations/unix';

export const NODE_DEFINITIONS = [
  {
    id: 'edge-vps',
    hostname: 'vmi3610371',
    displayName: 'Edge VPS',
    type: 'K8S_NODE',
    zone: 'CLOUD',
    metricsInstance: 'vmi3610371',
    up: { job: UNIX, instance: 'vmi3610371' },
    services: [
      { name: 'Traefik Ingress', port: 443 },
      { name: 'App Frontends', port: null },
      { name: 'K3s Agent', port: null },
    ],
  },
  {
    id: 'cp-1',
    hostname: 'm920s',
    displayName: 'Control Plane 1',
    type: 'K8S_NODE',
    zone: 'HOME_NETWORK',
    metricsInstance: 'm920s',
    up: { job: UNIX, instance: 'm920s' },
    garageInstance: 'm920s',
    services: [
      { name: 'K3s Server', port: 6443 },
      { name: 'Mimir', port: 8080 },
      { name: 'Mayastor', port: null },
      { name: 'Garage S3', port: 3900 },
      { name: 'Headscale Standby', port: null, signal: 'headscaleStandby' },
    ],
  },
  {
    id: 'cp-2',
    hostname: 'elitedesk',
    displayName: 'Control Plane 2',
    type: 'K8S_NODE',
    zone: 'HOME_NETWORK',
    metricsInstance: 'elitedesk',
    up: { job: UNIX, instance: 'elitedesk' },
    garageInstance: 'elitedesk',
    services: [
      { name: 'K3s Server', port: 6443 },
      { name: 'CrowdSec LAPI', port: 8080 },
      { name: 'Mayastor', port: null },
      { name: 'Garage S3', port: 3900 },
    ],
  },
  {
    id: 'cp-3',
    hostname: 'm720q',
    displayName: 'Control Plane 3',
    type: 'K8S_NODE',
    zone: 'HOME_NETWORK',
    metricsInstance: 'm720q',
    up: { job: UNIX, instance: 'm720q' },
    garageInstance: 'm720q',
    services: [
      { name: 'K3s Server', port: 6443 },
      { name: 'Tempo', port: 3200 },
      { name: 'Mayastor', port: null },
      { name: 'Garage S3', port: 3900 },
    ],
  },
  {
    id: 'gpu-1',
    hostname: 'debian-marmoset',
    displayName: 'GPU Worker 1',
    type: 'K8S_NODE',
    zone: 'HOME_NETWORK',
    metricsInstance: 'debian-marmoset',
    up: { job: UNIX, instance: 'debian-marmoset' },
    garageInstance: 'debian-marmoset',
    services: [
      { name: 'K3s Agent', port: null },
      { name: 'Headscale', port: null, signal: 'headscale' },
      { name: 'Intel Xe GPU', port: null },
      { name: 'Garage S3', port: 3900 },
    ],
  },
  {
    id: 'gpu-2',
    hostname: 'neonmarmoset',
    displayName: 'GPU Worker 2',
    type: 'K8S_NODE',
    zone: 'HOME_NETWORK',
    metricsInstance: 'neonmarmoset',
    up: { job: UNIX, instance: 'neonmarmoset' },
    garageInstance: 'neonmarmoset',
    services: [
      { name: 'K3s Agent', port: null },
      { name: 'Intel Xe GPU', port: null },
      { name: 'Garage S3', port: 3900 },
    ],
  },
  {
    id: 'gpu-workstation',
    hostname: 'marmoset',
    displayName: 'GPU Workstation',
    type: 'K8S_NODE',
    zone: 'HOME_NETWORK',
    metricsInstance: 'marmoset',
    up: { job: UNIX, instance: 'marmoset' },
    services: [
      { name: 'K3s Agent', port: null },
      { name: 'NVIDIA GPU', port: null },
    ],
  },
  {
    id: 'primary-router',
    hostname: 'RT-BE88U',
    displayName: 'Primary Router',
    type: 'ROUTER',
    zone: 'HOME_NETWORK',
    metricsInstance: 'be88u',
    up: { job: 'router-node', instance: 'be88u' },
    services: [
      { name: 'Gateway', port: null },
      { name: 'DHCP / DNS', port: null },
      { name: 'Tailnet Subnet Router', port: null },
    ],
  },
  {
    id: 'mesh-node',
    hostname: 'RT-AX86U_Pro',
    displayName: 'Mesh Node',
    type: 'ROUTER',
    zone: 'HOME_NETWORK',
    metricsInstance: 'ax86u-pro',
    up: { job: 'router-node', instance: 'ax86u-pro' },
    services: [
      { name: 'Wi-Fi Access Point', port: null },
      { name: 'Ethernet Backhaul', port: null },
      { name: 'Tailnet Subnet Router', port: null },
    ],
  },
  // The four LAN switches. They expose no metrics, so their health is
  // inferred: a switch is up while any machine cabled to it is reachable
  // (`inferFrom`). Published by role, not by make, and listed left to right as
  // they sit above the machines cabled to them.
  {
    id: 'switch-b1',
    hostname: 'TRENDnet',
    displayName: 'Access Switch 1',
    type: 'SWITCH',
    zone: 'HOME_NETWORK',
    metricsInstance: null,
    inferFrom: ['cp-1', 'gpu-1', 'gpu-2', 'asustor'],
    services: [{ name: 'MoCA Uplink', port: null }],
  },
  {
    id: 'switch-b2',
    hostname: 'YuLinca-B',
    displayName: 'Access Switch 2',
    type: 'SWITCH',
    zone: 'HOME_NETWORK',
    metricsInstance: null,
    inferFrom: ['asustor', 'synology'],
    services: [],
  },
  {
    id: 'switch-c',
    hostname: 'YuLinca-router',
    displayName: 'Access Switch 3',
    type: 'SWITCH',
    zone: 'HOME_NETWORK',
    metricsInstance: null,
    inferFrom: ['cp-2'],
    services: [{ name: 'Router Uplink', port: null }],
  },
  {
    id: 'switch-a',
    hostname: 'YuanLey',
    displayName: 'Access Switch 4',
    type: 'SWITCH',
    zone: 'HOME_NETWORK',
    metricsInstance: null,
    inferFrom: ['cp-3', 'gpu-workstation'],
    services: [{ name: 'MoCA Uplink', port: null }],
  },
  // ── Second network ──────────────────────────────────────────────────────
  // Only the access point has a signal of its own: an ICMP probe to its
  // tailnet address, which it can only answer through its switch, the second
  // router and that router's uplink. The router and that switch are therefore
  // inferred from it. `up.optional`: a missing probe result is unknown, not
  // down (probes come from Prometheus, the rest of `up` from Mimir).
  {
    id: 'second-router',
    hostname: 'OpenMPTCProuter',
    displayName: 'Second Network Router',
    type: 'ROUTER',
    zone: 'HOME_NETWORK',
    metricsInstance: null,
    inferFrom: ['access-point'],
    tailnet: false,
    // How this router reaches the internet is deliberately not described
    // or drawn (owner's decision, 2026-11-21): the map stops at the router.
    services: [{ name: 'Gateway', port: null }],
  },
  {
    id: 'access-point',
    hostname: 'RT-AXE7800',
    displayName: 'Access Point',
    type: 'ROUTER',
    zone: 'HOME_NETWORK',
    metricsInstance: null,
    up: { job: 'icmp-infra', instance: '100.64.0.13', optional: true },
    services: [{ name: 'Wi-Fi Access Point', port: null }],
  },
  // The three switches of the second network. Like the homelab switches they
  // expose no metrics. The one at the router is inferred from the access
  // point; the other two are judged by the carrier of the machine ports
  // cabled to them (`inferFromPorts`), because those machines being reachable
  // over the homelab says nothing about this network.
  // Listed in the order they are drawn, left to right: the two room switches
  // above their machines, the one at the router last, below the router.
  {
    id: 'switch-s2',
    hostname: 'Unmanaged-second-b',
    displayName: 'Access Switch 6',
    type: 'SWITCH',
    zone: 'HOME_NETWORK',
    metricsInstance: null,
    inferFromPorts: [
      { instance: 'm920s', device: 'eno1' },
      { instance: 'debian-marmoset', device: 'enx3c8cf861771b' },
      { instance: 'neonmarmoset', device: 'enx00e04c6707fd' },
    ],
    services: [{ name: 'MoCA Uplink', port: null }],
  },
  {
    id: 'switch-s3',
    hostname: 'MoCA-adapter-second-a',
    displayName: 'Access Switch 7',
    type: 'SWITCH',
    zone: 'HOME_NETWORK',
    metricsInstance: null,
    inferFromPorts: [{ instance: 'marmoset', device: 'enx8cae4cb97d51' }],
    services: [{ name: 'Built Into a MoCA Adapter', port: null }],
  },
  {
    id: 'switch-s1',
    hostname: 'TRENDnet-second',
    displayName: 'Access Switch 5',
    type: 'SWITCH',
    zone: 'HOME_NETWORK',
    metricsInstance: null,
    inferFrom: ['access-point'],
    services: [{ name: 'Router Uplink', port: null }],
  },
  {
    id: 'asustor',
    hostname: 'AS5402T-A7F3',
    displayName: 'ASUSTOR NAS',
    type: 'NAS',
    zone: 'STORAGE',
    metricsInstance: 'AS5402T-A7F3',
    up: { job: UNIX, instance: 'AS5402T-A7F3' },
    garageInstance: 'asustor',
    services: [
      { name: 'Garage S3', port: 3900 },
      { name: 'Loki', port: 3100 },
      { name: 'NFS', port: 2049 },
    ],
  },
  {
    id: 'synology',
    hostname: 'DS423',
    displayName: 'Synology NAS',
    type: 'NAS',
    zone: 'STORAGE',
    // No node_exporter on this host: its Garage scrape is the liveness signal.
    metricsInstance: null,
    up: { job: 'garage', instance: 'synology' },
    garageInstance: 'synology',
    services: [
      { name: 'Garage S3', port: 3900 },
      { name: 'iSCSI Targets', port: 3260 },
    ],
  },
];

// The Mayastor volume layer is not a machine: its pools live on the three
// control-plane servers. It is drawn as one storage node, with health and
// usage taken from Prometheus (see lib/storageClient.js).
export const MAYASTOR_NODE = {
  id: 'mayastor',
  displayName: 'Mayastor Volumes',
  type: 'REPLICATED_STORAGE',
  zone: 'STORAGE',
};

// Every machine on the map is registered with Headscale (checked against its
// node list), the coordination server of the tailnet the cluster's node
// network runs on. Client devices on the tailnet are not infrastructure and
// are not drawn. Both routers also advertise the home LAN to the tailnet.
//
// The tailnet is a full mesh, which is unreadable as lines. It is drawn from
// the machine that hosts Headscale, its coordination server, to every other
// member: the lines mean "registered with this tailnet", not "traffic flows
// through this machine" (members talk to each other directly).
const TAILNET_HOST = 'gpu-1';
const TAILNET_MEMBERS = NODE_DEFINITIONS.filter((n) => n.type !== 'SWITCH' && n.tailnet !== false)
  .map((n) => n.id)
  .filter((id) => id !== TAILNET_HOST);

// OpenEBS LVM LocalPV: volumes carved from an LVM volume group on one server
// and usable only on that server. Not replicated; the databases that use them
// replicate at their own level. Like Mayastor it is a volume layer, not a
// machine, with status from Prometheus (lib/storageClient.js).
export const LVM_NODE = {
  id: 'lvm-local',
  displayName: 'LVM Local Volumes',
  type: 'LOCAL_STORAGE',
  zone: 'STORAGE',
};

// Backblaze B2 holds the off-site copies. It is a service, not a machine; its
// health is the freshness of the jobs that write to it (lib/backupClient.js).
export const OFFSITE_NODE = {
  id: 'offsite-backup',
  displayName: 'Backblaze B2',
  type: 'OFFSITE_BACKUP',
  zone: 'CLOUD',
};

const K8S_NODES = NODE_DEFINITIONS.filter((n) => n.type === 'K8S_NODE').map((n) => n.id);
const CONTROL_PLANE = ['cp-1', 'cp-2', 'cp-3'];
// Nodes running the Mayastor CSI node plugin: they mount volumes over NVMe-oF.
// The servers also host the pools; the GPU workers are clients only.
const MAYASTOR_CLIENTS = [...CONTROL_PLANE, 'gpu-1', 'gpu-2'];
const NAS = ['asustor', 'synology'];
const GARAGE_MEMBERS = NODE_DEFINITIONS.filter((n) => n.garageInstance).map((n) => n.id);


export const LINK_DEFINITIONS = [
  // Tailscale is the cluster overlay: every k3s node uses its tailnet address
  // as its node address, so pod and API traffic between the cloud node and
  // home rides the tailnet.
  ...TAILNET_MEMBERS.map((id) => ({ source: TAILNET_HOST, target: id, type: 'TAILSCALE' })),

  // WireGuard is the older, separate mesh. It still carries what must not
  // depend on the tailnet: the public front door to Headscale itself (edge
  // Traefik -> GPU Worker 1) and the edge node's reach to hosts outside k3s.
  // `wgPeer` is the peer's address on that mesh; its last handshake in Mimir
  // decides whether the tunnel is up.
  { source: 'edge-vps', target: 'gpu-1', type: 'WIREGUARD', wgPeer: '10.0.0.9' },
  { source: 'edge-vps', target: 'asustor', type: 'WIREGUARD', wgPeer: '10.0.0.4' },
  { source: 'edge-vps', target: 'synology', type: 'WIREGUARD', wgPeer: '10.0.0.5' },
  { source: 'edge-vps', target: 'mesh-node', type: 'WIREGUARD', wgPeer: '10.0.0.6' },

  // Mayastor pools sit on the three servers; volumes are replicated between
  // them and served over NVMe-oF to every node that mounts one.
  ...MAYASTOR_CLIENTS.map((id) => ({ source: id, target: MAYASTOR_NODE.id, type: 'NVME_OF' })),

  // LVM local volumes exist on the three servers only, each carved from that
  // server's own disks.
  ...CONTROL_PLANE.map((cp) => ({ source: cp, target: LVM_NODE.id, type: 'LOCAL_VOLUME' })),

  // Garage is a full mesh of seven members. Drawing all 21 pairs is
  // unreadable, so each member is drawn to the two NAS members only.
  ...GARAGE_MEMBERS.filter((id) => !NAS.includes(id)).flatMap((id) =>
    NAS.map((nas) => ({ source: id, target: nas, type: 'GARAGE_REPLICATION' })),
  ),
  { source: 'asustor', target: 'synology', type: 'GARAGE_REPLICATION' },

  // Every cluster node ships logs to Loki on the ASUSTOR.
  ...K8S_NODES.map((id) => ({ source: id, target: 'asustor', type: 'LOKI' })),

  // Media and photo libraries are NFS mounts from the ASUSTOR.
  { source: 'gpu-1', target: 'asustor', type: 'NFS' },
  { source: 'gpu-2', target: 'asustor', type: 'NFS' },
  { source: 'cp-1', target: 'asustor', type: 'NFS' },

  // Wired LAN, as cabled (confirmed by the owner, not discoverable from
  // metrics):
  //
  //   Access Switch 1 (TRENDnet)   Control Plane 1, GPU Worker 1 and 2, ASUSTOR
  //                                -> MoCA coax -> primary router
  //   Access Switch 2 (YuLinca)    ASUSTOR, Synology; cabled to Access Switch 1
  //   Access Switch 3 (YuLinca)    Control Plane 2 -> primary router
  //   Access Switch 4 (YuanLey)    Control Plane 3, GPU Workstation
  //                                -> MoCA coax -> primary router
  //   direct                       Control Plane 2 -> primary router
  //
  // Four machines are dual-cabled into their switch (`via: 'Two cables'`).
  // A link may state a fixed `speedBps`. Otherwise a machine with a single
  // wired link reports its live uplink speed
  // (lib/storageClient.js, fetchUplinkSpeeds); one cabled to two places does
  // not, because the metric does not say which link is which.
  ...[
    ['cp-3', 'switch-a', 'Two cables'],
    ['gpu-workstation', 'switch-a'],
    ['cp-1', 'switch-b1', 'Two cables'],
    ['gpu-1', 'switch-b1', 'Two cables'],
    ['gpu-2', 'switch-b1', 'Two cables'],
    ['asustor', 'switch-b1'],
    ['asustor', 'switch-b2'],
    ['synology', 'switch-b2'],
    ['cp-2', 'switch-c'],
    ['cp-2', 'primary-router'],
    ['switch-b1', 'switch-b2'],
    ['switch-c', 'primary-router'],
  ].map(([source, target, via]) => ({ source, target, type: 'ETHERNET', ...(via && { via }) })),

  // Control Plane 3 has a third NIC (1 GbE) cabled to a LAN port on the mesh
  // node; its two 2.5 GbE NICs go to Access Switch 4. The mesh node itself is
  // not cabled to that switch.
  { source: 'cp-3', target: 'mesh-node', type: 'ETHERNET', speedBps: 1e9 },

  // Both access segments reach the primary router over the MoCA coax. Each
  // coax run ends in a MoCA adapter that plugs into the router by Ethernet;
  // the adapters are deliberately not drawn, so the link runs switch to router.
  { source: 'switch-a', target: 'primary-router', type: 'MOCA' },
  { source: 'switch-b1', target: 'primary-router', type: 'MOCA' },

  // The mesh node's Ethernet backhaul runs from the primary router over the
  // MoCA coax straight into the mesh node; it does not pass through a switch.
  // The node's uplink port is the live signal: carrier lost means the
  // backhaul is down.
  {
    source: 'primary-router',
    target: 'mesh-node',
    type: 'BACKHAUL',
    via: 'MoCA coax',
    port: { instance: 'ax86u-pro', device: 'eth5' },
  },

  // Second network, as cabled (confirmed by the owner 2026-11-21):
  //
  //   Second Network Router -> Access Switch 5 (at the router)
  //   Access Switch 5    Access Point; MoCA coax to the two rooms below
  //   Access Switch 6    Control Plane 1, GPU Worker 1 and 2, ASUSTOR
  //   Access Switch 7    GPU Workstation (the switch is built into the MoCA
  //                      adapter in that room)
  //
  // No machine is cabled to the second router itself. As on the homelab side
  // the MoCA adapters are not drawn: the coax hop runs switch to switch.
  // Machine links name the port that carries them, so each shows its own
  // carrier and speed. The ASUSTOR's port has no metric in Prometheus.
  ...[
    ['second-router', 'switch-s1'],
    ['switch-s1', 'access-point'],
    ['switch-s1', 'switch-s2', { via: 'MoCA coax' }],
    ['switch-s1', 'switch-s3', { via: 'MoCA coax' }],
    ['cp-1', 'switch-s2', { port: { instance: 'm920s', device: 'eno1' } }],
    ['gpu-1', 'switch-s2', { port: { instance: 'debian-marmoset', device: 'enx3c8cf861771b' } }],
    ['gpu-2', 'switch-s2', { port: { instance: 'neonmarmoset', device: 'enx00e04c6707fd' } }],
    ['asustor', 'switch-s2'],
    ['gpu-workstation', 'switch-s3', { port: { instance: 'marmoset', device: 'enx8cae4cb97d51' } }],
  ].map(([source, target, extra]) => ({ source, target, type: 'SECOND_NETWORK', ...extra })),

  // Off-site backups leave from the three servers: Velero and the Garage dump
  // sync run in the cluster, and the Postgres mirror runs on the HA leader.
  ...CONTROL_PLANE.map((cp) => ({ source: cp, target: OFFSITE_NODE.id, type: 'OFFSITE_BACKUP' })),

  // One remaining iSCSI volume lives on the Synology.
  { source: 'cp-1', target: 'synology', type: 'ISCSI' },
];
