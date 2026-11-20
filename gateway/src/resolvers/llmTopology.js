import { LLM_STAGES, LLM_NODES, LLM_FLOWS } from '../config/llm.js';
import { fetchLlmSignals } from '../lib/llmClient.js';

const SEVERITY = { HEALTHY: 0, DEGRADED: 1, OFFLINE: 2 };
const worst = (a, b) => (SEVERITY[a] >= SEVERITY[b] ? a : b);
const join = (...parts) => parts.filter(Boolean).join(' · ') || null;

function grade(ready, wanted) {
  if (ready <= 0) return 'OFFLINE';
  return ready >= wanted ? 'HEALTHY' : 'DEGRADED';
}

// Unknown is DEGRADED, never HEALTHY: no data is not good news.
function workloadHealth(names, workloads) {
  let health = null;
  let ready = 0;
  let wanted = 0;
  for (const name of names) {
    const w = workloads?.[name];
    const known = w && w.ready != null && w.wanted != null;
    if (known) {
      ready += w.ready;
      wanted += w.wanted;
    }
    const one = known ? grade(w.ready, w.wanted) : 'DEGRADED';
    health = health ? worst(health, one) : one;
  }
  return { health, counts: wanted > 0 ? `${ready}/${wanted} running` : null };
}

function podHealth({ namespace, prefix }, pods) {
  const mine = (pods ?? []).filter((p) => p.namespace === namespace && p.pod.startsWith(prefix));
  if (!mine.length) return { health: 'DEGRADED', counts: null };
  const ready = mine.filter((p) => p.ready).length;
  return { health: grade(ready, mine.length), counts: `${ready}/${mine.length} running` };
}

function requestsText(model, modelRequests) {
  const n = modelRequests?.[model];
  if (n == null) return null;
  const rounded = Math.round(n);
  return `${rounded} request${rounded === 1 ? '' : 's'} in 7 days`;
}

function nodeStatus(signal, s) {
  if (!signal) return { health: null, stat: null };
  let health = null;
  const parts = [];
  if (signal.workloads) {
    const w = workloadHealth(signal.workloads, s.workloads);
    health = w.health;
    // A model's box shows its own traffic; the server's replica count is the
    // same for every model on it and would only repeat.
    if (!signal.model) parts.push(w.counts);
  }
  if (signal.pods) {
    const p = podHealth(signal.pods, s.pods);
    health = health ? worst(health, p.health) : p.health;
    parts.push(p.counts);
  }
  if (signal.model) parts.push(requestsText(signal.model, s.modelRequests));
  return { health, stat: join(...parts) };
}

export function buildLlmTopology(signals, now = Date.now()) {
  const s = signals ?? {};
  return {
    stages: LLM_STAGES,
    nodes: LLM_NODES.map((n) => ({
      id: n.id,
      stage: n.stage,
      displayName: n.displayName,
      location: n.location,
      role: n.role,
      ...nodeStatus(n.signal, s),
    })),
    flows: LLM_FLOWS,
    lastUpdated: new Date(now).toISOString(),
  };
}

export const llmTopologyResolvers = {
  Query: {
    llmTopology: async () => buildLlmTopology(await fetchLlmSignals().catch(() => ({}))),
  },
};
