export const NODE_DEFINITIONS = [
  {
    id: 'control-plane',
    hostname: 'vmi2951245',
    displayName: 'Control Plane',
    type: 'K8S_NODE',
    zone: 'CLOUD',
    wireguardIp: '10.0.0.1',
    services: [
      { name: 'K3s CP', port: 6443 },
      { name: 'Garage S3', port: 3900 },
      { name: 'Mimir', port: 8080 },
      { name: 'CrowdSec', port: null },
    ],
  },
  {
    id: 'worker',
    hostname: 'vmi3115606',
    displayName: 'Worker Node',
    type: 'K8S_NODE',
    zone: 'CLOUD',
    wireguardIp: '10.0.0.3',
    services: [
      { name: 'Databases', port: null },
      { name: 'Apps', port: null },
      { name: 'Tempo', port: 3200 },
    ],
  },
  {
    id: 'gpu-node',
    hostname: 'marmoset',
    displayName: 'GPU Node',
    type: 'K8S_NODE',
    zone: 'HOME_NETWORK',
    wireguardIp: '10.0.0.2',
    services: [
      { name: 'K3s Agent', port: null },
      { name: 'Triton', port: 8020 },
    ],
  },
  {
    id: 'primary-router',
    hostname: 'RT-BE88U',
    displayName: 'Primary Router',
    type: 'ROUTER',
    zone: 'HOME_NETWORK',
    wireguardIp: null,
    services: [
      { name: 'CrowdSec', port: null },
      { name: 'Gateway', port: null },
    ],
  },
  {
    id: 'axe-7800',
    hostname: 'RT-AXE7800',
    displayName: 'AXE-7800',
    type: 'ROUTER',
    zone: 'HOME_NETWORK',
    wireguardIp: null,
    services: [
      { name: 'Garage S3', port: 3900 },
      { name: 'CrowdSec', port: null },
    ],
  },
  {
    id: 'ax86u-pro',
    hostname: 'RT-AX86U_Pro',
    displayName: 'AX86U Pro',
    type: 'ROUTER',
    zone: 'HOME_NETWORK',
    wireguardIp: null,
    services: [
      { name: 'Garage S3', port: 3900 },
      { name: 'CrowdSec', port: null },
    ],
  },
  {
    id: 'asustor',
    hostname: 'AS5402T-A7F3',
    displayName: 'ASUSTOR NAS',
    type: 'NAS',
    zone: 'STORAGE',
    wireguardIp: '10.0.0.4',
    services: [
      { name: 'Garage S3', port: 3900 },
      { name: 'Loki', port: 3100 },
      { name: 'CrowdSec LAPI', port: 8080 },
      { name: 'NFS', port: 2049 },
    ],
  },
  {
    id: 'synology',
    hostname: 'DS423',
    displayName: 'Synology NAS',
    type: 'NAS',
    zone: 'STORAGE',
    wireguardIp: '10.0.0.5',
    services: [
      { name: 'Garage S3', port: 3900 },
      { name: 'iSCSI Targets', port: 3260 },
      { name: 'Snapshots', port: null },
    ],
  },
];

export const WIREGUARD_PEERS = [
  { source: 'control-plane', target: 'worker' },
  { source: 'control-plane', target: 'gpu-node' },
  { source: 'control-plane', target: 'asustor' },
  { source: 'control-plane', target: 'synology' },
  { source: 'worker', target: 'gpu-node' },
  { source: 'worker', target: 'asustor' },
  { source: 'worker', target: 'synology' },
  { source: 'gpu-node', target: 'asustor' },
  { source: 'gpu-node', target: 'synology' },
  { source: 'asustor', target: 'synology' },
];

export const STATIC_LINKS = [
  { source: 'worker', target: 'synology', type: 'ISCSI' },
  { source: 'asustor', target: 'synology', type: 'GARAGE_REPLICATION' },
  { source: 'asustor', target: 'axe-7800', type: 'GARAGE_REPLICATION' },
  { source: 'asustor', target: 'ax86u-pro', type: 'GARAGE_REPLICATION' },
  { source: 'synology', target: 'axe-7800', type: 'GARAGE_REPLICATION' },
  { source: 'synology', target: 'ax86u-pro', type: 'GARAGE_REPLICATION' },
  { source: 'axe-7800', target: 'ax86u-pro', type: 'GARAGE_REPLICATION' },
  { source: 'control-plane', target: 'asustor', type: 'LOKI' },
  { source: 'worker', target: 'asustor', type: 'LOKI' },
  { source: 'gpu-node', target: 'asustor', type: 'LOKI' },
  { source: 'worker', target: 'asustor', type: 'NFS' },
  { source: 'control-plane', target: 'asustor', type: 'NFS' },
];

export const HOSTNAME_TO_ID = Object.fromEntries(
  NODE_DEFINITIONS.map((n) => [n.hostname, n.id])
);

export const WG_IP_TO_ID = Object.fromEntries(
  NODE_DEFINITIONS.filter((n) => n.wireguardIp).map((n) => [n.wireguardIp, n.id])
);
