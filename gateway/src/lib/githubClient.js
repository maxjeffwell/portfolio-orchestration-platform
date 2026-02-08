import https from 'node:https';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'maxjeffwell';

const REPOS = [
  { name: 'devops-portfolio-manager', displayName: 'PodRick' },
  { name: 'portfolio-orchestration-platform', displayName: 'POP' },
  { name: 'k8s-multi-tenant-platform', displayName: 'TenantFlow' },
  { name: 'microservices-platform', displayName: 'Vertex Platform' },
];

function githubGet(path) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'graphql-gateway',
      Accept: 'application/vnd.github+json',
    };
    if (GITHUB_TOKEN) headers.Authorization = `token ${GITHUB_TOKEN}`;

    https.get(
      `https://api.github.com${path}`,
      { headers },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error(`Invalid JSON from GitHub: ${body.slice(0, 200)}`));
          }
        });
      },
    ).on('error', reject);
  });
}

export async function fetchRecentRuns() {
  const allRuns = [];

  const results = await Promise.allSettled(
    REPOS.map(async (repo) => {
      const data = await githubGet(
        `/repos/${GITHUB_OWNER}/${repo.name}/actions/runs?per_page=5`,
      );
      return (data.workflow_runs || []).map((run) => ({
        runId: String(run.id),
        name: run.name,
        repo: repo.name,
        repoDisplayName: repo.displayName,
        conclusion: run.conclusion || 'pending',
        htmlUrl: run.html_url || '',
        createdAt: run.created_at,
      }));
    }),
  );

  for (const result of results) {
    if (result.status === 'fulfilled') allRuns.push(...result.value);
  }

  allRuns.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return allRuns.slice(0, 10);
}
