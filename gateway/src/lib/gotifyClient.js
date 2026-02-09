const GOTIFY_URL = process.env.GOTIFY_URL || 'http://gotify.monitoring.svc:80';
const GOTIFY_TOKEN = process.env.GOTIFY_TOKEN || '';

export async function sendNotification({ title, message, priority = 5 }) {
  if (!GOTIFY_TOKEN) {
    throw new Error('GOTIFY_TOKEN not configured');
  }

  const res = await fetch(`${GOTIFY_URL}/message?token=${GOTIFY_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, message, priority }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gotify error ${res.status}: ${body}`);
  }

  return res.json();
}
