import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMonitoringTopology } from './monitoringTopology.js';
import {
  MONITORING_STAGES,
  MONITORING_NODES,
  MONITORING_FLOWS,
} from '../config/monitoring.js';

const OK = {
  workloads: Object.fromEntries(
    MONITORING_NODES.flatMap((n) => n.signal?.workloads ?? []).map((w) => [w, { ready: 2, wanted: 2 }]),
  ),
  jobs: { caretta: { up: 7, total: 7 }, beyla: { up: 7, total: 7 }, garage: { up: 8, total: 8 }, 'cadvisor-asustor': { up: 1, total: 1 } },
  targets: 207,
  targetsUp: 207,
  promSeries: 932286,
  promSamples: 19030,
  mimirSeries: 593615,
  mimirSamples: 38834,
  tempoSpans: 216,
  pyroscopeBytes: 69231,
  rules: 306,
  firing: 1,
  heartbeatAgeS: 120,
};

const node = (signals, id) => buildMonitoringTopology(signals).nodes.find((n) => n.id === id);

test('every flow joins two defined nodes and moves left to right', () => {
  const stageOf = Object.fromEntries(MONITORING_NODES.map((n) => [n.id, n.stage]));
  const order = Object.fromEntries(MONITORING_STAGES.map((s, i) => [s.id, i]));
  for (const f of MONITORING_FLOWS) {
    assert.ok(stageOf[f.from], `unknown source ${f.from}`);
    assert.ok(stageOf[f.to], `unknown target ${f.to}`);
    assert.ok(order[stageOf[f.from]] <= order[stageOf[f.to]], `${f.from} -> ${f.to} goes backwards`);
  }
});

test('nothing is stranded: every node sends or receives something', () => {
  const touched = new Set(MONITORING_FLOWS.flatMap((f) => [f.from, f.to]));
  for (const n of MONITORING_NODES) assert.ok(touched.has(n.id), `${n.id} has no flow`);
});

test('each signal reaches a store, and Caretta is on the metrics path to Mimir', () => {
  const reaches = (signal, store) =>
    MONITORING_FLOWS.some((f) => f.signal === signal && f.to === store);
  assert.ok(reaches('METRICS', 'mimir') && reaches('METRICS', 'prometheus'));
  assert.ok(reaches('LOGS', 'loki'));
  assert.ok(reaches('TRACES', 'tempo'));
  assert.ok(reaches('PROFILES', 'pyroscope'));
  assert.ok(MONITORING_FLOWS.some((f) => f.from === 'caretta' && f.to === 'alloy'));
  assert.ok(MONITORING_FLOWS.some((f) => f.from === 'alloy' && f.to === 'mimir'));
});

test('live figures are attached where they exist', () => {
  assert.equal(node(OK, 'prometheus').stat, '2/2 running · 207/207 targets up · 19k samples/s · 932k series');
  assert.equal(node(OK, 'mimir').stat, '2/2 running · 39k samples/s · 594k series');
  assert.equal(node(OK, 'caretta').stat, '2/2 running · 7/7 targets up');
  assert.equal(node(OK, 'rules').stat, '306 rules · 1 firing');
  assert.equal(node(OK, 'heartbeat').stat, 'last ping 2 min ago');
  assert.equal(node(OK, 'workloads').health, null);
});

test('health: missing replicas degrade, none is offline, a stale heartbeat is offline, no data is degraded', () => {
  const with_ = (name, w) => ({ ...OK, workloads: { ...OK.workloads, [name]: w } });
  assert.equal(node(OK, 'grafana').health, 'HEALTHY');
  assert.equal(node(with_('prometheus-grafana', { ready: 1, wanted: 2 }), 'grafana').health, 'DEGRADED');
  assert.equal(node(with_('prometheus-grafana', { ready: 0, wanted: 2 }), 'grafana').health, 'OFFLINE');
  assert.equal(node({ ...OK, heartbeatAgeS: 3600 }, 'heartbeat').health, 'OFFLINE');
  assert.equal(node({}, 'mimir').health, 'DEGRADED');
  // Loki has no metrics of its own: its health is inferred from its host.
  assert.equal(node(OK, 'loki').inferred, true);
  assert.equal(node(OK, 'loki').health, 'HEALTHY');
});
