import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTopology } from './networkTopology.js';
import {
  NODE_DEFINITIONS,
  LINK_DEFINITIONS,
  MAYASTOR_NODE,
  OFFSITE_NODE,
} from '../config/networkNodes.js';

const EMPTY_METRICS = {
  cpu: {},
  memUsed: {},
  memTotal: {},
  storageUsed: {},
  storageTotal: {},
  uptime: {},
};

function allUp() {
  const up = {};
  for (const def of NODE_DEFINITIONS) {
    if (def.up) up[`${def.up.job}|${def.up.instance}`] = true;
    if (def.garageInstance) up[`garage|${def.garageInstance}`] = true;
  }
  return up;
}

const STORAGE_OK = {
  volumes: 30,
  provisionedBytes: 240 * 1024 ** 3,
  usedBytes: 39.5 * 1024 ** 3,
  enginesReady: 3,
  enginesDesired: 3,
};

const OVERLAY_OK = {
  headscale: { primaryUp: true, publicUp: true, standbySynced: true },
  offsite: { veleroAgeS: 5 * 86400, garageSyncAgeS: 5 * 86400, postgresAgeS: 900 },
  wireguardHandshakes: { '10.0.0.9': 40, '10.0.0.4': 60, '10.0.0.5': 90, '10.0.0.6': 120 },
};

const byId = (topology, id) => topology.nodes.find((n) => n.id === id);

test('every link references a defined node', () => {
  const ids = new Set([
    ...NODE_DEFINITIONS.map((n) => n.id),
    MAYASTOR_NODE.id,
    OFFSITE_NODE.id,
  ]);
  for (const link of LINK_DEFINITIONS) {
    assert.ok(ids.has(link.source), `unknown source ${link.source}`);
    assert.ok(ids.has(link.target), `unknown target ${link.target}`);
  }
});

test('all targets up: every node and link is healthy', () => {
  const topology = buildTopology(EMPTY_METRICS, allUp(), STORAGE_OK, {}, OVERLAY_OK);
  assert.equal(topology.nodes.length, NODE_DEFINITIONS.length + 2);
  assert.ok(topology.nodes.every((n) => n.health === 'HEALTHY'));
  assert.ok(topology.links.every((l) => l.status === 'HEALTHY'));
});

test('a node whose scrape target is down is offline, and so are its links', () => {
  const up = allUp();
  up['integrations/unix|m720q'] = false;
  const topology = buildTopology(EMPTY_METRICS, up);

  assert.equal(byId(topology, 'cp-3').health, 'OFFLINE');
  assert.ok(byId(topology, 'cp-3').services.every((s) => s.status === 'OFFLINE'));
  const touching = topology.links.filter((l) => l.source === 'cp-3' || l.target === 'cp-3');
  assert.ok(touching.length > 0);
  assert.ok(touching.every((l) => l.status === 'OFFLINE'));
  assert.equal(byId(topology, 'cp-1').health, 'HEALTHY');
});

test('a reachable node with its Garage member down is degraded', () => {
  const up = allUp();
  up['garage|elitedesk'] = false;
  const node = byId(buildTopology(EMPTY_METRICS, up), 'cp-2');

  assert.equal(node.health, 'DEGRADED');
  assert.equal(node.services.find((s) => s.name === 'Garage S3').status, 'OFFLINE');
  assert.equal(node.services.find((s) => s.name === 'K3s Server').status, 'HEALTHY');
});

test('when Mimir returns nothing, nodes are degraded rather than offline', () => {
  const topology = buildTopology(EMPTY_METRICS, {});
  assert.ok(topology.nodes.every((n) => n.health === 'DEGRADED'));
});

test('metrics are read by instance name and an idle CPU is 0, not null', () => {
  const metrics = {
    ...EMPTY_METRICS,
    cpu: { m920s: 0 },
    memUsed: { m920s: 8 * 1024 ** 3 },
    memTotal: { m920s: 32 * 1024 ** 3 },
  };
  const node = byId(buildTopology(metrics, allUp(), STORAGE_OK), 'cp-1');

  assert.equal(node.metrics.cpuPercent, 0);
  assert.equal(node.metrics.memoryPercent, 25);
  assert.equal(node.metrics.memoryTotalMb, 32768);
  assert.equal(byId(buildTopology(metrics, allUp(), STORAGE_OK), 'synology').metrics, null);
});

test('real hostnames and addresses are never published', () => {
  const json = JSON.stringify(buildTopology(EMPTY_METRICS, allUp(), STORAGE_OK));
  for (const def of NODE_DEFINITIONS) {
    if (def.hostname !== def.displayName) {
      assert.ok(!json.includes(def.hostname), `leaked ${def.hostname}`);
    }
  }
  assert.ok(!/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(json), 'leaked an IP address');
});

test('Mayastor reports volume count, io-engines and used vs provisioned space', () => {
  const node = byId(buildTopology(EMPTY_METRICS, allUp(), STORAGE_OK), 'mayastor');

  assert.equal(node.health, 'HEALTHY');
  assert.equal(node.zone, 'STORAGE');
  assert.deepEqual(
    node.services.map((s) => s.name),
    ['30 volumes', '3/3 io-engines', 'NVMe-oF'],
  );
  assert.equal(node.metrics.storageUsedGb, 39.5);
  assert.equal(node.metrics.storageTotalGb, 240);
  assert.equal(node.metrics.cpuPercent, null);
});

test('Mayastor is degraded with an io-engine down, offline with none, degraded when unknown', () => {
  const health = (storage) =>
    byId(buildTopology(EMPTY_METRICS, allUp(), storage), 'mayastor').health;

  assert.equal(health({ ...STORAGE_OK, enginesReady: 2 }), 'DEGRADED');
  assert.equal(health({ ...STORAGE_OK, enginesReady: 0 }), 'OFFLINE');
  assert.equal(health(null), 'DEGRADED');
});

test('Mayastor links cover every node that mounts volumes and follow node health', () => {
  const up = allUp();
  up['integrations/unix|m720q'] = false;
  const links = buildTopology(EMPTY_METRICS, up, STORAGE_OK).links.filter(
    (l) => l.target === 'mayastor',
  );

  assert.deepEqual(
    links.map((l) => l.source).sort(),
    ['cp-1', 'cp-2', 'cp-3', 'gpu-1', 'gpu-2'],
  );
  assert.equal(links.find((l) => l.source === 'cp-3').status, 'OFFLINE');
  assert.equal(links.find((l) => l.source === 'gpu-1').status, 'HEALTHY');
  assert.equal(links.find((l) => l.source === 'cp-1').status, 'HEALTHY');
});

test('mesh backhaul follows its uplink port: speed when up, offline when carrier is lost', () => {
  const backhaul = (ports) =>
    buildTopology(EMPTY_METRICS, allUp(), STORAGE_OK, ports).links.find(
      (l) => l.type === 'BACKHAUL',
    );

  const up = backhaul({ 'ax86u-pro|eth5': { carrier: true, speedBps: 2.5e9 } });
  assert.equal(up.status, 'HEALTHY');
  assert.equal(up.bandwidthBps, 2.5e9);

  const down = backhaul({ 'ax86u-pro|eth5': { carrier: false, speedBps: null } });
  assert.equal(down.status, 'OFFLINE');
  assert.equal(down.bandwidthBps, null);

  // No port data: fall back to the health of the two routers.
  const unknown = backhaul({});
  assert.equal(unknown.status, 'HEALTHY');
  assert.equal(unknown.bandwidthBps, null);
});

test('the tailnet is drawn as links from the Headscale host to every other member, with no node of its own', () => {
  const { nodes, links } = buildTopology(EMPTY_METRICS, allUp(), STORAGE_OK, {}, OVERLAY_OK);
  const tailnet = links.filter((l) => l.type === 'TAILSCALE');

  assert.ok(!nodes.some((n) => /headscale|tailnet/i.test(n.id)));
  assert.ok(byId({ nodes }, 'gpu-1').services.some((s) => s.name === 'Headscale'));
  assert.ok(tailnet.every((l) => l.source === 'gpu-1'));
  assert.deepEqual(
    tailnet.map((l) => l.target).sort(),
    NODE_DEFINITIONS.filter((n) => n.type !== 'SWITCH')
      .map((n) => n.id)
      .filter((id) => id !== 'gpu-1')
      .sort(),
  );
  assert.ok(
    !links.some((l) => l.type === 'WIREGUARD' && ['cp-1', 'cp-2', 'cp-3'].includes(l.target)),
  );
});

test('Headscale is a service on its host: primary down is offline, public endpoint down or unknown is degraded', () => {
  const service = (headscale, id, name) =>
    byId(buildTopology(EMPTY_METRICS, allUp(), STORAGE_OK, {}, { headscale }), id).services.find(
      (s) => s.name === name,
    ).status;
  const primary = (h) => service(h, 'gpu-1', 'Headscale');

  assert.equal(primary({ primaryUp: true, publicUp: true, standbySynced: true }), 'HEALTHY');
  assert.equal(primary({ primaryUp: true, publicUp: false, standbySynced: true }), 'DEGRADED');
  assert.equal(primary({ primaryUp: false, publicUp: false, standbySynced: true }), 'OFFLINE');
  assert.equal(primary(null), 'DEGRADED');

  const standby = (h) => service(h, 'cp-1', 'Headscale Standby');
  assert.equal(standby({ primaryUp: true, publicUp: true, standbySynced: true }), 'HEALTHY');
  assert.equal(standby({ primaryUp: true, publicUp: true, standbySynced: false }), 'OFFLINE');
  // The host's own health is unaffected by the service.
  assert.equal(
    byId(buildTopology(EMPTY_METRICS, allUp(), STORAGE_OK, {}, { headscale: null }), 'gpu-1').health,
    'HEALTHY',
  );
});

test('a WireGuard link is offline when its peer handshake is stale or missing', () => {
  const wg = (wireguardHandshakes) =>
    buildTopology(EMPTY_METRICS, allUp(), STORAGE_OK, {}, { wireguardHandshakes }).links.find(
      (l) => l.type === 'WIREGUARD' && l.target === 'gpu-1',
    );

  assert.equal(wg(OVERLAY_OK.wireguardHandshakes).status, 'HEALTHY');
  assert.ok(wg(OVERLAY_OK.wireguardHandshakes).metadata.lastHandshake);
  assert.equal(wg({ '10.0.0.9': 900 }).status, 'OFFLINE');
  assert.equal(wg({ '10.0.0.4': 30 }).status, 'OFFLINE');
  // No handshake data at all: fall back to the health of the two ends.
  assert.equal(wg({}).status, 'HEALTHY');
});

test('mesh addresses used for lookups are never published', () => {
  const out = JSON.stringify(buildTopology(EMPTY_METRICS, allUp(), STORAGE_OK, {}, OVERLAY_OK));
  assert.ok(!/\b10\.0\.0\.\d+\b/.test(out));
  assert.ok(!out.includes('wgPeer'));
});

test('off-site backup is degraded when a job is overdue or unknown, and names the stale job', () => {
  const node = (offsite) =>
    byId(buildTopology(EMPTY_METRICS, allUp(), STORAGE_OK, {}, { offsite }), 'offsite-backup');
  const status = (n, name) => n.services.find((s) => s.name === name).status;

  assert.equal(node(OVERLAY_OK.offsite).health, 'HEALTHY');

  const stale = node({ ...OVERLAY_OK.offsite, postgresAgeS: 5 * 3600 });
  assert.equal(stale.health, 'DEGRADED');
  assert.equal(status(stale, 'Postgres Hourly'), 'OFFLINE');
  assert.equal(status(stale, 'Velero Weekly'), 'HEALTHY');

  assert.equal(node(null).health, 'DEGRADED');
  assert.equal(node({ ...OVERLAY_OK.offsite, veleroAgeS: null }).health, 'DEGRADED');
});

test('wired LAN: machines link to their switch, segments reach the router over MoCA', () => {
  const overlay = { ...OVERLAY_OK, uplinkSpeeds: { elitedesk: 1e10, m920s: 5e9 } };
  const { links } = buildTopology(EMPTY_METRICS, allUp(), STORAGE_OK, {}, overlay);
  const wired = (source) =>
    links.filter((l) => l.type === 'ETHERNET' && l.source === source).map((l) => l.target).sort();

  assert.deepEqual(wired('cp-3'), ['switch-a']);
  assert.deepEqual(wired('gpu-workstation'), ['switch-a']);
  assert.deepEqual(wired('cp-1'), ['switch-b1']);
  assert.deepEqual(wired('asustor'), ['switch-b1', 'switch-b2']);
  assert.deepEqual(wired('synology'), ['switch-b2']);
  assert.deepEqual(wired('cp-2'), ['primary-router', 'switch-c']);

  const moca = links.filter((l) => l.type === 'MOCA');
  assert.deepEqual(moca.map((l) => l.source).sort(), ['switch-a', 'switch-b1']);
  assert.ok(moca.every((l) => l.target === 'primary-router'));

  const backhaul = links.find((l) => l.type === 'BACKHAUL');
  assert.deepEqual([backhaul.source, backhaul.target], ['mesh-node', 'switch-a']);

  // Live speed only where a machine has a single wired link.
  const speed = (source) => links.find((l) => l.type === 'ETHERNET' && l.source === source).bandwidthBps;
  assert.equal(speed('cp-1'), 5e9);
  assert.equal(speed('cp-2'), null);
});

test('a switch has no metrics: it is up while any machine on it is reachable, and is not a tailnet member', () => {
  const health = (downHosts) => {
    const up = allUp();
    downHosts.forEach((h) => { up[`integrations/unix|${h}`] = false; });
    return byId(buildTopology(EMPTY_METRICS, up, STORAGE_OK, {}, OVERLAY_OK), 'switch-a').health;
  };

  assert.equal(health([]), 'HEALTHY');
  assert.equal(health(['m720q']), 'HEALTHY');
  // Mesh node is scraped under another job, so it is still up here.
  assert.equal(health(['m720q', 'marmoset']), 'HEALTHY');

  const up = allUp();
  up['integrations/unix|m720q'] = false;
  up['integrations/unix|marmoset'] = false;
  up['router-node|ax86u-pro'] = false;
  const topology = buildTopology(EMPTY_METRICS, up, STORAGE_OK, {}, OVERLAY_OK);
  assert.equal(byId(topology, 'switch-a').health, 'OFFLINE');
  assert.ok(!topology.links.some((l) => l.type === 'TAILSCALE' && l.target.startsWith('switch')));
  assert.equal(byId(buildTopology(EMPTY_METRICS, {}, STORAGE_OK), 'switch-a').health, 'DEGRADED');
});
