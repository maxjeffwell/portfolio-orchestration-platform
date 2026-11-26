import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTopology } from './networkTopology.js';
import {
  NODE_DEFINITIONS,
  LINK_DEFINITIONS,
  MAYASTOR_NODE,
  LVM_NODE,
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

const LVM_OK = {
  volumes: 36,
  provisionedBytes: 291 * 1024 ** 3,
  usedBytes: 38.7 * 1024 ** 3,
  pluginsReady: 4,
  pluginsDesired: 4,
};

const OVERLAY_OK = {
  lvm: LVM_OK,
  headscale: { primaryUp: true, publicUp: true, standbySynced: true },
  offsite: { veleroAgeS: 5 * 86400, garageSyncAgeS: 5 * 86400, postgresAgeS: 900 },
  wireguardHandshakes: { '10.0.0.9': 40, '10.0.0.4': 60, '10.0.0.5': 90, '10.0.0.6': 120 },
};

const byId = (topology, id) => topology.nodes.find((n) => n.id === id);

test('every link references a defined node', () => {
  const ids = new Set([
    ...NODE_DEFINITIONS.map((n) => n.id),
    MAYASTOR_NODE.id,
    LVM_NODE.id,
    OFFSITE_NODE.id,
  ]);
  for (const link of LINK_DEFINITIONS) {
    assert.ok(ids.has(link.source), `unknown source ${link.source}`);
    assert.ok(ids.has(link.target), `unknown target ${link.target}`);
  }
});

test('all targets up: every node and link is healthy', () => {
  // SECOND_PORTS: the second network's remote switches are judged by ports.
  const topology = buildTopology(EMPTY_METRICS, allUp(), STORAGE_OK, SECOND_PORTS, OVERLAY_OK);
  assert.equal(topology.nodes.length, NODE_DEFINITIONS.length + 3);
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
    NODE_DEFINITIONS.filter((n) => n.type !== 'SWITCH' && n.tailnet !== false)
      .map((n) => n.id)
      .filter((id) => id !== 'gpu-1')
      .sort(),
  );
  // The second router is not registered with the tailnet; its access point is.
  assert.ok(!tailnet.some((l) => l.target === 'second-router'));
  assert.ok(tailnet.some((l) => l.target === 'access-point'));
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

  assert.deepEqual(wired('cp-3'), ['mesh-node', 'switch-a']);
  assert.equal(
    links.find((l) => l.source === 'cp-3' && l.target === 'mesh-node').bandwidthBps,
    1e9,
  );
  assert.deepEqual(wired('gpu-workstation'), ['switch-a']);
  assert.deepEqual(wired('cp-1'), ['switch-b1']);
  assert.deepEqual(wired('asustor'), ['switch-b1', 'switch-b2']);
  assert.deepEqual(wired('synology'), ['switch-b2']);
  assert.deepEqual(wired('cp-2'), ['primary-router', 'switch-c']);

  const moca = links.filter((l) => l.type === 'MOCA');
  assert.deepEqual(moca.map((l) => l.source).sort(), ['switch-a', 'switch-b1']);
  assert.ok(moca.every((l) => l.target === 'primary-router'));

  const backhaul = links.find((l) => l.type === 'BACKHAUL');
  // Router to mesh node over the coax, not through a switch.
  assert.deepEqual([backhaul.source, backhaul.target], ['primary-router', 'mesh-node']);
  assert.equal(backhaul.metadata.via, 'MoCA coax');

  const via = (source, target) =>
    links.find((l) => l.source === source && l.target === target).metadata?.via ?? null;
  for (const id of ['cp-1', 'gpu-1', 'gpu-2']) assert.equal(via(id, 'switch-b1'), 'Two cables');
  assert.equal(via('cp-3', 'switch-a'), 'Two cables');
  assert.equal(via('asustor', 'switch-b1'), null);

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

  const up = allUp();
  up['integrations/unix|m720q'] = false;
  up['integrations/unix|marmoset'] = false;
  const topology = buildTopology(EMPTY_METRICS, up, STORAGE_OK, {}, OVERLAY_OK);
  assert.equal(byId(topology, 'switch-a').health, 'OFFLINE');
  assert.ok(!topology.links.some((l) => l.type === 'TAILSCALE' && l.target.startsWith('switch')));
  assert.equal(byId(buildTopology(EMPTY_METRICS, {}, STORAGE_OK), 'switch-a').health, 'DEGRADED');
});

test('LVM local volumes: a storage node linked from the three servers, with health from its node plugins', () => {
  const build = (lvm) => buildTopology(EMPTY_METRICS, allUp(), STORAGE_OK, {}, { ...OVERLAY_OK, lvm });
  const node = byId(build(LVM_OK), 'lvm-local');

  assert.equal(node.zone, 'STORAGE');
  assert.equal(node.health, 'HEALTHY');
  assert.deepEqual(
    node.services.map((s) => s.name),
    ['36 volumes', '4/4 node plugins', 'Not replicated'],
  );
  assert.equal(node.metrics.storageUsedGb, 38.7);
  assert.equal(node.metrics.storageTotalGb, 291);

  const links = build(LVM_OK).links.filter((l) => l.type === 'LOCAL_VOLUME');
  assert.deepEqual(links.map((l) => l.source).sort(), ['cp-1', 'cp-2', 'cp-3']);
  assert.ok(links.every((l) => l.target === 'lvm-local'));

  assert.equal(byId(build({ ...LVM_OK, pluginsReady: 3 }), 'lvm-local').health, 'DEGRADED');
  assert.equal(byId(build({ ...LVM_OK, pluginsReady: 0 }), 'lvm-local').health, 'OFFLINE');
  assert.equal(byId(build(null), 'lvm-local').health, 'DEGRADED');
});

// The second network: its own router, an access point and three switches.
// Five machines have a leg on it besides their homelab cabling.
const SECOND_PORTS = {
  'm920s|eno1': { carrier: true, speedBps: 1e9 },
  'debian-marmoset|enx3c8cf861771b': { carrier: true, speedBps: 2.5e9 },
  'neonmarmoset|enx00e04c6707fd': { carrier: true, speedBps: 2.5e9 },
  'marmoset|enx8cae4cb97d51': { carrier: true, speedBps: 2.5e9 },
};
const second = (links) => links.filter((l) => l.type === 'SECOND_NETWORK');
const pair = (l) => [l.source, l.target].sort().join(' <-> ');

test('second network: every machine reaches the second router through an access switch', () => {
  const { nodes, links } = buildTopology(EMPTY_METRICS, allUp(), STORAGE_OK, SECOND_PORTS, OVERLAY_OK);

  assert.equal(byId({ nodes }, 'second-router').type, 'ROUTER');
  assert.equal(byId({ nodes }, 'second-router').displayName, 'Second Network Router');
  // Not to be mistaken for the homelab's mesh node, which stays as it was.
  assert.equal(byId({ nodes }, 'mesh-node').displayName, 'Mesh Node');
  assert.ok(!second(links).some((l) => l.source === 'mesh-node' || l.target === 'mesh-node'));
  assert.equal(byId({ nodes }, 'access-point').displayName, 'Access Point');
  for (const id of ['switch-s1', 'switch-s2', 'switch-s3']) {
    assert.equal(byId({ nodes }, id).type, 'SWITCH');
  }

  assert.deepEqual(second(links).map(pair).sort(), [
    'access-point <-> switch-s1',
    'asustor <-> switch-s2',
    'cp-1 <-> switch-s2',
    'gpu-1 <-> switch-s2',
    'gpu-2 <-> switch-s2',
    'gpu-workstation <-> switch-s3',
    'second-router <-> switch-s1',
    'switch-s1 <-> switch-s2',
    'switch-s1 <-> switch-s3',
  ]);

  // Its internet uplinks are not part of the map, in links or in service names.
  assert.deepEqual(byId({ nodes }, 'second-router').services.map((s) => s.name), ['Gateway']);
  // Only the switch at the router is cabled to it; nothing else is.
  assert.deepEqual(
    links.filter((l) => l.source === 'second-router' || l.target === 'second-router').map(pair),
    ['second-router <-> switch-s1'],
  );
  // The two remote switches reach it over coax.
  const via = (a, b) => second(links).find((l) => pair(l) === `${a} <-> ${b}`).metadata?.via;
  assert.equal(via('switch-s1', 'switch-s2'), 'MoCA coax');
  assert.equal(via('switch-s1', 'switch-s3'), 'MoCA coax');
  // Control Plane 2 and 3 and the Synology have no leg on the second network.
  for (const id of ['cp-2', 'cp-3', 'synology']) {
    assert.ok(!second(links).some((l) => l.source === id || l.target === id), id);
  }
});

test('second network: a machine link follows its own port, with the negotiated speed', () => {
  const link = (ports) =>
    second(buildTopology(EMPTY_METRICS, allUp(), STORAGE_OK, ports, OVERLAY_OK).links).find(
      (l) => pair(l) === 'cp-1 <-> switch-s2',
    );

  assert.equal(link(SECOND_PORTS).status, 'HEALTHY');
  assert.equal(link(SECOND_PORTS).bandwidthBps, 1e9);

  const unplugged = { ...SECOND_PORTS, 'm920s|eno1': { carrier: false, speedBps: null } };
  assert.equal(link(unplugged).status, 'OFFLINE');
  assert.equal(link(unplugged).bandwidthBps, null);
});

test('second network: a switch is judged by the ports cabled to it, not by whether the machines are up', () => {
  const health = (ports, id = 'switch-s2') =>
    byId(buildTopology(EMPTY_METRICS, allUp(), STORAGE_OK, ports, OVERLAY_OK), id).health;
  const down = { carrier: false, speedBps: null };

  assert.equal(health(SECOND_PORTS), 'HEALTHY');
  // One port still lit is enough.
  assert.equal(
    health({ ...SECOND_PORTS, 'm920s|eno1': down, 'debian-marmoset|enx3c8cf861771b': down }),
    'HEALTHY',
  );
  // Every machine is up on the homelab, but no port on this switch has carrier.
  assert.equal(
    health({
      ...SECOND_PORTS,
      'm920s|eno1': down,
      'debian-marmoset|enx3c8cf861771b': down,
      'neonmarmoset|enx00e04c6707fd': down,
    }),
    'OFFLINE',
  );
  // No port data at all is unknown, not down.
  assert.equal(health({}), 'DEGRADED');
  assert.equal(health({ ...SECOND_PORTS, 'marmoset|enx8cae4cb97d51': down }, 'switch-s3'), 'OFFLINE');
});

test('second network: the router and its switch follow the access point, the one device there with a probe', () => {
  const topology = (probe) => {
    const up = allUp();
    if (probe === undefined) delete up['icmp-infra|100.64.0.13'];
    else up['icmp-infra|100.64.0.13'] = probe;
    return buildTopology(EMPTY_METRICS, up, STORAGE_OK, SECOND_PORTS, OVERLAY_OK);
  };

  for (const id of ['access-point', 'second-router', 'switch-s1']) {
    assert.equal(byId(topology(true), id).health, 'HEALTHY', id);
    assert.equal(byId(topology(false), id).health, 'OFFLINE', id);
    // The probe result is missing: unknown, not down.
    assert.equal(byId(topology(undefined), id).health, 'DEGRADED', id);
  }
  // The homelab is unaffected by the second network being down.
  assert.equal(byId(topology(false), 'primary-router').health, 'HEALTHY');
  assert.equal(byId(topology(false), 'cp-1').health, 'HEALTHY');
});

test('traffic: a storage link reports its node\'s measured I/O, and nothing when it was not measured', () => {
  const overlay = {
    ...OVERLAY_OK,
    storageTraffic: {
      nvmeof: { m920s: 11.6e6, elitedesk: 140e3 },
      lvm: { m920s: 3.1e6 },
    },
  };
  const { links } = buildTopology(EMPTY_METRICS, allUp(), STORAGE_OK, SECOND_PORTS, overlay);
  const find = (source, type) => links.find((l) => l.source === source && l.type === type);

  assert.equal(find('cp-1', 'NVME_OF').throughputBps, 11.6e6);
  assert.equal(find('cp-2', 'NVME_OF').throughputBps, 140e3);
  assert.equal(find('cp-1', 'LOCAL_VOLUME').throughputBps, 3.1e6);
  // m720q was not in the answer: unknown, which is not the same as idle.
  assert.equal(find('cp-3', 'NVME_OF').throughputBps, null);
  assert.equal(find('cp-3', 'LOCAL_VOLUME').throughputBps, null);
});

test('traffic: no storage answer at all leaves every storage link unmeasured', () => {
  const { links } = buildTopology(EMPTY_METRICS, allUp(), STORAGE_OK, SECOND_PORTS, OVERLAY_OK);
  for (const l of links.filter((x) => x.type === 'NVME_OF' || x.type === 'LOCAL_VOLUME')) {
    assert.equal(l.throughputBps, null, `${l.source} ${l.type}`);
  }
});

test('traffic: a link that names its port reports that port\'s rate, and none once the link is down', () => {
  const link = (ports) =>
    second(buildTopology(EMPTY_METRICS, allUp(), STORAGE_OK, ports, OVERLAY_OK).links).find(
      (l) => pair(l) === 'cp-1 <-> switch-s2',
    );

  const busy = { ...SECOND_PORTS, 'm920s|eno1': { carrier: true, speedBps: 1e9, trafficBps: 42e6 } };
  assert.equal(link(busy).throughputBps, 42e6);
  // A port with no rate in the answer is unmeasured.
  assert.equal(link(SECOND_PORTS).throughputBps, null);

  const unplugged = { ...SECOND_PORTS, 'm920s|eno1': { carrier: false, speedBps: null, trafficBps: 42e6 } };
  assert.equal(link(unplugged).status, 'OFFLINE');
  assert.equal(link(unplugged).throughputBps, null);
});

test('traffic: a WireGuard link reports its peer\'s rate; links with no source of numbers stay unmeasured', () => {
  const overlay = { ...OVERLAY_OK, wireguardTraffic: { '10.0.0.9': 250e3 } };
  const { links } = buildTopology(EMPTY_METRICS, allUp(), STORAGE_OK, SECOND_PORTS, overlay);
  const wg = (target) => links.find((l) => l.type === 'WIREGUARD' && l.target === target);

  assert.equal(wg('gpu-1').throughputBps, 250e3);
  assert.equal(wg('asustor').throughputBps, null);
  for (const l of links.filter((x) => x.type === 'TAILSCALE' || x.type === 'GARAGE_REPLICATION')) {
    assert.equal(l.throughputBps, null, `${l.source} -> ${l.target} ${l.type}`);
  }
});
