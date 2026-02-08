import https from 'node:https';

const ARGOCD_SERVER = process.env.ARGOCD_SERVER || 'argocd-server.argocd.svc:443';
const ARGOCD_USERNAME = process.env.ARGOCD_USERNAME;
const ARGOCD_PASSWORD = process.env.ARGOCD_PASSWORD;

if (!ARGOCD_USERNAME || !ARGOCD_PASSWORD) {
  console.warn('[ArgoCD] ARGOCD_USERNAME/ARGOCD_PASSWORD not set — ArgoCD subscriptions will fail');
}

const agent = new https.Agent({ rejectUnauthorized: false });

let cachedToken = null;
let tokenExpiresAt = 0;

function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { ...options, agent }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          reject(new Error(`Invalid JSON from ArgoCD: ${body.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const { data } = await httpsRequest(
    `https://${ARGOCD_SERVER}/api/v1/session`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ARGOCD_USERNAME, password: ARGOCD_PASSWORD }),
    },
  );

  cachedToken = data.token;
  // Refresh 5 minutes before expiry (ArgoCD tokens last ~24h)
  tokenExpiresAt = Date.now() + 23 * 60 * 60 * 1000;
  return cachedToken;
}

export async function fetchArgoCDApps() {
  const token = await getToken();
  const { data } = await httpsRequest(
    `https://${ARGOCD_SERVER}/api/v1/applications`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  const items = data.items || [];
  return items.map((app) => ({
    name: app.metadata?.name || 'unknown',
    namespace: app.metadata?.namespace || '',
    healthStatus: app.status?.health?.status || 'Unknown',
    syncStatus: app.status?.sync?.status || 'Unknown',
    syncRevision: app.status?.sync?.revision || '',
    repoURL: app.spec?.source?.repoURL || '',
    path: app.spec?.source?.path || '',
  }));
}
