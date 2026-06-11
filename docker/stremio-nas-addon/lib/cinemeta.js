'use strict';

const norm = (s) => s.toLowerCase().normalize('NFKD')
  .replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();

function metaYear(meta) {
  const y = parseInt(String(meta.releaseInfo ?? meta.year ?? '').slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

// type: 'movie' | 'series'. Returns { id, name, poster } or null.
// Strict: normalized-title equality required; if we have a year, it must be within ±1.
async function matchCinemeta(type, title, year, fetchFn = fetch) {
  const url = `https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(title)}.json`;
  const res = await fetchFn(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`cinemeta ${res.status}`);
  let body;
  try { body = await res.json(); } catch { return null; }
  const want = norm(title);
  const candidates = (body.metas || []).filter((m) => norm(m.name || '') === want);
  if (candidates.length === 0) return null;
  let hit;
  if (year != null) {
    hit = candidates.find((m) => metaYear(m) != null && Math.abs(metaYear(m) - year) <= 1);
    if (!hit) return null;
  } else {
    hit = candidates[0];
  }
  return { id: hit.id, name: hit.name, poster: hit.poster };
}

module.exports = { matchCinemeta, norm };
