import { DNS_RESOLVERS, DNS_CLIENTS, DNS_NAME_KINDS, DNS_PATHS } from '../config/dns.js';
import { fetchDnsSignals } from '../lib/dnsClient.js';

const rate = (qps) => (qps == null ? null : `${qps < 10 ? qps.toFixed(1) : Math.round(qps)} queries/s`);

function replicaHealth(ready, wanted) {
  if (ready == null || wanted == null) return 'DEGRADED';
  if (ready <= 0) return 'OFFLINE';
  return ready >= wanted ? 'HEALTHY' : 'DEGRADED';
}

function upHealth(value) {
  if (value == null) return 'DEGRADED';
  return value === 1 ? 'HEALTHY' : 'OFFLINE';
}

const join = (...parts) => parts.filter(Boolean).join(' · ') || null;

// health is null for resolvers nothing measures (public ones, Tailscale's).
// For the routers the signal is the router itself being reachable, not its
// DNS daemon specifically.
function resolverStatus(signal, s) {
  switch (signal) {
    case 'coredns':
      return {
        health: replicaHealth(s.corednsReady, s.corednsWanted),
        stat: join(s.corednsReady != null && `${s.corednsReady}/${s.corednsWanted} pods`, rate(s.corednsQps)),
      };
    case 'nodeLocal': {
      const hitRate =
        s.nodeLocalQps > 0 && s.nodeLocalHits != null
          ? `${Math.round((s.nodeLocalHits / s.nodeLocalQps) * 100)}% from cache`
          : null;
      return {
        health: replicaHealth(s.nodeLocalReady, s.nodeLocalWanted),
        stat: join(
          s.nodeLocalReady != null && `${s.nodeLocalReady}/${s.nodeLocalWanted} nodes`,
          rate(s.nodeLocalQps),
          hitRate,
        ),
      };
    }
    case 'blocky':
      return { health: upHealth(s.blockyUp), stat: rate(s.blockyQps) };
    case 'primaryRouter':
      return { health: upHealth(s.primaryRouterUp), stat: null };
    case 'meshNode':
      return { health: upHealth(s.meshNodeUp), stat: null };
    default:
      return { health: null, stat: null };
  }
}

export function buildDnsTopology(signals, now = Date.now()) {
  const s = signals ?? {};
  return {
    resolvers: DNS_RESOLVERS.map((r) => ({
      id: r.id,
      displayName: r.displayName,
      location: r.location,
      role: r.role,
      ...resolverStatus(r.signal, s),
    })),
    clients: DNS_CLIENTS,
    nameKinds: DNS_NAME_KINDS,
    paths: Object.entries(DNS_PATHS).map(([key, path]) => {
      const [client, nameKind] = key.split('|');
      return {
        client,
        nameKind,
        resolves: path.resolves !== false,
        summary: path.summary,
        hops: path.hops,
      };
    }),
    lastUpdated: new Date(now).toISOString(),
  };
}

export const dnsTopologyResolvers = {
  Query: {
    dnsTopology: async () => buildDnsTopology(await fetchDnsSignals().catch(() => ({}))),
  },
};
