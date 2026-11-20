import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTopology } from './networkTopology.js';
import { NODE_DEFINITIONS, LINK_DEFINITIONS } from '../config/networkNodes.js';

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

const byId = (topology, id) => topology.nodes.find((n) => n.id === id);

test('every link references a defined node', () => {
  const ids = new Set(NODE_DEFINITIONS.map((n) => n.id));
  for (const link of LINK_DEFINITIONS) {
    assert.ok(ids.has(link.source), `unknown source ${link.source}`);
    assert.ok(ids.has(link.target), `unknown target ${link.target}`);
  }
});

test('all targets up: every node and link is healthy', () => {
  const topology = buildTopology(EMPTY_METRICS, allUp());
  assert.equal(topology.nodes.length, NODE_DEFINITIONS.length);
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
  const node = byId(buildTopology(metrics, allUp()), 'cp-1');

  assert.equal(node.metrics.cpuPercent, 0);
  assert.equal(node.metrics.memoryPercent, 25);
  assert.equal(node.metrics.memoryTotalMb, 32768);
  assert.equal(byId(buildTopology(metrics, allUp()), 'synology').metrics, null);
});

test('real hostnames and addresses are never published', () => {
  const json = JSON.stringify(buildTopology(EMPTY_METRICS, allUp()));
  for (const def of NODE_DEFINITIONS) {
    if (def.hostname !== def.displayName) {
      assert.ok(!json.includes(def.hostname), `leaked ${def.hostname}`);
    }
  }
  assert.ok(!/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(json), 'leaked an IP address');
});
