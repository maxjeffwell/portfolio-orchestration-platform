const CROWDSEC_LAPI_URL =
  process.env.CROWDSEC_LAPI_URL || 'http://10.0.0.4:8080';
const CROWDSEC_API_KEY = process.env.CROWDSEC_API_KEY || '';

async function crowdsecGet(path) {
  try {
    const res = await fetch(`${CROWDSEC_LAPI_URL}${path}`, {
      headers: CROWDSEC_API_KEY
        ? { 'X-Api-Key': CROWDSEC_API_KEY }
        : {},
    });
    if (!res.ok) return null;
    return res.json();
  } catch (err) {
    console.error('[crowdsec]', path, err.message);
    return null;
  }
}

export async function fetchCrowdSecTopology() {
  const [machines, bouncers] = await Promise.all([
    crowdsecGet('/v1/machines'),
    crowdsecGet('/v1/bouncers'),
  ]);

  return {
    machines: (machines ?? []).map((m) => ({
      machineId: m.machineId,
      ipAddress: m.ipAddress,
      isValidated: m.isValidated,
      lastPush: m.lastPush,
    })),
    bouncers: (bouncers ?? []).map((b) => ({
      name: b.name,
      ipAddress: b.ip_address,
      type: b.type,
      lastPull: b.last_pull,
    })),
  };
}
