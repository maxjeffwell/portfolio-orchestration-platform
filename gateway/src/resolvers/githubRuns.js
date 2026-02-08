import { fetchRecentRuns } from '../lib/githubClient.js';

const INTERVAL_MS = parseInt(process.env.GITHUB_POLL_INTERVAL_MS || '60000', 10);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const githubResolvers = {
  Query: {
    recentGitHubRuns: () => fetchRecentRuns(),
  },

  Subscription: {
    githubRunsStream: {
      subscribe: async function* () {
        while (true) {
          try {
            const runs = await fetchRecentRuns();
            yield { githubRunsStream: runs };
          } catch (err) {
            console.error('[Subscription] githubRuns error:', err.message);
          }
          await sleep(INTERVAL_MS);
        }
      },
    },
  },
};
