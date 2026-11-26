import {
  fetchNodeMetrics,
  fetchUpStatus,
  fetchPortStatus,
  fetchPortTraffic,
  formatUptime,
} from '../lib/mimirClient.js';
import {
  fetchMayastorStatus,
  fetchLvmStatus,
  fetchUplinkSpeeds,
  fetchHostPortStatus,
  fetchHostPortTraffic,
  fetchStorageTraffic,
  fetchProbeStatus,
} from '../lib/storageClient.js';
import { fetchOffsiteBackupStatus } from '../lib/backupClient.js';
import {
  fetchHeadscaleStatus,
  fetchWireguardHandshakes,
  fetchWireguardTraffic,
} from '../lib/overlayClient.js';
import {
  NODE_DEFINITIONS,
  LINK_DEFINITIONS,
  MAYASTOR_NODE,
  LVM_NODE,
  OFFSITE_NODE,
  OFFSITE_HOSTS,
} from '../config/networkNodes.js';

const TOPOLOGY_INTERVAL_MS = parseInt(
  process.env.NETWORK_TOPOLOGY_INTERVAL_MS || '30000',
  10,
);

const SEVERITY = { HEALTHY: 0, DEGRADED: 1, OFFLINE: 2 };
const GARAGE_SERVICE = 'Garage S3';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function worst(a, b) {
  return SEVERITY[a] >= SEVERITY[b] ? a : b;
}

function round(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function buildNodeMetrics(metrics, instance) {
  if (!metrics || !instance) return null;

  const cpu = metrics.cpu[instance];
  const memUsed = metrics.memUsed[instance];
  const memTotal = metrics.memTotal[instance];
  const storageUsed = metrics.storageUsed[instance];
  const storageTotal = metrics.storageTotal[instance];

  if (cpu == null && memTotal == null) return null;

  return {
    cpuPercent: cpu != null ? round(cpu * 100, 2) : null,
    memoryPercent:
      memUsed != null && memTotal ? round((memUsed / memTotal) * 100, 2) : null,
    memoryUsedMb: memUsed != null ? Math.round(memUsed / 1048576) : null,
    memoryTotalMb: memTotal != null ? Math.round(memTotal / 1048576) : null,
    storageUsedGb: storageUsed != null ? round(storageUsed / 1073741824, 1) : null,
    storageTotalGb: storageTotal != null ? round(storageTotal / 1073741824, 1) : null,
    uptime: formatUptime(metrics.uptime[instance]),
  };
}

// Health comes from scrape-target liveness in Mimir:
//   OFFLINE   the node's own target is down or missing
//   DEGRADED  the node is up but its Garage member is not, or Mimir gave us
//             nothing at all (unknown is not the same as down)
//   HEALTHY   otherwise
function nodeHealth(def, up, mimirAnswered) {
  if (!mimirAnswered) return 'DEGRADED';
  const key = `${def.up.job}|${def.up.instance}`;
  // An optional signal comes from another source: missing is unknown, not down.
  if (def.up.optional && !(key in up)) return 'DEGRADED';
  if (up[key] !== true) return 'OFFLINE';
  if (def.garageInstance && up[`garage|${def.garageInstance}`] !== true) {
    return 'DEGRADED';
  }
  return 'HEALTHY';
}

// A device without metrics of its own is as healthy as the best-off machine
// attached to it: any machine reachable means the device is passing traffic.
function inferredHealth(attached) {
  if (attached.includes('HEALTHY')) return 'HEALTHY';
  return attached.includes('DEGRADED') ? 'DEGRADED' : 'OFFLINE';
}

// A device judged by the ports cabled to it: one port with carrier means it is
// passing traffic, none means it is not, and no port data is unknown.
function portsHealth(portRefs, ports) {
  const known = portRefs
    .map((ref) => ports?.[`${ref.instance}|${ref.device}`])
    .filter((port) => port != null);
  if (known.length === 0) return 'DEGRADED';
  return known.some((port) => port.carrier) ? 'HEALTHY' : 'OFFLINE';
}

function serviceStatus(svc, def, health, up, mimirAnswered, headscale) {
  if (health === 'OFFLINE') return 'OFFLINE';
  if (svc.signal) return signalStatus(svc.signal, headscale);
  if (svc.name === GARAGE_SERVICE && def.garageInstance && mimirAnswered) {
    return up[`garage|${def.garageInstance}`] === true ? 'HEALTHY' : 'OFFLINE';
  }
  return mimirAnswered ? 'HEALTHY' : 'DEGRADED';
}

const GIB = 1073741824;

// Health of the local-volume layer follows its per-node plugins: without one,
// volumes on that server cannot be attached. All ready is HEALTHY, some is
// DEGRADED, none is OFFLINE; no answer from Prometheus is DEGRADED.
function buildLvmNode(lvm) {
  let health = 'DEGRADED';
  if (lvm) {
    if (lvm.pluginsReady <= 0) health = 'OFFLINE';
    else if (lvm.pluginsReady >= lvm.pluginsDesired) health = 'HEALTHY';
  }

  const services = [];
  if (lvm) {
    if (lvm.volumes != null) {
      services.push({ name: `${lvm.volumes} volumes`, status: health, port: null });
    }
    services.push({
      name: `${lvm.pluginsReady}/${lvm.pluginsDesired} node plugins`,
      status: health,
      port: null,
    });
  }
  services.push({ name: 'Not replicated', status: health, port: null });

  const hasUsage = lvm?.usedBytes != null && lvm?.provisionedBytes != null;

  return {
    id: LVM_NODE.id,
    hostname: LVM_NODE.displayName,
    displayName: LVM_NODE.displayName,
    type: LVM_NODE.type,
    zone: LVM_NODE.zone,
    wireguardIp: null,
    health,
    services,
    // Used vs provisioned space across all LVM local volumes.
    metrics: hasUsage
      ? {
          cpuPercent: null,
          memoryPercent: null,
          memoryUsedMb: null,
          memoryTotalMb: null,
          storageUsedGb: round(lvm.usedBytes / GIB, 1),
          storageTotalGb: round(lvm.provisionedBytes / GIB, 1),
          uptime: null,
        }
      : null,
  };
}

// Health of the volume layer follows its io-engines: all ready is HEALTHY,
// some ready is DEGRADED (volumes run on fewer replicas), none is OFFLINE.
// No answer from Prometheus is unknown, shown as DEGRADED.
function buildMayastorNode(storage) {
  let health = 'DEGRADED';
  if (storage) {
    if (storage.enginesReady <= 0) health = 'OFFLINE';
    else if (storage.enginesReady >= storage.enginesDesired) health = 'HEALTHY';
  }

  const services = [];
  if (storage) {
    if (storage.volumes != null) {
      services.push({ name: `${storage.volumes} volumes`, status: health, port: null });
    }
    services.push({
      name: `${storage.enginesReady}/${storage.enginesDesired} io-engines`,
      status: health,
      port: null,
    });
  }
  services.push({ name: 'NVMe-oF', status: health, port: null });

  const hasUsage = storage?.usedBytes != null && storage?.provisionedBytes != null;

  return {
    id: MAYASTOR_NODE.id,
    hostname: MAYASTOR_NODE.displayName,
    displayName: MAYASTOR_NODE.displayName,
    type: MAYASTOR_NODE.type,
    zone: MAYASTOR_NODE.zone,
    wireguardIp: null,
    health,
    services,
    // Used vs provisioned space across all Mayastor volumes.
    metrics: hasUsage
      ? {
          cpuPercent: null,
          memoryPercent: null,
          memoryUsedMb: null,
          memoryTotalMb: null,
          storageUsedGb: round(storage.usedBytes / GIB, 1),
          storageTotalGb: round(storage.provisionedBytes / GIB, 1),
          uptime: null,
        }
      : null,
  };
}

// Live state of services that name a `signal`. The tailnet keeps working
// without its coordination server (sessions and keys persist), so an
// unreachable public endpoint alone is DEGRADED and only a stopped primary is
// OFFLINE. No answer from Prometheus is unknown, shown as DEGRADED.
function signalStatus(signal, headscale) {
  if (signal === 'headscale') {
    if (!headscale || headscale.primaryUp == null) return 'DEGRADED';
    if (headscale.primaryUp === false) return 'OFFLINE';
    return headscale.publicUp === false ? 'DEGRADED' : 'HEALTHY';
  }
  if (signal === 'headscaleStandby') {
    if (headscale?.standbySynced == null) return 'DEGRADED';
    return headscale.standbySynced ? 'HEALTHY' : 'OFFLINE';
  }
  return null;
}

const HOUR = 3600;
const DAY = 86400;

// One entry per job that writes to B2: a job is healthy while its last
// success is within its schedule plus slack.
const OFFSITE_JOBS = [
  { key: 'veleroAgeS', name: 'Velero Weekly', maxAgeS: 8 * DAY },
  // Daily since 2026-11-26 (was weekly): database dumps, Neon storage and the
  // laptop's repositories, copied from Garage.
  { key: 'garageSyncAgeS', name: 'Garage Sync Daily', maxAgeS: 2 * DAY },
  { key: 'postgresAgeS', name: 'Postgres Hourly', maxAgeS: 3 * HOUR },
];

// B2 itself is not probed. The node is HEALTHY when every job is fresh and
// DEGRADED when any is overdue or unknown: stale backups, not an outage.
// A daily job is overdue once it has missed a run and a bit.
const HOST_BACKUP_MAX_AGE_S = 2 * DAY;

function buildOffsiteNode(offsite) {
  const jobStatus = (age, maxAgeS) => {
    if (age == null) return 'DEGRADED';
    return age <= maxAgeS ? 'HEALTHY' : 'OFFLINE';
  };
  const services = OFFSITE_JOBS.map((job) => ({
    name: job.name,
    status: jobStatus(offsite?.[job.key], job.maxAgeS),
    port: null,
  }));

  // One more per machine that sends its own backup, named as the page names
  // the machine (hostnames stay internal).
  OFFSITE_HOSTS.forEach(({ id, metric, host }) => {
    const def = NODE_DEFINITIONS.find((n) => n.id === id);
    const ages = metric === 'nas' ? offsite?.nasAgeS : offsite?.hostAgeS;
    services.push({
      name: `${def.displayName} Daily`,
      status: jobStatus(ages?.[host ?? def.hostname], HOST_BACKUP_MAX_AGE_S),
      port: null,
    });
  });

  return {
    id: OFFSITE_NODE.id,
    hostname: OFFSITE_NODE.displayName,
    displayName: OFFSITE_NODE.displayName,
    type: OFFSITE_NODE.type,
    zone: OFFSITE_NODE.zone,
    wireguardIp: null,
    health: services.every((svc) => svc.status === 'HEALTHY') ? 'HEALTHY' : 'DEGRADED',
    services,
    metrics: null,
  };
}

// A WireGuard peer re-handshakes at least every ~2 minutes while traffic
// flows; allow some slack before calling the tunnel down.
const WG_HANDSHAKE_MAX_AGE_S = 300;

// Traffic on a link right now, in bits per second, or null when nothing
// measures it. Null is "not measured", never "idle": an idle link reports 0.
//   - a link that names its port: bytes through that port, both directions
//   - NVMe-oF / local volume: the node's disk I/O to those volumes, read + write
//   - WireGuard: bytes exchanged with that peer
// Tailscale, Garage, NFS, iSCSI, Loki and unnamed Ethernet links have no
// per-link counter and stay null.
const STORAGE_TRAFFIC_KEY = { NVME_OF: 'nvmeof', LOCAL_VOLUME: 'lvm' };

function measuredTraffic(link, port, hostnameById, overlay) {
  const known = (value) => (Number.isFinite(value) ? value : null);
  if (link.port) return known(port?.trafficBps);
  const storageKey = STORAGE_TRAFFIC_KEY[link.type];
  if (storageKey) {
    return known(overlay?.storageTraffic?.[storageKey]?.[hostnameById[link.source]]);
  }
  if (link.wgPeer) return known(overlay?.wireguardTraffic?.[link.wgPeer]);
  return null;
}

export function buildTopology(metrics, up, storage = null, ports = {}, overlay = {}) {
  const mimirAnswered = Object.keys(up ?? {}).length > 0;
  const healthById = {};

  // Machines first: a switch's health is inferred from the machines on it,
  // or from the ports cabled to it.
  NODE_DEFINITIONS.filter((def) => def.up).forEach((def) => {
    healthById[def.id] = nodeHealth(def, up ?? {}, mimirAnswered);
  });
  NODE_DEFINITIONS.filter((def) => def.inferFromPorts).forEach((def) => {
    healthById[def.id] = portsHealth(def.inferFromPorts, ports);
  });
  NODE_DEFINITIONS.filter((def) => def.inferFrom).forEach((def) => {
    healthById[def.id] = inferredHealth(def.inferFrom.map((id) => healthById[id]));
  });

  const nodes = NODE_DEFINITIONS.map((def) => {
    const health = healthById[def.id];

    return {
      id: def.id,
      hostname: def.displayName, // Sanitized: never expose real hostname
      displayName: def.displayName,
      type: def.type,
      zone: def.zone,
      wireguardIp: null, // Addresses are not published
      health,
      services: def.services.map((svc) => ({
        name: svc.name,
        status: serviceStatus(svc, def, health, up ?? {}, mimirAnswered, overlay?.headscale),
        port: svc.port,
      })),
      metrics: buildNodeMetrics(metrics, def.metricsInstance),
    };
  });

  const lvm = buildLvmNode(overlay?.lvm ?? null);
  healthById[lvm.id] = lvm.health;

  const mayastor = buildMayastorNode(storage);
  healthById[mayastor.id] = mayastor.health;
  nodes.push(mayastor);
  nodes.push(lvm);

  const offsite = buildOffsiteNode(overlay?.offsite ?? null);
  healthById[offsite.id] = offsite.health;
  nodes.push(offsite);

  const hostnameById = Object.fromEntries(NODE_DEFINITIONS.map((n) => [n.id, n.hostname]));
  const uplinks = overlay?.uplinkSpeeds ?? {};
  const wiredLinkCount = {};
  LINK_DEFINITIONS.filter((l) => l.type === 'ETHERNET').forEach((l) => {
    wiredLinkCount[l.source] = (wiredLinkCount[l.source] ?? 0) + 1;
  });

  const handshakes = overlay?.wireguardHandshakes ?? {};
  const haveHandshakes = Object.keys(handshakes).length > 0;

  // A link is only as healthy as its less healthy end. A link that names the
  // port carrying it is also down when that port has lost carrier, and reports
  // the port's negotiated speed. A WireGuard link is also down when its peer
  // has not completed a handshake recently.
  const links = LINK_DEFINITIONS.map((link) => {
    const port = link.port ? ports?.[`${link.port.instance}|${link.port.device}`] : null;
    const ends = worst(healthById[link.source], healthById[link.target]);
    const age = link.wgPeer ? handshakes[link.wgPeer] : null;
    const tunnelDown =
      link.wgPeer && haveHandshakes && (age == null || age > WG_HANDSHAKE_MAX_AGE_S);
    const linkUp = (!port || port.carrier) && !tunnelDown;

    return {
      source: link.source,
      target: link.target,
      type: link.type,
      status: linkUp ? ends : 'OFFLINE',
      throughputBps: linkUp ? measuredTraffic(link, port, hostnameById, overlay) : null,
      bandwidthBps:
        (port?.carrier ? port.speedBps : null) ??
        link.speedBps ??
        (link.type === 'ETHERNET' && wiredLinkCount[link.source] === 1
          ? (uplinks[hostnameById[link.source]] ?? null)
          : null),
      latencyMs: null,
      metadata:
        age != null || link.via
          ? {
              lastHandshake: age != null ? new Date(Date.now() - age * 1000).toISOString() : null,
              via: link.via ?? null,
            }
          : null,
    };
  });

  return { nodes, links, lastUpdated: new Date().toISOString() };
}

// Adds each port's measured rate to its status entry. A port with a rate but
// no status entry is left out: without carrier it cannot be judged up.
function withTraffic(ports, traffic) {
  const out = {};
  for (const [key, entry] of Object.entries(ports)) {
    out[key] = key in traffic ? { ...entry, trafficBps: traffic[key] } : entry;
  }
  return out;
}

async function fetchNetworkTopology() {
  const [
    metrics,
    mimirUp,
    storage,
    routerPorts,
    headscale,
    wireguardHandshakes,
    offsite,
    uplinkSpeeds,
    lvm,
    hostPorts,
    probes,
    routerPortTraffic,
    hostPortTraffic,
    storageTraffic,
    wireguardTraffic,
  ] = await Promise.all([
    fetchNodeMetrics().catch(() => null),
    fetchUpStatus().catch(() => ({})),
    fetchMayastorStatus().catch(() => null),
    fetchPortStatus().catch(() => ({})),
    fetchHeadscaleStatus().catch(() => null),
    fetchWireguardHandshakes().catch(() => ({})),
    fetchOffsiteBackupStatus().catch(() => null),
    fetchUplinkSpeeds().catch(() => ({})),
    fetchLvmStatus().catch(() => null),
    fetchHostPortStatus().catch(() => ({})),
    fetchProbeStatus().catch(() => ({})),
    fetchPortTraffic().catch(() => ({})),
    fetchHostPortTraffic().catch(() => ({})),
    fetchStorageTraffic().catch(() => null),
    fetchWireguardTraffic().catch(() => ({})),
  ]);
  // Probe results join the liveness map only when Mimir answered: an empty
  // map is how "Mimir could not be queried" is recognised downstream.
  const up = Object.keys(mimirUp).length > 0 ? { ...mimirUp, ...probes } : mimirUp;
  const ports = withTraffic(
    { ...routerPorts, ...hostPorts },
    { ...routerPortTraffic, ...hostPortTraffic },
  );
  return buildTopology(metrics, up, storage, ports, {
    headscale,
    wireguardHandshakes,
    storageTraffic,
    wireguardTraffic,
    offsite,
    uplinkSpeeds,
    lvm,
  });
}

export const networkTopologyResolvers = {
  Query: {
    networkTopology: () => fetchNetworkTopology(),
  },

  Subscription: {
    networkTopologyStream: {
      subscribe: async function* () {
        while (true) {
          try {
            const topology = await fetchNetworkTopology();
            yield { networkTopologyStream: topology };
          } catch (err) {
            console.error('[Subscription] networkTopology error:', err.message);
          }
          await sleep(TOPOLOGY_INTERVAL_MS);
        }
      },
    },
  },
};
