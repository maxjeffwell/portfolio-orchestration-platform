import { fetchNodeMetrics, fetchUpStatus, formatUptime } from '../lib/mimirClient.js';
import { fetchMayastorStatus } from '../lib/storageClient.js';
import {
  NODE_DEFINITIONS,
  LINK_DEFINITIONS,
  MAYASTOR_NODE,
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
  if (up[`${def.up.job}|${def.up.instance}`] !== true) return 'OFFLINE';
  if (def.garageInstance && up[`garage|${def.garageInstance}`] !== true) {
    return 'DEGRADED';
  }
  return 'HEALTHY';
}

function serviceStatus(svc, def, health, up, mimirAnswered) {
  if (health === 'OFFLINE') return 'OFFLINE';
  if (svc.name === GARAGE_SERVICE && def.garageInstance && mimirAnswered) {
    return up[`garage|${def.garageInstance}`] === true ? 'HEALTHY' : 'OFFLINE';
  }
  return mimirAnswered ? 'HEALTHY' : 'DEGRADED';
}

const GIB = 1073741824;

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

export function buildTopology(metrics, up, storage = null) {
  const mimirAnswered = Object.keys(up ?? {}).length > 0;
  const healthById = {};

  const nodes = NODE_DEFINITIONS.map((def) => {
    const health = nodeHealth(def, up ?? {}, mimirAnswered);
    healthById[def.id] = health;

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
        status: serviceStatus(svc, def, health, up ?? {}, mimirAnswered),
        port: svc.port,
      })),
      metrics: buildNodeMetrics(metrics, def.metricsInstance),
    };
  });

  const mayastor = buildMayastorNode(storage);
  healthById[mayastor.id] = mayastor.health;
  nodes.push(mayastor);

  // A link is only as healthy as its less healthy end.
  const links = LINK_DEFINITIONS.map((link) => ({
    source: link.source,
    target: link.target,
    type: link.type,
    status: worst(healthById[link.source], healthById[link.target]),
    bandwidthBps: null,
    latencyMs: null,
    metadata: null,
  }));

  return { nodes, links, lastUpdated: new Date().toISOString() };
}

async function fetchNetworkTopology() {
  const [metrics, up, storage] = await Promise.all([
    fetchNodeMetrics().catch(() => null),
    fetchUpStatus().catch(() => ({})),
    fetchMayastorStatus().catch(() => null),
  ]);
  return buildTopology(metrics, up, storage);
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
