import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDatabaseTopology } from './databaseTopology.js';
import { DATABASES, DATABASE_APPS, UNUSED_DATABASES } from '../config/databases.js';

const pod = (name, namespace, labels, node, ready = true) => ({
  name,
  namespace,
  labels,
  node,
  phase: 'Running',
  ready,
});

const cnpgPods = (ready = true) => [
  pod('cnpg-bookmarked-2', 'default', { 'cnpg.io/cluster': 'cnpg-bookmarked', 'cnpg.io/instanceRole': 'replica' }, 'm920s'),
  pod('cnpg-bookmarked-4', 'default', { 'cnpg.io/cluster': 'cnpg-bookmarked', 'cnpg.io/instanceRole': 'primary' }, 'elitedesk', ready),
  pod('cnpg-bookmarked-1', 'default', { 'cnpg.io/cluster': 'cnpg-bookmarked', 'cnpg.io/instanceRole': 'replica' }, 'm720q'),
];

const db = (topology, id) => topology.databases.find((d) => d.id === id);

test('every app points at a defined database; only the known leftovers have no app', () => {
  const ids = new Set(DATABASES.map((d) => d.id));
  const used = new Set();
  for (const app of DATABASE_APPS) {
    for (const id of app.databases) {
      assert.ok(ids.has(id), `${app.id} -> unknown database ${id}`);
      used.add(id);
    }
  }
  const unused = [...ids].filter((id) => !used.has(id)).sort();
  assert.deepEqual(unused, [...UNUSED_DATABASES].sort());
});

test('wiring matches the connection settings read from the cluster', () => {
  const uses = (app) => DATABASE_APPS.find((a) => a.id === app).databases;
  assert.deepEqual(uses('pop-portfolio'), ['pg-ha', 'redis-ha']);
  assert.deepEqual(uses('immich'), ['pg-immich', 'immich-redis']);
  assert.deepEqual(uses('bookmarked'), ['pg-bookmarked', 'redis-ha']);
  assert.deepEqual(uses('firebook'), ['firestore', 'redis-ha']);
  assert.deepEqual(uses('podrick'), ['prometheus']);
  for (const app of ['lunary', 'vaultwarden']) assert.deepEqual(uses(app), ['pg-ha']);
});

test('Velero covers database volumes, except MongoDB (dumped instead) and the cache', () => {
  const targets = (id) => DATABASES.find((d) => d.id === id).backups.map((b) => b.name);
  assert.ok(targets('redis-ha').includes('Velero daily volume copy'));
  assert.ok(targets('pg-bookmarked').includes('Velero weekly off-site copy'));
  // immich is not in the weekly off-site list.
  assert.ok(!targets('pg-immich').includes('Velero weekly off-site copy'));
  assert.ok(!targets('mongo-intervalai').some((n) => n.startsWith('Velero')));
  assert.deepEqual(targets('immich-redis'), []);
});

test('instances carry role and machine, published by display name only', () => {
  const bookmarked = db(buildDatabaseTopology(cnpgPods(), {}), 'pg-bookmarked');

  assert.equal(bookmarked.health, 'HEALTHY');
  assert.deepEqual(
    bookmarked.instances.map((i) => [i.role, i.machineId, i.machineName]),
    [
      ['REPLICA', 'cp-3', 'Control Plane 3'],
      ['REPLICA', 'cp-1', 'Control Plane 1'],
      ['PRIMARY', 'cp-2', 'Control Plane 2'],
    ],
  );

  const out = JSON.stringify(buildDatabaseTopology(cnpgPods(), {}));
  for (const hostname of ['m920s', 'elitedesk', 'm720q']) assert.ok(!out.includes(hostname));
});

test('health: replica down is degraded, primary down or nothing running is offline', () => {
  const [replica, primary] = cnpgPods();
  const health = (pods) => db(buildDatabaseTopology(pods, {}), 'pg-bookmarked').health;

  assert.equal(health([{ ...replica, ready: false }, primary]), 'DEGRADED');
  assert.equal(health([replica, { ...primary, ready: false }]), 'OFFLINE');
  assert.equal(health([primary]), 'DEGRADED');
  assert.equal(health([]), 'OFFLINE');
});

test('completed job pods and pods of other clusters are not counted as instances', () => {
  const pods = [
    ...cnpgPods(),
    { ...cnpgPods()[0], name: 'cnpg-bookmarked-initdb', phase: 'Succeeded' },
    pod('cnpg-codetalk-2', 'default', { 'cnpg.io/cluster': 'cnpg-codetalk', 'cnpg.io/instanceRole': 'primary' }, 'm920s'),
  ];
  assert.equal(db(buildDatabaseTopology(pods, {}), 'pg-bookmarked').instances.length, 3);
});

test('Patroni instances and the leader come from metrics', () => {
  const signals = {
    patroniRunning: { m920s: 1, elitedesk: 1, m720q: 0 },
    patroniPrimary: { m920s: 1, elitedesk: 0, m720q: 0 },
    patroniSyncStandby: { m920s: 0, elitedesk: 1, m720q: 0 },
  };
  const pgha = db(buildDatabaseTopology([], signals), 'pg-ha');
  // Leader, synchronous standby, asynchronous replica.
  assert.deepEqual(
    pgha.instances.map((i) => [i.machineName, i.role]),
    [
      ['Control Plane 2', 'STANDBY'],
      ['Control Plane 3', 'REPLICA'],
      ['Control Plane 1', 'PRIMARY'],
    ],
  );

  assert.equal(pgha.health, 'DEGRADED');
  assert.equal(pgha.instances.find((i) => i.role === 'PRIMARY').machineName, 'Control Plane 1');
  assert.equal(pgha.instances.filter((i) => i.ready).length, 2);
});

test('backup status: fresh is healthy, overdue is offline, no signal is unknown', () => {
  const now = Date.UTC(2026, 10, 20, 12);
  const backups = (signals) =>
    db(buildDatabaseTopology(cnpgPods(), signals, now), 'pg-bookmarked').backups;
  const base = (signals) => backups(signals).find((b) => b.target === 'BACKBLAZE_B2');

  const fresh = base({ cnpgBarmanAge: { 'cnpg-bookmarked-4': 3600, 'cnpg-bookmarked-2': 9e8 } });
  assert.equal(fresh.status, 'HEALTHY');
  assert.equal(fresh.lastSuccess, new Date(now - 3600 * 1000).toISOString());

  assert.equal(base({ cnpgBarmanAge: { 'cnpg-bookmarked-4': 3 * 86400 } }).status, 'OFFLINE');
  assert.equal(base({}).status, 'UNKNOWN');
  assert.equal(backups({}).find((b) => b.target === 'VOLUME_SNAPSHOT').status, 'UNKNOWN');
});

test('the B2 backup and the volume snapshot of a CNPG cluster each read their own signal', () => {
  const now = Date.UTC(2026, 10, 20, 12);
  const backups = (signals) =>
    db(buildDatabaseTopology(cnpgPods(), signals, now), 'pg-bookmarked').backups;
  const b2 = (signals) => backups(signals).find((b) => b.target === 'BACKBLAZE_B2');
  const snapshot = (signals) => backups(signals).find((b) => b.target === 'VOLUME_SNAPSHOT');

  // A fresh snapshot says nothing about the off-site backup, and the reverse.
  const onlySnapshot = { cnpgSnapshotAge: { 'cnpg-bookmarked-4': 3600 } };
  assert.equal(snapshot(onlySnapshot).status, 'HEALTHY');
  assert.equal(snapshot(onlySnapshot).lastSuccess, new Date(now - 3600 * 1000).toISOString());
  assert.equal(b2(onlySnapshot).status, 'UNKNOWN');

  const onlyBarman = { cnpgBarmanAge: { 'cnpg-bookmarked-4': 3600 } };
  assert.equal(b2(onlyBarman).status, 'HEALTHY');
  assert.equal(snapshot(onlyBarman).status, 'UNKNOWN');

  // Only the primary reports a snapshot time; an overdue one is offline.
  assert.equal(snapshot({ cnpgSnapshotAge: { 'cnpg-bookmarked-4': 3 * 86400 } }).status, 'OFFLINE');
  // Another cluster's signal is not picked up.
  assert.equal(snapshot({ cnpgSnapshotAge: { 'cnpg-codetalk-4': 3600 } }).status, 'UNKNOWN');
});

test('a hosted database has no instances here and is not reported as down', () => {
  const firestore = db(buildDatabaseTopology([], {}), 'firestore');
  assert.deepEqual(firestore.instances, []);
  assert.equal(firestore.storage, 'EXTERNAL');
  assert.equal(firestore.health, 'HEALTHY');
  // A cluster database with nothing running is still offline.
  assert.equal(db(buildDatabaseTopology([], {}), 'prometheus').health, 'OFFLINE');
});

test('every database with a B2 backup also lists the daily copy to Cloudflare R2', () => {
  for (const d of DATABASES) {
    const targets = d.backups.map((b) => b.target);
    const r2 = d.backups.filter((b) => b.name === 'Daily copy of the B2 backups');
    if (targets.includes('BACKBLAZE_B2')) {
      assert.equal(r2.length, 1, d.id);
      assert.deepEqual(r2[0].source, { type: 'cron', cronjob: 'b2-r2-mirror' });
    } else {
      assert.equal(r2.length, 0, d.id);
    }
  }
  const pgha = DATABASES.find((d) => d.id === 'pg-ha').backups;
  const dump = pgha.find((b) => b.name === 'Nightly logical dump');
  assert.equal(dump.target, 'CLOUDFLARE_R2');
  assert.deepEqual(dump.source, { type: 'pgha', kind: 'dumpR2' });
});
