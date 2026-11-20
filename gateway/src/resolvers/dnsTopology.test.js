import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDnsTopology } from './dnsTopology.js';
import { DNS_RESOLVERS, DNS_CLIENTS, DNS_NAME_KINDS, DNS_PATHS } from '../config/dns.js';

const OK = {
  corednsReady: 3,
  corednsWanted: 3,
  corednsQps: 14.2,
  nodeLocalReady: 7,
  nodeLocalWanted: 7,
  nodeLocalQps: 60,
  nodeLocalHits: 42,
  blockyUp: 1,
  blockyQps: 0.4,
  primaryRouterUp: 1,
  meshNodeUp: 1,
};

const resolver = (signals, id) => buildDnsTopology(signals).resolvers.find((r) => r.id === id);

test('there is a path for every client and kind of name', () => {
  for (const client of DNS_CLIENTS) {
    for (const kind of DNS_NAME_KINDS) {
      assert.ok(DNS_PATHS[`${client.id}|${kind.id}`], `no path for ${client.id} / ${kind.id}`);
    }
  }
  assert.equal(Object.keys(DNS_PATHS).length, DNS_CLIENTS.length * DNS_NAME_KINDS.length);
});

test('every path is a connected walk from the client over known resolvers', () => {
  const ids = new Set(DNS_RESOLVERS.map((r) => r.id));
  for (const [key, path] of Object.entries(DNS_PATHS)) {
    const reached = new Set(['client']);
    for (const hop of path.hops) {
      assert.ok(ids.has(hop.to), `${key}: unknown resolver ${hop.to}`);
      assert.ok(reached.has(hop.from), `${key}: hop from ${hop.from} before anything reached it`);
      reached.add(hop.to);
    }
    if (path.resolves === false) assert.equal(path.hops.length, 0, `${key}: unresolved but has hops`);
    else assert.ok(path.hops.length > 0, `${key}: resolves but has no hops`);
  }
});

test('internet names from a pod skip CoreDNS; cluster names never leave the cluster', () => {
  const targets = (key) => DNS_PATHS[key].hops.map((h) => h.to);
  assert.ok(!targets('pod|internet').includes('coredns'));
  assert.deepEqual(targets('pod|cluster'), ['node-local', 'coredns', 'kube-api']);
  assert.equal(DNS_PATHS['lan|cluster'].resolves, false);
});

test('live figures: replica counts, query rate and cache share', () => {
  assert.equal(resolver(OK, 'coredns').health, 'HEALTHY');
  assert.equal(resolver(OK, 'coredns').stat, '3/3 pods · 14 queries/s');
  assert.equal(resolver(OK, 'node-local').stat, '7/7 nodes · 60 queries/s · 70% from cache');
  assert.equal(resolver(OK, 'blocky').stat, '0.4 queries/s');
});

test('health: fewer replicas is degraded, none or a down target is offline, no data is degraded, unmeasured is null', () => {
  assert.equal(resolver({ ...OK, corednsReady: 2 }, 'coredns').health, 'DEGRADED');
  assert.equal(resolver({ ...OK, corednsReady: 0 }, 'coredns').health, 'OFFLINE');
  assert.equal(resolver({ ...OK, blockyUp: 0 }, 'blocky').health, 'OFFLINE');
  assert.equal(resolver({ ...OK, meshNodeUp: 0 }, 'mesh-unbound').health, 'OFFLINE');
  assert.equal(resolver({}, 'coredns').health, 'DEGRADED');
  assert.equal(resolver(OK, 'cloudflare').health, null);
});

test('no addresses are published', () => {
  const out = JSON.stringify(buildDnsTopology(OK));
  assert.ok(!/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(out));
});
