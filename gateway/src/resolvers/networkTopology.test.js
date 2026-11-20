import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTopology } from './networkTopology.js';
import {
  NODE_DEFINITIONS,
  LINK_DEFINITIONS,
  MAYASTOR_NODE,
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
    up[`${def.up.job}|${def.up.instance}`] = true;
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

const byId = (topology, id) => topology.nodes.find((n) => n.id === id);

test('every link references a defined node', () => {
  const ids = new Set([...NODE_DEFINITIONS.map((n) => n.id), MAYASTOR_NODE.id]);
  for (const link of LINK_DEFINITIONS) {
    assert.ok(ids.has(link.source), `unknown source ${link.source}`);
    assert.ok(ids.has(link.target), `unknown target ${link.target}`);
  }
});

test('all targets up: every node and link is healthy', () => {
  const topology = buildTopology(EMPTY_METRICS, allUp(), STORAGE_OK);
  assert.equal(topology.nodes.length, NODE_DEFINITIONS.length + 1);
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
