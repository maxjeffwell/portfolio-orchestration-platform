import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLlmTopology } from './llmTopology.js';
import { LLM_STAGES, LLM_NODES, LLM_FLOWS } from '../config/llm.js';

const OK = {
  workloads: Object.fromEntries(
    LLM_NODES.flatMap((n) => n.signal?.workloads ?? []).map((w) => [w, { ready: 2, wanted: 2 }]),
  ),
  pods: LLM_NODES.filter((n) => n.signal?.pods).flatMap((n) =>
    [0, 1].map((i) => ({
      namespace: n.signal.pods.namespace,
      pod: `${n.signal.pods.prefix}${i}`,
      ready: true,
    })),
  ),
  modelRequests: { 'qwen2.5-1.5b-instruct': 6.2, interval_ai: 1, 'e5-large': 0 },
};

const node = (signals, id) => buildLlmTopology(signals).nodes.find((n) => n.id === id);

test('every flow joins two defined nodes and moves left to right', () => {
  const stageOf = Object.fromEntries(LLM_NODES.map((n) => [n.id, n.stage]));
  const order = Object.fromEntries(LLM_STAGES.map((s, i) => [s.id, i]));
  for (const f of LLM_FLOWS) {
    assert.ok(stageOf[f.from], `unknown source ${f.from}`);
    assert.ok(stageOf[f.to], `unknown target ${f.to}`);
    assert.ok(order[stageOf[f.from]] <= order[stageOf[f.to]], `${f.from} -> ${f.to} goes backwards`);
  }
});

test('nothing is stranded and no flow is listed twice', () => {
  const touched = new Set(LLM_FLOWS.flatMap((f) => [f.from, f.to]));
  for (const n of LLM_NODES) assert.ok(touched.has(n.id), `${n.id} has no flows`);
  const keys = LLM_FLOWS.map((f) => `${f.from}>${f.to}>${f.signal}`);
  assert.equal(new Set(keys).size, keys.length);
});

test('a model shows its own request count, not the server replica count', () => {
  assert.deepEqual(
    { health: node(OK, 'qwen-chat').health, stat: node(OK, 'qwen-chat').stat },
    { health: 'HEALTHY', stat: '6 requests in 7 days' },
  );
  assert.equal(node(OK, 'interval-model').stat, '1 request in 7 days');
  assert.equal(node(OK, 'e5').stat, '0 requests in 7 days');
  assert.equal(node(OK, 'reranker').stat, null);
});

test('services report replicas; operator-managed stores are matched by pod prefix', () => {
  assert.equal(node(OK, 'gateway').stat, '2/2 running');
  assert.equal(node(OK, 'qdrant').stat, '2/2 running');
  assert.equal(node(OK, 'qdrant').health, 'HEALTHY');
});

test('hosted models and unmeasured callers carry no health at all', () => {
  for (const id of ['groq', 'anthropic', 'openai', 'runpod', 'tenants']) {
    assert.equal(node(OK, id).health, null);
    assert.equal(node(OK, id).stat, null);
  }
});

test('one model server copy down degrades its models; all down takes them offline', () => {
  const off = { ready: 0, wanted: 1 };
  const one = { ...OK, workloads: { ...OK.workloads, 'embeddings-predictor': off } };
  assert.equal(node(one, 'qwen-embed').health, 'DEGRADED');
  assert.equal(node(one, 'interval-model').health, 'DEGRADED');
  assert.equal(node(one, 'qwen-chat').health, 'HEALTHY');

  const both = {
    ...OK,
    workloads: { ...OK.workloads, 'embeddings-predictor': off, 'embeddings-2-predictor': off, 'embeddings-3-predictor': off },
  };
  assert.equal(node(both, 'qwen-embed').health, 'OFFLINE');
  assert.equal(node(both, 'interval-model').health, 'OFFLINE');
  assert.equal(node(both, 'qwen-chat').health, 'HEALTHY');
});

test('a copy with no data counts as not running', () => {
  const { 'qwen-llm-2-predictor': _gone, ...rest } = OK.workloads;
  assert.equal(node({ ...OK, workloads: rest }, 'qwen-chat').health, 'DEGRADED');
});

test('one of two pods not ready is degraded; a partly ready service too', () => {
  const half = {
    ...OK,
    pods: OK.pods.map((p, i) => (p.pod === 'qdrant-ha-qdrant-0' ? { ...p, ready: false } : p)),
    workloads: { ...OK.workloads, litellm: { ready: 1, wanted: 2 } },
  };
  assert.equal(node(half, 'qdrant').health, 'DEGRADED');
  assert.equal(node(half, 'qdrant').stat, '1/2 running');
  assert.equal(node(half, 'litellm').health, 'DEGRADED');
});

test('with no data at all, measured nodes are degraded rather than healthy', () => {
  for (const signals of [undefined, {}, { workloads: null, pods: null, modelRequests: null }]) {
    assert.equal(node(signals, 'gateway').health, 'DEGRADED');
    assert.equal(node(signals, 'gateway').stat, null);
    assert.equal(node(signals, 'qdrant').health, 'DEGRADED');
    assert.equal(node(signals, 'qwen-chat').stat, null);
  }
});
