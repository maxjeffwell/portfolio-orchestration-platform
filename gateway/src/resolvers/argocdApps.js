import { fetchArgoCDApps } from '../lib/argocdClient.js';

const INTERVAL_MS = parseInt(process.env.ARGOCD_POLL_INTERVAL_MS || '60000', 10);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const argocdResolvers = {
  Query: {
    argoCDApplications: () => fetchArgoCDApps(),
  },

  Subscription: {
    argoCDAppsStream: {
      subscribe: async function* () {
        while (true) {
          try {
            const apps = await fetchArgoCDApps();
            yield { argoCDAppsStream: apps };
          } catch (err) {
            console.error('[Subscription] argoCDApps error:', err.message);
          }
          await sleep(INTERVAL_MS);
        }
      },
    },
  },
};
