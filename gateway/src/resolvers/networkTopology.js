import { fetchNodeMetrics, formatUptime } from '../lib/mimirClient.js';
import { sshRun, parseWgDump, parseIscsiSessions, parseNfsExports } from '../lib/sshClient.js';
import { fetchGarageStatus } from '../lib/garageAdminClient.js';
import { fetchCrowdSecTopology } from '../lib/crowdsecClient.js';
import {
  NODE_DEFINITIONS,
  WIREGUARD_PEERS,
  STATIC_LINKS,
} from '../config/networkNodes.js';

const TOPOLOGY_INTERVAL_MS = parseInt(
  process.env.NETWORK_TOPOLOGY_INTERVAL_MS || '30000',
  10,
);

const WG_SSH_TARGETS = [
  { nodeId: 'control-plane', host: '10.0.0.1' },
  { nodeId: 'worker', host: '10.0.0.3' },
  { nodeId: 'gpu-node', host: '10.0.0.2' },
  { nodeId: 'asustor', host: '10.0.0.4' },
  { nodeId: 'synology', host: '10.0.0.5' },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function collectWireGuardData() {
  const results = {};
  await Promise.all(
    WG_SSH_TARGETS.map(async ({ nodeId, host }) => {
      try {
        const output = await sshRun(host, 'wg show wg0 dump');
        results[nodeId] = parseWgDump(output);
      } catch (err) {
        console.error(`[netvis] WG SSH failed for ${nodeId}:`, err.message);
        results[nodeId] = null;
      }
    }),
  );
  return results;
}

async function collectIscsiData() {
  try {
    const output = await sshRun('10.0.0.3', 'iscsiadm -m session -P3');
    return parseIscsiSessions(output);
  } catch (err) {
    console.error('[netvis] iSCSI SSH failed:', err.message);
    return null;
  }
}

async function collectNfsData() {
  try {
    const output = await sshRun('10.0.0.4', 'showmount -e');
    return parseNfsExports(output);
  } catch (err) {
    console.error('[netvis] NFS SSH failed:', err.message);
    return null;
  }
}

function buildWireGuardLinks(wgData) {
  const links = [];

  for (const peer of WIREGUARD_PEERS) {
    const sourcePeers = wgData[peer.source];
    const targetNode = NODE_DEFINITIONS.find((n) => n.id === peer.target);

    let handshake = null;
    let rxBytes = 0;
    let txBytes = 0;

    if (sourcePeers && targetNode?.wireguardIp) {
      const peerData = sourcePeers.find(
        (p) => p.allowedIps?.includes(targetNode.wireguardIp),
      );
      if (peerData) {
        handshake = peerData.lastHandshake;
        rxBytes = peerData.transferRx;
        txBytes = peerData.transferTx;
      }
    }

    const now = Math.floor(Date.now() / 1000);
    const stale = !handshake || now - handshake > 180;

    links.push({
      source: peer.source,
      target: peer.target,
      type: 'WIREGUARD',
      status: stale ? 'DEGRADED' : 'HEALTHY',
      bandwidthBps: null,
      latencyMs: null,
      metadata: {
        lastHandshake: handshake
          ? new Date(handshake * 1000).toISOString()
          : null,
        transferRxBytes: rxBytes,
        transferTxBytes: txBytes,
        targetIqn: null,
        partitionsShared: null,
        exportPath: null,
        mountPoint: null,
      },
    });
  }

  return links;
}

function buildStaticLinks(iscsiData, nfsData) {
  return STATIC_LINKS.map((link) => {
    const result = {
      source: link.source,
      target: link.target,
      type: link.type,
      status: 'HEALTHY',
      bandwidthBps: null,
      latencyMs: null,
      metadata: {
        lastHandshake: null,
        transferRxBytes: null,
        transferTxBytes: null,
        targetIqn: null,
        partitionsShared: null,
        exportPath: null,
        mountPoint: null,
      },
    };

    if (link.type === 'ISCSI' && iscsiData) {
      const session = iscsiData[0];
      if (session) {
        result.metadata.targetIqn = session.targetIqn
          ? session.targetIqn.substring(0, 30) + '...'
          : null;
      }
      result.status = iscsiData.length > 0 ? 'HEALTHY' : 'DEGRADED';
    }

    if (link.type === 'NFS' && nfsData) {
      const exp = nfsData.find((e) => e.exportPath?.includes('k8s-share'));
      if (exp) {
        result.metadata.exportPath = exp.exportPath;
      }
    }

    return result;
  });
}

function determineNodeHealth(nodeId, metricsAvailable, wgData) {
  if (!metricsAvailable && !wgData[nodeId]) return 'OFFLINE';
  if (!metricsAvailable) return 'DEGRADED';
  return 'HEALTHY';
}

async function fetchNetworkTopology() {
  const [metrics, wgData, iscsiData, nfsData, garageStatus] =
    await Promise.all([
      fetchNodeMetrics().catch(() => null),
      collectWireGuardData(),
      collectIscsiData(),
      collectNfsData(),
      fetchGarageStatus().catch(() => null),
    ]);

  const nodes = NODE_DEFINITIONS.map((def) => {
    const wgIp = def.wireguardIp;
    const nodeMetrics =
      metrics && wgIp
        ? {
            cpuPercent: metrics.cpu[wgIp]
              ? Math.round(metrics.cpu[wgIp] * 10000) / 100
              : null,
            memoryPercent:
              metrics.memUsed[wgIp] && metrics.memTotal[wgIp]
                ? Math.round(
                    (metrics.memUsed[wgIp] / metrics.memTotal[wgIp]) * 10000,
                  ) / 100
                : null,
            memoryUsedMb: metrics.memUsed[wgIp]
              ? Math.round(metrics.memUsed[wgIp] / 1048576)
              : null,
            memoryTotalMb: metrics.memTotal[wgIp]
              ? Math.round(metrics.memTotal[wgIp] / 1048576)
              : null,
            storageUsedGb: metrics.storageUsed[wgIp]
              ? Math.round((metrics.storageUsed[wgIp] / 1073741824) * 10) / 10
              : null,
            storageTotalGb: metrics.storageTotal[wgIp]
              ? Math.round((metrics.storageTotal[wgIp] / 1073741824) * 10) / 10
              : null,
            uptime: formatUptime(metrics.uptime[wgIp]),
          }
        : null;

    const metricsAvailable = nodeMetrics?.cpuPercent != null;

    const services = def.services.map((svc) => ({
      name: svc.name,
      status: 'HEALTHY',
      port: svc.port,
    }));

    // Enrich Garage service badge with live status
    if (garageStatus) {
      const garageSvc = services.find((s) => s.name === 'Garage S3');
      if (garageSvc) {
        const garageNode = garageStatus.nodes.find(
          (n) =>
            n.hostname === def.hostname ||
            n.hostname?.toLowerCase().includes(def.id),
        );
        if (garageNode) {
          garageSvc.status = garageNode.isUp ? 'HEALTHY' : 'OFFLINE';
        }
      }
    }

    return {
      id: def.id,
      hostname: def.displayName, // Sanitized: never expose real hostname
      displayName: def.displayName,
      type: def.type,
      zone: def.zone,
      wireguardIp: def.wireguardIp,
      health: determineNodeHealth(def.id, metricsAvailable, wgData),
      services,
      metrics: nodeMetrics,
    };
  });

  const wgLinks = buildWireGuardLinks(wgData);
  const staticLinks = buildStaticLinks(iscsiData, nfsData);

  return {
    nodes,
    links: [...wgLinks, ...staticLinks],
    lastUpdated: new Date().toISOString(),
  };
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
