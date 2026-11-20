import {
  MONITORING_STAGES,
  MONITORING_NODES,
  MONITORING_FLOWS,
} from '../config/monitoring.js';
import { fetchMonitoringSignals } from '../lib/monitoringClient.js';

const SEVERITY = { HEALTHY: 0, DEGRADED: 1, OFFLINE: 2 };
const worst = (a, b) => (SEVERITY[a] >= SEVERITY[b] ? a : b);

const compact = (n) => {
  if (n == null) return null;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return `${Math.round(n)}`;
};
const join = (...parts) => parts.filter(Boolean).join(' · ') || null;

// ready/wanted of a set of workloads: all there is HEALTHY, none is OFFLINE.
function workloadHealth(names, workloads) {
  let health = null;
  let ready = 0;
  let wanted = 0;
  for (const name of names) {
    const w = workloads?.[name];
    if (!w || w.ready == null || w.wanted == null) {
      health = health ? worst(health, 'DEGRADED') : 'DEGRADED';
      continue;
    }
    ready += w.ready;
    wanted += w.wanted;
    let one = 'DEGRADED';
    if (w.ready <= 0) one = 'OFFLINE';
    else if (w.ready >= w.wanted) one = 'HEALTHY';
    health = health ? worst(health, one) : one;
  }
  return { health, counts: wanted > 0 ? `${ready}/${wanted} running` : null };
}

function jobHealth(job, jobs) {
  const j = jobs?.[job];
  if (!j) return { health: 'DEGRADED', counts: null };
  let health = 'DEGRADED';
  if (j.up <= 0) health = 'OFFLINE';
  else if (j.up >= j.total) health = 'HEALTHY';
  return { health, counts: `${j.up}/${j.total} targets up` };
}

// The headline figure for the stores and the alerting pieces.
function figure(kind, s) {
  switch (kind) {
    case 'prometheus':
      return join(
        s.targets != null && `${s.targetsUp}/${s.targets} targets up`,
        s.promSamples != null && `${compact(s.promSamples)} samples/s`,
        s.promSeries != null && `${compact(s.promSeries)} series`,
      );
    case 'mimir':
      return join(
        s.mimirSamples != null && `${compact(s.mimirSamples)} samples/s`,
        s.mimirSeries != null && `${compact(s.mimirSeries)} series`,
      );
    case 'tempo':
      return s.tempoSpans != null ? `${compact(s.tempoSpans)} spans/s` : null;
    case 'pyroscope':
      return s.pyroscopeBytes != null ? `${compact(s.pyroscopeBytes / 1024)} KB/s of profiles` : null;
    case 'rules':
      return join(
        s.rules != null && `${s.rules} rules`,
        s.firing != null && `${s.firing} firing`,
      );
    case 'alertmanager':
      return s.firing != null ? `${s.firing} alerts firing` : null;
    default:
      return null;
  }
}

// A heartbeat is due every five minutes; three missed is a problem.
const HEARTBEAT_MAX_AGE_S = 15 * 60;

function nodeStatus(signal, s) {
  if (!signal) return { health: null, stat: null, inferred: false };

  let health = null;
  const parts = [];
  if (signal.workloads) {
    const w = workloadHealth(signal.workloads, s.workloads);
    health = w.health;
    parts.push(w.counts);
  }
  if (signal.up) {
    const j = jobHealth(signal.up, s.jobs);
    health = health ? worst(health, j.health) : j.health;
    if (!signal.inferred) parts.push(j.counts);
  }
  if (signal.cron) {
    const age = s.heartbeatAgeS;
    if (age == null) health = 'DEGRADED';
    else health = age <= HEARTBEAT_MAX_AGE_S ? 'HEALTHY' : 'OFFLINE';
    if (age != null) parts.push(`last ping ${Math.max(0, Math.round(age / 60))} min ago`);
  }
  if (signal.stat === 'rules') health = s.rules == null ? 'DEGRADED' : 'HEALTHY';
  parts.push(figure(signal.stat, s));

  return { health, stat: join(...parts), inferred: Boolean(signal.inferred) };
}

export function buildMonitoringTopology(signals, now = Date.now()) {
  const s = signals ?? {};
  return {
    stages: MONITORING_STAGES,
    nodes: MONITORING_NODES.map((n) => ({
      id: n.id,
      stage: n.stage,
      displayName: n.displayName,
      location: n.location,
      role: n.role,
      ...nodeStatus(n.signal, s),
    })),
    flows: MONITORING_FLOWS,
    lastUpdated: new Date(now).toISOString(),
  };
}

export const monitoringTopologyResolvers = {
  Query: {
    monitoringTopology: async () =>
      buildMonitoringTopology(await fetchMonitoringSignals().catch(() => ({}))),
  },
};
