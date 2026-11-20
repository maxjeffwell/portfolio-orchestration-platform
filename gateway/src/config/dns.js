// How name resolution works across the cluster, the home LAN and the tailnet.
//
// Hand-maintained from the live configuration (CoreDNS and node-local-dns
// Corefiles, each node's resolv.conf, the routers' dnsmasq and Unbound
// settings, Blocky's config, Headscale's DNS section), read on 2026-11-20,
// and from a test of where queries sent through Tailscale's forwarder exit.
// Nothing here is discovered at runtime except the health figures; update it
// when a resolver's settings change. No addresses are listed.

export const DNS_RESOLVERS = [
  {
    id: 'node-local',
    displayName: 'node-local-dns',
    location: 'Every cluster node',
    role: 'A cache on each node. It answers every pod query first and decides, by name, who to ask on a miss.',
    signal: 'nodeLocal',
  },
  {
    id: 'coredns',
    displayName: 'CoreDNS',
    location: 'Three pods on the control-plane servers',
    role: 'Answers cluster names and applies rewrites. It has no LAN server configured: other names go to the resolvers of the node its pod runs on.',
    signal: 'coredns',
  },
  {
    id: 'kube-api',
    displayName: 'Kubernetes API',
    location: 'Cluster',
    role: 'Where CoreDNS learns service and pod addresses.',
  },
  {
    id: 'router-dnsmasq',
    displayName: 'dnsmasq',
    location: 'Primary Router',
    role: 'The front door of LAN DNS. Authoritative for home.arpa from a hosts file; keeps no cache and hands everything else to Unbound beside it.',
    signal: 'primaryRouter',
  },
  {
    id: 'router-unbound',
    displayName: 'Unbound',
    location: 'Primary Router',
    role: 'A recursive resolver: it walks the DNS tree itself, starting from a local copy of the root zone, instead of asking a public resolver.',
    signal: 'primaryRouter',
  },
  {
    id: 'mesh-unbound',
    displayName: 'Unbound',
    location: 'Mesh Node',
    role: 'The second LAN resolver. Also recursive, with an ad-block list; it sends home.arpa to the primary router.',
    signal: 'meshNode',
  },
  {
    id: 'blocky',
    displayName: 'Blocky',
    location: 'ASUSTOR NAS',
    role: 'An ad-blocking resolver with its own copy of the home.arpa names. It asks both routers at once and uses the faster answer. Nothing uses it by default.',
    signal: 'blocky',
  },
  {
    id: 'tailscale',
    displayName: 'Tailscale resolver',
    location: 'On each device that lets Tailscale manage its DNS',
    role: 'A small forwarder that Tailscale puts in front of the system resolver on hosts without systemd-resolved. It answers tailnet names itself and passes everything else on; those queries end up at the primary router like any other.',
  },
  {
    id: 'provider',
    displayName: 'Provider resolvers',
    location: 'Internet',
    role: "The cloud host's own resolvers.",
  },
  {
    id: 'authoritative',
    displayName: 'Authoritative servers',
    location: 'Internet',
    role: 'The servers that own each domain and hold the real answer.',
  },
];

export const DNS_CLIENTS = [
  {
    id: 'pod',
    displayName: 'A pod on most home nodes',
    detail: 'Control Plane 2 and 3, both GPU workers, GPU Workstation',
  },
  { id: 'pod-cp1', displayName: 'A pod on Control Plane 1', detail: "That node asks through Tailscale's forwarder" },
  { id: 'pod-vps', displayName: 'A pod on the Edge VPS', detail: 'The one node outside the home' },
  { id: 'lan', displayName: 'A device on the home LAN', detail: 'Using the DNS the router hands out' },
  { id: 'blocky-client', displayName: 'A device pointed at Blocky', detail: 'Opt-in ad blocking' },
  {
    id: 'tailscale-host',
    displayName: 'A host using Tailscale DNS',
    detail: 'Control Plane 1, the Mesh Node and the ASUSTOR themselves',
  },
];

export const DNS_NAME_KINDS = [
  { id: 'cluster', label: 'Cluster name', example: 'redis.default.svc.cluster.local' },
  { id: 'home', label: 'home.arpa name', example: 'grafana.home.arpa' },
  { id: 'internet', label: 'Internet name', example: 'github.com' },
];

const hop = (from, to, note, fallback = false) => ({ from, to, note, fallback });

// The pod's first two steps are the same everywhere.
const POD_ASKS = hop(
  'client',
  'node-local',
  'The pod asks the cluster DNS address. The node-local cache on its own node intercepts that and answers if it has the name cached.',
);
const CLUSTER_NAME = [
  POD_ASKS,
  hop('node-local', 'coredns', 'Cluster names are forwarded to CoreDNS, over TCP.'),
  hop('coredns', 'kube-api', 'CoreDNS answers from the service and pod records it watches in the Kubernetes API.'),
];
const POD_HOME = [
  POD_ASKS,
  hop('node-local', 'coredns', 'home.arpa is on the list of names that go to CoreDNS.'),
  hop('coredns', 'router-dnsmasq', 'CoreDNS forwards to the resolvers of the node its pod runs on: the primary router first.'),
  hop('coredns', 'mesh-unbound', 'Second choice if the primary router does not answer.', true),
  hop('mesh-unbound', 'router-dnsmasq', 'The mesh node passes home.arpa on to the primary router, the one place those names live.', true),
  hop('coredns', 'tailscale', 'The CoreDNS pod on Control Plane 1 goes through the Tailscale resolver instead, which sends home.arpa to the same two routers.', true),
];
const RECURSE = (from) => [
  hop(from, 'router-unbound', 'dnsmasq keeps no cache and hands the query to Unbound on the same router.'),
  hop('router-unbound', 'authoritative', 'Unbound resolves it itself, asking the servers that own the domain.'),
];
const NOT_RESOLVED = 'Nothing on this path knows cluster names: only CoreDNS does, and only pods reach it.';

export const DNS_PATHS = {
  'pod|cluster': { summary: 'Stays inside the cluster.', hops: CLUSTER_NAME },
  'pod|home': {
    summary: 'Through CoreDNS, then out to the primary router, which owns home.arpa.',
    hops: POD_HOME,
  },
  'pod|internet': {
    summary: "Skips CoreDNS: the node-local cache sends it straight to the node's own resolvers.",
    hops: [
      POD_ASKS,
      hop('node-local', 'router-dnsmasq', "Names that are not special go to the node's own resolvers, not to CoreDNS: the primary router first."),
      ...RECURSE('router-dnsmasq'),
      hop('node-local', 'mesh-unbound', 'Second choice if the primary router does not answer.', true),
      hop('mesh-unbound', 'authoritative', 'The mesh node resolves it itself, after checking its ad-block list.', true),
    ],
  },

  'pod-cp1|cluster': { summary: 'Stays inside the cluster.', hops: CLUSTER_NAME },
  'pod-cp1|home': {
    summary: 'Through CoreDNS, then out to the primary router, which owns home.arpa.',
    hops: POD_HOME,
  },
  'pod-cp1|internet': {
    summary: "One extra hop through Tailscale's forwarder, then the same route as every other home node.",
    hops: [
      POD_ASKS,
      hop('node-local', 'tailscale', "Names that are not special go to the node's own resolver, which on this node is Tailscale's forwarder."),
      hop('tailscale', 'router-dnsmasq', 'The forwarder passes it on, and it arrives at the primary router. Measured, not assumed: the answer leaves the network by the same exit as a query sent to the router directly.'),
      ...RECURSE('router-dnsmasq'),
    ],
  },

  'pod-vps|cluster': {
    summary: 'Crosses the tailnet to CoreDNS at home.',
    hops: [
      POD_ASKS,
      hop('node-local', 'coredns', 'Cluster names are forwarded to CoreDNS. Its pods run on the home servers, so this crosses the tailnet.'),
      CLUSTER_NAME[2],
    ],
  },
  'pod-vps|home': {
    summary: 'Crosses the tailnet to CoreDNS, then out to the primary router.',
    hops: POD_HOME,
  },
  'pod-vps|internet': {
    summary: "Resolved by the cloud host's resolvers; never touches the home network.",
    hops: [
      POD_ASKS,
      hop('node-local', 'provider', "Names that are not special go to the node's own resolvers, which here are the cloud host's."),
      hop('provider', 'authoritative', 'The provider resolves it.'),
    ],
  },

  'lan|cluster': { summary: NOT_RESOLVED, resolves: false, hops: [] },
  'lan|home': {
    summary: 'Answered by the primary router from its hosts file.',
    hops: [
      hop('client', 'router-dnsmasq', 'dnsmasq is authoritative for home.arpa and answers from its hosts file.'),
      hop('client', 'mesh-unbound', 'Devices that also list the second resolver fall back to the mesh node.', true),
      hop('mesh-unbound', 'router-dnsmasq', 'The mesh node passes home.arpa on to the primary router.', true),
    ],
  },
  'lan|internet': {
    summary: 'Resolved by Unbound on the primary router, with no public resolver in between.',
    hops: [
      hop('client', 'router-dnsmasq', 'The device asks the primary router.'),
      ...RECURSE('router-dnsmasq'),
      hop('client', 'mesh-unbound', 'Devices that also list the second resolver fall back to the mesh node.', true),
      hop('mesh-unbound', 'authoritative', 'The mesh node resolves it itself, after checking its ad-block list.', true),
    ],
  },

  'blocky-client|cluster': { summary: NOT_RESOLVED, resolves: false, hops: [] },
  'blocky-client|home': {
    summary: "Answered by Blocky from its own copy of the home.arpa names.",
    hops: [
      hop('client', 'blocky', 'Blocky holds its own hand-synced copy of the home.arpa names and answers directly.'),
    ],
  },
  'blocky-client|internet': {
    summary: 'Filtered by Blocky, then resolved by whichever router answers first.',
    hops: [
      hop('client', 'blocky', 'Blocky drops names on its ad, tracker and malware lists and answers the rest from cache if it can.'),
      hop('blocky', 'router-dnsmasq', 'It asks both routers at once and uses the faster answer.'),
      hop('blocky', 'mesh-unbound', 'It asks both routers at once and uses the faster answer.'),
      ...RECURSE('router-dnsmasq'),
      hop('mesh-unbound', 'authoritative', 'The mesh node resolves it itself.'),
    ],
  },

  'tailscale-host|cluster': { summary: NOT_RESOLVED, resolves: false, hops: [] },
  'tailscale-host|home': {
    summary: 'Tailscale sends home.arpa to the routers.',
    hops: [
      hop('client', 'tailscale', "The host's resolver is Tailscale's local one."),
      hop('tailscale', 'router-dnsmasq', 'Headscale routes home.arpa to the primary router.'),
      hop('tailscale', 'mesh-unbound', 'Or to the mesh node, which passes it on.', true),
      hop('mesh-unbound', 'router-dnsmasq', 'The mesh node passes home.arpa on to the primary router.', true),
    ],
  },
  'tailscale-host|internet': {
    summary: "Through Tailscale's forwarder, then resolved by the primary router like any LAN device's query.",
    hops: [
      hop('client', 'tailscale', "The host's resolver is Tailscale's local forwarder."),
      hop('tailscale', 'router-dnsmasq', 'The forwarder passes it on, and it arrives at the primary router.'),
      ...RECURSE('router-dnsmasq'),
    ],
  },
};
