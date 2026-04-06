const GARAGE_ADMIN_URL =
  process.env.GARAGE_ADMIN_URL ||
  'http://garage.monitoring.svc.cluster.local:3903';
const GARAGE_ADMIN_TOKEN = process.env.GARAGE_ADMIN_TOKEN || '';

async function garageGet(path) {
  try {
    const res = await fetch(`${GARAGE_ADMIN_URL}${path}`, {
      headers: GARAGE_ADMIN_TOKEN
        ? { Authorization: `Bearer ${GARAGE_ADMIN_TOKEN}` }
        : {},
    });
    if (!res.ok) return null;
    return res.json();
  } catch (err) {
    console.error('[garageAdmin]', path, err.message);
    return null;
  }
}

export async function fetchGarageStatus() {
  const [status, layout] = await Promise.all([
    garageGet('/v1/status'),
    garageGet('/v1/layout'),
  ]);

  if (!status) return { healthy: false, nodes: [], buckets: [] };

  const nodes = (status.nodes ?? []).map((n) => ({
    id: n.id,
    hostname: n.hostname,
    zone: n.zone,
    isUp: n.isUp ?? n.is_up ?? false,
    dataPartitionCount: n.dataPartitionCount ?? n.data_partition_count ?? 0,
  }));

  const buckets = layout?.roles
    ?.filter((r) => r.zone)
    ?.map((r) => ({ id: r.id, zone: r.zone, capacity: r.capacity })) ?? [];

  return { healthy: status.knownNodes?.length > 0, nodes, buckets };
}
