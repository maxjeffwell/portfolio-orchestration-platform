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
// A link may name a `port` ({ instance, device }): the network interface that
// carries it. Its carrier and negotiated speed then drive the link's status
// and bandwidth instead of the link being inferred from its two ends alone.

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
      { name: 'Wired Backhaul', port: null },
    ],
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

const K8S_NODES = NODE_DEFINITIONS.filter((n) => n.type === 'K8S_NODE').map((n) => n.id);
const CONTROL_PLANE = ['cp-1', 'cp-2', 'cp-3'];
// Nodes running the Mayastor CSI node plugin: they mount volumes over NVMe-oF.
// The servers also host the pools; the GPU workers are clients only.
const MAYASTOR_CLIENTS = [...CONTROL_PLANE, 'gpu-1', 'gpu-2'];
const NAS = ['asustor', 'synology'];
const GARAGE_MEMBERS = NODE_DEFINITIONS.filter((n) => n.garageInstance).map((n) => n.id);


export const LINK_DEFINITIONS = [
  // Encrypted overlay: the cloud node joins the home control plane over it.
  ...CONTROL_PLANE.map((cp) => ({ source: 'edge-vps', target: cp, type: 'WIREGUARD' })),

  // Mayastor pools sit on the three servers; volumes are replicated between
  // them and served over NVMe-oF to every node that mounts one.
  ...MAYASTOR_CLIENTS.map((id) => ({ source: id, target: MAYASTOR_NODE.id, type: 'NVME_OF' })),

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

  // The mesh node reaches the primary router over a wired backhaul. The node's
  // uplink port is the live signal: carrier lost means the backhaul is down.
  {
    source: 'primary-router',
    target: 'mesh-node',
    type: 'BACKHAUL',
    port: { instance: 'ax86u-pro', device: 'eth5' },
  },

  // One remaining iSCSI volume lives on the Synology.
  { source: 'cp-1', target: 'synology', type: 'ISCSI' },
];
