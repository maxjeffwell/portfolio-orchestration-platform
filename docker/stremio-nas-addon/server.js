'use strict';
const http = require('node:http');
const fsp = require('node:fs/promises');
const { buildIndex, loadPersistedIndex } = require('./lib/library');
const { matchCinemeta } = require('./lib/cinemeta');
const { resolveFileId, serveFile } = require('./lib/files');

const PORT = Number(process.env.PORT || 7000);
const MOVIES_DIR = process.env.MOVIES_DIR || '/media/movies';
const TV_DIR = process.env.TV_DIR || '/media/tv';
const DATA_DIR = process.env.DATA_DIR || '/data';
const HTTPS_BASE = (process.env.PUBLIC_HTTPS_BASE || '').replace(/\/$/, '');
const LAN_BASE = (process.env.PUBLIC_LAN_BASE || '').replace(/\/$/, '');
const RESCAN_MS = Number(process.env.RESCAN_HOURS || 12) * 3600 * 1000;
const ROOTS = { movies: MOVIES_DIR, tv: TV_DIR };

const MANIFEST = {
  id: 'me.el-jefe.nas-library',
  version: '1.0.1',
  name: 'NAS Library',
  description: 'Movies and TV Shows from the ASUSTOR NAS',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  idPrefixes: ['tt', 'nas:'],
  // Same catalog id for both types (like Cinemeta's 'top'): Discover keeps the
  // catalog id when the user switches type, so distinct ids break the toggle
  // with a misleading "Addon not installed".
  catalogs: [
    { type: 'movie', id: 'nas', name: 'NAS Movies', extra: [{ name: 'search' }, { name: 'skip' }] },
    { type: 'series', id: 'nas', name: 'NAS TV', extra: [{ name: 'search' }, { name: 'skip' }] },
  ],
};

let index = { movies: [], series: [] };
let movieById = new Map();
let seriesById = new Map();

function setIndex(next) {
  index = next;
  movieById = new Map(index.movies.map((m) => [m.id, m]));
  seriesById = new Map(index.series.map((s) => [s.id, s]));
}

async function rescan() {
  try {
    setIndex(await buildIndex({
      moviesDir: MOVIES_DIR, tvDir: TV_DIR, dataDir: DATA_DIR, match: matchCinemeta,
    }));
    console.log(`scan ok: ${index.movies.length} movies, ${index.series.length} series`);
  } catch (err) {
    console.error('scan failed, keeping previous index:', err.message);
  } finally {
    setTimeout(rescan, RESCAN_MS).unref();
  }
}

const toMeta = (type, item) => ({
  id: item.id, type, name: item.name, poster: item.poster,
  releaseInfo: item.year ? String(item.year) : undefined,
});

// The addon can't know which network the player is on -> offer both URLs.
function streamsFor(entry) {
  const out = [];
  if (HTTPS_BASE) out.push({ name: 'NAS tailnet', title: entry.filename, url: `${HTTPS_BASE}/file/${entry.fileId}` });
  if (LAN_BASE) out.push({ name: 'NAS LAN', title: entry.filename, url: `${LAN_BASE}/file/${entry.fileId}` });
  return out;
}

function json(res, body, code = 200) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(res.req.method === 'HEAD' ? undefined : JSON.stringify(body));
}

// Extra segment is '&'-separated key=value pairs, already URL-decoded by the
// router (so no URLSearchParams here — it would mangle '+' into spaces).
function parseExtra(extra) {
  const params = {};
  for (const part of (extra || '').split('&')) {
    const eq = part.indexOf('=');
    if (eq > 0) params[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return params;
}

const PAGE_SIZE = 100;

function applyExtra(items, extra) {
  const params = parseExtra(extra);
  let out = items;
  if (params.search) {
    const q = params.search.toLowerCase();
    out = out.filter((i) => i.name.toLowerCase().includes(q));
  }
  const skip = Number(params.skip) || 0;
  return out.slice(skip, skip + PAGE_SIZE);
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }

  const segs = new URL(req.url, 'http://localhost').pathname
    .split('/').filter(Boolean).map(decodeURIComponent);

  try {
    if (segs[0] === 'health') {
      return json(res, { status: 'ok', movies: index.movies.length, series: index.series.length });
    }
    if (segs[0] === 'manifest.json') return json(res, MANIFEST);

    if (segs[0] === 'catalog' && (segs.length === 3 || segs.length === 4)) {
      const [, type, rawId] = segs;
      const catalogId = rawId.replace(/\.json$/, '');
      const extra = segs.length === 4 ? segs[3].replace(/\.json$/, '') : null;
      // 'nas-movies'/'nas-tv' kept for clients holding the 1.0.0 manifest.
      if (type === 'movie' && (catalogId === 'nas' || catalogId === 'nas-movies')) {
        return json(res, { metas: applyExtra(index.movies, extra).map((m) => toMeta('movie', m)) });
      }
      if (type === 'series' && (catalogId === 'nas' || catalogId === 'nas-tv')) {
        return json(res, { metas: applyExtra(index.series, extra).map((s) => toMeta('series', s)) });
      }
      return json(res, { metas: [] });
    }

    if (segs[0] === 'meta' && segs.length === 3) {
      const [, type, rawId] = segs;
      const id = rawId.replace(/\.json$/, '');
      if (!id.startsWith('nas:')) return json(res, {}, 404); // Cinemeta owns tt ids
      if (type === 'movie' && movieById.has(id)) {
        return json(res, { meta: toMeta('movie', movieById.get(id)) });
      }
      if (type === 'series' && seriesById.has(id)) {
        const s = seriesById.get(id);
        const videos = Object.keys(s.episodes).map((k) => {
          const [season, episode] = k.split(':').map(Number);
          return {
            id: `${s.id}:${season}:${episode}`, season, episode,
            title: `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`,
          };
        });
        return json(res, { meta: { ...toMeta('series', s), videos } });
      }
      return json(res, {}, 404);
    }

    if (segs[0] === 'stream' && segs.length === 3) {
      const [, type, rawId] = segs;
      const id = rawId.replace(/\.json$/, '');
      if (type === 'movie') {
        const m = movieById.get(id);
        return json(res, { streams: m && m.fileId ? streamsFor(m) : [] });
      }
      if (type === 'series') {
        const parts = id.split(':');
        const episode = Number(parts.pop());
        const season = Number(parts.pop());
        const s = seriesById.get(parts.join(':'));
        const ep = s && s.episodes[`${season}:${episode}`];
        return json(res, { streams: ep ? streamsFor(ep) : [] });
      }
      return json(res, { streams: [] });
    }

    if (segs[0] === 'file' && segs.length === 2) {
      const abs = await resolveFileId(ROOTS, segs[1]);
      if (!abs) { res.writeHead(404); return res.end(); }
      const stat = await fsp.stat(abs);
      return serveFile(req, res, abs, stat.size);
    }

    res.writeHead(404);
    res.end();
  } catch (err) {
    console.error('request error:', req.url, err.message);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});

(async () => {
  const persisted = await loadPersistedIndex(DATA_DIR);
  if (persisted) setIndex(persisted);
  server.listen(PORT, () => console.log(`nas-addon listening on :${PORT}`));
  await rescan();
})();
