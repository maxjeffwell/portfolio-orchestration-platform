# Stremio NAS Addon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A self-hosted Stremio addon exposing the ASUSTOR NAS Movies + TV Shows as catalogs and stream sources, serving video with Range support.

**Architecture:** Single dependency-free Node.js service (scanner → Cinemeta IMDB matcher → JSON addon API → Range file streamer), containerized and deployed as a 3-container pod (addon + nginx TLS + tailscale) pinned to debian-marmoset with read-only NFS mounts. Spec: `docs/superpowers/specs/2026-06-11-stremio-nas-addon-design.md`.

**Tech Stack:** Node 22 (built-in `node:test`, no runtime deps), Docker (`maxjeffwell/stremio-nas-addon`), k8s manual-apply manifests in this repo.

**Pre-verified cluster facts (2026-06-11):** ports 7000/7010 free on debian-marmoset; LAN IP is `192.168.50.152` (bond0); Doppler key `STREMIO_TS_AUTHKEY` via ClusterSecretStore `doppler-secret-store`; ClusterIssuer `letsencrypt-prod-dns`; stremio's tailscale Role rules = create secrets + get/update/patch on the state secret.

**Working directory for Tasks 1–7:** `/home/maxjeffwell/GitHub_Projects/portfolio-orchestration-platform/docker/stremio-nas-addon/`

---

### Task 1: Project scaffold

**Files:**
- Create: `docker/stremio-nas-addon/package.json`
- Create: `docker/stremio-nas-addon/.dockerignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "stremio-nas-addon",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "node --test test/"
  }
}
```

- [ ] **Step 2: Create .dockerignore**

```
test
node_modules
*.md
```

- [ ] **Step 3: Verify test runner works (expect "no tests found" style pass)**

Run: `cd docker/stremio-nas-addon && npm test`
Expected: exits 0 with 0 tests (or "could not find tests" — fine, directory is empty).

- [ ] **Step 4: Commit**

```bash
git add docker/stremio-nas-addon
git commit -m "feat(stremio-nas-addon): scaffold project"
```

---

### Task 2: Filename parser (`lib/parse.js`)

**Files:**
- Create: `docker/stremio-nas-addon/lib/parse.js`
- Test: `docker/stremio-nas-addon/test/parse.test.js`

- [ ] **Step 1: Write the failing tests**

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { isVideo, parseMovieName, parseShowDirName, parseEpisodePath } = require('../lib/parse');

test('isVideo accepts video extensions, rejects others', () => {
  assert.ok(isVideo('a.mkv'));
  assert.ok(isVideo('a.MP4'));
  assert.ok(isVideo('a.webm'));
  assert.ok(!isVideo('a.srt'));
  assert.ok(!isVideo('a.jpg'));
  assert.ok(!isVideo('mkv'));
});

test('parseMovieName: "Title (Year).ext"', () => {
  assert.deepStrictEqual(parseMovieName('The Matrix (1999).mkv'),
    { title: 'The Matrix', year: 1999 });
});

test('parseMovieName: dotted scene-style names', () => {
  assert.deepStrictEqual(parseMovieName('Blade.Runner.2049.2017.2160p.BluRay.x265.mkv'),
    { title: 'Blade Runner 2049', year: 2017 });
});

test('parseMovieName: no year falls back to cleaned title', () => {
  assert.deepStrictEqual(parseMovieName('Some_Home_Video.mp4'),
    { title: 'Some Home Video', year: null });
});

test('parseShowDirName: "Show (Year)" and bare', () => {
  assert.deepStrictEqual(parseShowDirName('Severance (2022)'), { title: 'Severance', year: 2022 });
  assert.deepStrictEqual(parseShowDirName('The Wire'), { title: 'The Wire', year: null });
});

test('parseEpisodePath: SxxEyy', () => {
  assert.deepStrictEqual(parseEpisodePath('The Wire/Season 1/The.Wire.S01E03.mkv'),
    { season: 1, episode: 3 });
});

test('parseEpisodePath: NxNN', () => {
  assert.deepStrictEqual(parseEpisodePath('The Wire/the wire 1x05.mkv'),
    { season: 1, episode: 5 });
});

test('parseEpisodePath: Season dir + leading episode number', () => {
  assert.deepStrictEqual(parseEpisodePath('Show/Season 2/07 - The One With The Thing.mkv'),
    { season: 2, episode: 7 });
});

test('parseEpisodePath: unparsable returns null', () => {
  assert.strictEqual(parseEpisodePath('Show/extras/behind-the-scenes.mkv'), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/parse'`

- [ ] **Step 3: Implement `lib/parse.js`**

```js
'use strict';

const VIDEO_EXT = /\.(mkv|mp4|avi|m4v|ts|webm)$/i;

const isVideo = (name) => VIDEO_EXT.test(name);

const clean = (s) => s.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();

// "Title (1999).mkv" | "Title.1999.1080p.x264.mkv" -> { title, year }
function parseMovieName(filename) {
  const base = filename.replace(VIDEO_EXT, '');
  const m = base.match(/^(.+?)[ ._([]+((?:19|20)\d{2})(?:\D|$)/);
  if (m) return { title: clean(m[1]), year: Number(m[2]) };
  return { title: clean(base), year: null };
}

// "Severance (2022)" -> { title, year }; bare name -> year null
function parseShowDirName(dirname) {
  const m = dirname.match(/^(.+?)[ ._(]+((?:19|20)\d{2})\)?$/);
  if (m) return { title: clean(m[1]), year: Number(m[2]) };
  return { title: clean(dirname), year: null };
}

// relPath like "Show/Season 1/Show.S01E03.mkv" -> { season, episode } | null
function parseEpisodePath(relPath) {
  const parts = relPath.split('/');
  const file = parts[parts.length - 1];
  let m = file.match(/S(\d{1,2})[ ._-]?E(\d{1,3})/i);
  if (m) return { season: Number(m[1]), episode: Number(m[2]) };
  m = file.match(/(?:^|\D)(\d{1,2})x(\d{2,3})(?:\D|$)/i);
  if (m) return { season: Number(m[1]), episode: Number(m[2]) };
  const seasonDir = parts.slice(0, -1).reverse()
    .find((p) => /^season[ ._-]*\d{1,2}$/i.test(p));
  if (seasonDir) {
    const season = Number(seasonDir.match(/(\d{1,2})/)[1]);
    m = file.match(/^(\d{1,3})\b/);
    if (m) return { season, episode: Number(m[1]) };
  }
  return null;
}

module.exports = { isVideo, parseMovieName, parseShowDirName, parseEpisodePath };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all parse tests PASS.

- [ ] **Step 5: Commit**

```bash
git add docker/stremio-nas-addon/lib/parse.js docker/stremio-nas-addon/test/parse.test.js
git commit -m "feat(stremio-nas-addon): filename parser"
```

---

### Task 3: File ids, path safety, Range streaming (`lib/files.js`)

**Files:**
- Create: `docker/stremio-nas-addon/lib/files.js`
- Test: `docker/stremio-nas-addon/test/files.test.js`

- [ ] **Step 1: Write the failing tests**

```js
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { makeFileId, resolveFileId, serveFile } = require('../lib/files');

let root, outside, roots, server, port;

before(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), 'nas-root-'));
  outside = await fsp.mkdtemp(path.join(os.tmpdir(), 'nas-outside-'));
  await fsp.mkdir(path.join(root, 'sub'));
  await fsp.writeFile(path.join(root, 'sub', 'movie.mp4'), '0123456789'); // 10 bytes
  await fsp.writeFile(path.join(outside, 'secret.txt'), 'secret');
  await fsp.symlink(path.join(outside, 'secret.txt'), path.join(root, 'escape.mp4'));
  roots = { movies: root };
  server = http.createServer(async (req, res) => {
    const fileId = req.url.slice('/file/'.length);
    const abs = await resolveFileId(roots, fileId);
    if (!abs) { res.writeHead(404); return res.end(); }
    const stat = await fsp.stat(abs);
    serveFile(req, res, abs, stat.size);
  });
  await new Promise((r) => server.listen(0, () => r()));
  port = server.address().port;
});

after(async () => {
  server.close();
  await fsp.rm(root, { recursive: true, force: true });
  await fsp.rm(outside, { recursive: true, force: true });
});

test('round-trip: makeFileId -> resolveFileId', async () => {
  const abs = await resolveFileId(roots, makeFileId('movies', 'sub/movie.mp4'));
  assert.strictEqual(abs, await fsp.realpath(path.join(root, 'sub', 'movie.mp4')));
});

test('rejects traversal, unknown root, junk, symlink escape', async () => {
  const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url');
  assert.strictEqual(await resolveFileId(roots, b64('movies/../../etc/passwd')), null);
  assert.strictEqual(await resolveFileId(roots, b64('nope/sub/movie.mp4')), null);
  assert.strictEqual(await resolveFileId(roots, '!!!not-base64url@@@'), null);
  assert.strictEqual(await resolveFileId(roots, b64('movies/escape.mp4')), null);
});

test('full GET returns 200 with size and type', async () => {
  const res = await fetch(`http://127.0.0.1:${port}/file/${makeFileId('movies', 'sub/movie.mp4')}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('content-length'), '10');
  assert.strictEqual(res.headers.get('content-type'), 'video/mp4');
  assert.strictEqual(res.headers.get('accept-ranges'), 'bytes');
  assert.strictEqual(await res.text(), '0123456789');
});

test('Range GET returns 206 with correct slice', async () => {
  const res = await fetch(`http://127.0.0.1:${port}/file/${makeFileId('movies', 'sub/movie.mp4')}`,
    { headers: { Range: 'bytes=2-5' } });
  assert.strictEqual(res.status, 206);
  assert.strictEqual(res.headers.get('content-range'), 'bytes 2-5/10');
  assert.strictEqual(await res.text(), '2345');
});

test('open-ended and suffix ranges', async () => {
  const id = makeFileId('movies', 'sub/movie.mp4');
  let res = await fetch(`http://127.0.0.1:${port}/file/${id}`, { headers: { Range: 'bytes=7-' } });
  assert.strictEqual(await res.text(), '789');
  res = await fetch(`http://127.0.0.1:${port}/file/${id}`, { headers: { Range: 'bytes=-3' } });
  assert.strictEqual(await res.text(), '789');
});

test('unsatisfiable range returns 416', async () => {
  const res = await fetch(`http://127.0.0.1:${port}/file/${makeFileId('movies', 'sub/movie.mp4')}`,
    { headers: { Range: 'bytes=50-60' } });
  assert.strictEqual(res.status, 416);
  assert.strictEqual(res.headers.get('content-range'), 'bytes */10');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/files'`

- [ ] **Step 3: Implement `lib/files.js`**

```js
'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const MIME = {
  '.mkv': 'video/x-matroska', '.mp4': 'video/mp4', '.m4v': 'video/mp4',
  '.avi': 'video/x-msvideo', '.ts': 'video/mp2t', '.webm': 'video/webm',
};

const makeFileId = (rootKey, relPath) =>
  Buffer.from(`${rootKey}/${relPath}`, 'utf8').toString('base64url');

// fileId -> absolute real path, or null if it escapes the roots in any way
async function resolveFileId(roots, fileId) {
  if (!/^[A-Za-z0-9_-]+$/.test(fileId)) return null;
  const decoded = Buffer.from(fileId, 'base64url').toString('utf8');
  const slash = decoded.indexOf('/');
  if (slash < 1) return null;
  const root = roots[decoded.slice(0, slash)];
  if (!root) return null;
  const abs = path.resolve(root, decoded.slice(slash + 1));
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  let real, realRoot;
  try {
    real = await fsp.realpath(abs);
    realRoot = await fsp.realpath(root);
  } catch { return null; }
  if (real !== realRoot && !real.startsWith(realRoot + path.sep)) return null;
  return real;
}

function serveFile(req, res, absPath, size) {
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', MIME[path.extname(absPath).toLowerCase()] || 'application/octet-stream');
  const m = (req.headers.range || '').match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] !== '' || m[2] !== '')) {
    let start = m[1] === '' ? size - Number(m[2]) : Number(m[1]);
    let end = m[1] !== '' && m[2] !== '' ? Number(m[2]) : size - 1;
    if (start < 0) start = 0;
    if (end >= size) end = size - 1;
    if (start > end || start >= size) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': end - start + 1,
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(absPath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Length': size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(absPath).pipe(res);
  }
}

module.exports = { MIME, makeFileId, resolveFileId, serveFile };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all files tests PASS (parse tests still green).

- [ ] **Step 5: Commit**

```bash
git add docker/stremio-nas-addon/lib/files.js docker/stremio-nas-addon/test/files.test.js
git commit -m "feat(stremio-nas-addon): file ids, path safety, range streaming"
```

---

### Task 4: Cinemeta matcher (`lib/cinemeta.js`)

**Files:**
- Create: `docker/stremio-nas-addon/lib/cinemeta.js`
- Test: `docker/stremio-nas-addon/test/cinemeta.test.js`

- [ ] **Step 1: Write the failing tests**

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { matchCinemeta } = require('../lib/cinemeta');

const fakeFetch = (metas) => async (url) => ({
  ok: true,
  json: async () => ({ metas }),
});

test('exact normalized title + year within 1 matches', async () => {
  const metas = [
    { id: 'tt0133093', name: 'The Matrix', releaseInfo: '1999', poster: 'p1' },
    { id: 'tt9999999', name: 'The Matrix Revisited', releaseInfo: '1999', poster: 'p2' },
  ];
  assert.deepStrictEqual(await matchCinemeta('movie', 'The Matrix', 1999, fakeFetch(metas)),
    { id: 'tt0133093', name: 'The Matrix', poster: 'p1' });
});

test('title matches but year too far -> null (no guessing)', async () => {
  const metas = [{ id: 'tt1', name: 'Crash', releaseInfo: '1996' }];
  assert.strictEqual(await matchCinemeta('movie', 'Crash', 2004, fakeFetch(metas)), null);
});

test('normalization ignores punctuation and case', async () => {
  const metas = [{ id: 'tt2', name: 'WALL·E', releaseInfo: '2008', poster: 'p' }];
  assert.deepStrictEqual(await matchCinemeta('movie', 'walle', 2008, fakeFetch(metas)),
    { id: 'tt2', name: 'WALL·E', poster: 'p' });
});

test('no year: first exact-title candidate wins', async () => {
  const metas = [
    { id: 'tt3', name: 'Dune', releaseInfo: '2021', poster: 'a' },
    { id: 'tt4', name: 'Dune', releaseInfo: '1984', poster: 'b' },
  ];
  assert.deepStrictEqual(await matchCinemeta('movie', 'Dune', null, fakeFetch(metas)),
    { id: 'tt3', name: 'Dune', poster: 'a' });
});

test('no exact-title candidate -> null', async () => {
  const metas = [{ id: 'tt5', name: 'Dune: Part Two', releaseInfo: '2024' }];
  assert.strictEqual(await matchCinemeta('movie', 'Dune', 2021, fakeFetch(metas)), null);
});

test('non-OK response throws', async () => {
  const badFetch = async () => ({ ok: false, status: 502 });
  await assert.rejects(() => matchCinemeta('movie', 'X', 2000, badFetch));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/cinemeta'`

- [ ] **Step 3: Implement `lib/cinemeta.js`**

```js
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
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`cinemeta ${res.status}`);
  const body = await res.json();
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all cinemeta tests PASS.

- [ ] **Step 5: Commit**

```bash
git add docker/stremio-nas-addon/lib/cinemeta.js docker/stremio-nas-addon/test/cinemeta.test.js
git commit -m "feat(stremio-nas-addon): cinemeta imdb matcher"
```

---

### Task 5: Scanner + index builder (`lib/library.js`)

**Files:**
- Create: `docker/stremio-nas-addon/lib/library.js`
- Test: `docker/stremio-nas-addon/test/library.test.js`

- [ ] **Step 1: Write the failing tests**

```js
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { buildIndex, loadPersistedIndex } = require('../lib/library');

let base, moviesDir, tvDir, dataDir;

before(async () => {
  base = await fsp.mkdtemp(path.join(os.tmpdir(), 'nas-lib-'));
  moviesDir = path.join(base, 'movies');
  tvDir = path.join(base, 'tv');
  dataDir = path.join(base, 'data');
  await fsp.mkdir(path.join(moviesDir, 'The Matrix (1999)'), { recursive: true });
  await fsp.writeFile(path.join(moviesDir, 'The Matrix (1999)', 'The.Matrix.1999.mkv'), 'x');
  await fsp.writeFile(path.join(moviesDir, 'Unknown Indie Film.mp4'), 'x');
  await fsp.writeFile(path.join(moviesDir, 'cover.jpg'), 'x'); // ignored
  await fsp.mkdir(path.join(tvDir, 'The Wire', 'Season 1'), { recursive: true });
  await fsp.writeFile(path.join(tvDir, 'The Wire', 'Season 1', 'The.Wire.S01E01.mkv'), 'x');
  await fsp.writeFile(path.join(tvDir, 'The Wire', 'Season 1', 'The.Wire.S01E02.mkv'), 'x');
});

after(async () => { await fsp.rm(base, { recursive: true, force: true }); });

// Matcher stub: knows The Matrix and The Wire, rejects everything else,
// and counts calls so we can assert the cache prevents re-querying.
let calls = 0;
const stubMatch = async (type, title) => {
  calls += 1;
  if (type === 'movie' && title === 'The Matrix') return { id: 'tt0133093', name: 'The Matrix', poster: 'p' };
  if (type === 'series' && title === 'The Wire') return { id: 'tt0306414', name: 'The Wire', poster: 'q' };
  return null;
};

test('buildIndex: matched, unmatched, episodes, persistence, cache', async () => {
  const index = await buildIndex({ moviesDir, tvDir, dataDir, match: stubMatch });

  const matrix = index.movies.find((m) => m.id === 'tt0133093');
  assert.ok(matrix, 'matched movie keyed by imdb id');
  assert.strictEqual(matrix.name, 'The Matrix');
  assert.ok(matrix.fileId.length > 0);

  const indie = index.movies.find((m) => m.id.startsWith('nas:'));
  assert.ok(indie, 'unmatched movie gets nas: id');
  assert.strictEqual(indie.name, 'Unknown Indie Film');

  assert.strictEqual(index.movies.length, 2, 'jpg ignored');

  const wire = index.series.find((s) => s.id === 'tt0306414');
  assert.ok(wire);
  assert.deepStrictEqual(Object.keys(wire.episodes).sort(), ['1:1', '1:2']);

  // persisted
  const persisted = await loadPersistedIndex(dataDir);
  assert.strictEqual(persisted.movies.length, 2);

  // second build: positive matches come from cache (only the unmatched title re-queries)
  const callsAfterFirst = calls;
  await buildIndex({ moviesDir, tvDir, dataDir, match: stubMatch });
  assert.strictEqual(calls - callsAfterFirst, 1, 'only unmatched title re-queried');
});

test('buildIndex: matcher throwing leaves items unmatched but index builds', async () => {
  const dataDir2 = path.join(base, 'data2');
  const boom = async () => { throw new Error('cinemeta down'); };
  const index = await buildIndex({ moviesDir, tvDir, dataDir: dataDir2, match: boom });
  assert.strictEqual(index.movies.length, 2);
  assert.ok(index.movies.every((m) => m.id.startsWith('nas:')));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/library'`

- [ ] **Step 3: Implement `lib/library.js`**

```js
'use strict';
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { isVideo, parseMovieName, parseShowDirName, parseEpisodePath } = require('./parse');
const { makeFileId } = require('./files');

const nasId = (key) => 'nas:' + crypto.createHash('sha1').update(key).digest('hex').slice(0, 12);

async function walk(dir, base = '') {
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walk(path.join(dir, e.name), rel)));
    else if (e.isFile() && isVideo(e.name)) out.push(rel);
  }
  return out;
}

async function loadJson(file, fallback) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return fallback; }
}

async function buildIndex({ moviesDir, tvDir, dataDir, match }) {
  const cacheFile = path.join(dataDir, 'match-cache.json');
  const cache = await loadJson(cacheFile, {});
  // Only positive matches are cached, so misses (and matcher outages) retry next scan.
  const lookup = async (type, title, year) => {
    const key = `${type}|${title.toLowerCase()}|${year ?? ''}`;
    if (key in cache) return cache[key];
    try {
      const hit = await match(type, title, year);
      if (hit) cache[key] = hit;
      return hit;
    } catch { return null; }
  };

  const movies = [];
  for (const rel of await walk(moviesDir)) {
    let { title, year } = parseMovieName(path.basename(rel));
    if (year == null && rel.includes('/')) {
      const fromDir = parseShowDirName(rel.split('/')[0]);
      if (fromDir.year != null) ({ title, year } = fromDir);
    }
    const hit = await lookup('movie', title, year);
    movies.push({
      id: hit ? hit.id : nasId(`movies/${rel}`),
      name: hit ? hit.name : title,
      poster: hit ? hit.poster : undefined,
      year,
      fileId: makeFileId('movies', rel),
      filename: path.basename(rel),
    });
  }

  const shows = new Map();
  for (const rel of await walk(tvDir)) {
    const top = rel.split('/')[0];
    if (rel === top) continue; // loose file at tv root: no show dir to attach to
    const ep = parseEpisodePath(rel);
    if (!ep) continue;
    if (!shows.has(top)) shows.set(top, []);
    shows.get(top).push({ ...ep, rel });
  }
  const series = [];
  for (const [dir, eps] of shows) {
    const { title, year } = parseShowDirName(dir);
    const hit = await lookup('series', title, year);
    const episodes = {};
    for (const e of eps.sort((a, b) => a.season - b.season || a.episode - b.episode)) {
      episodes[`${e.season}:${e.episode}`] = {
        fileId: makeFileId('tv', e.rel),
        filename: path.basename(e.rel),
      };
    }
    series.push({
      id: hit ? hit.id : nasId(`tv/${dir}`),
      name: hit ? hit.name : title,
      poster: hit ? hit.poster : undefined,
      year,
      episodes,
    });
  }

  const index = { builtAt: new Date().toISOString(), movies, series };
  await fsp.mkdir(dataDir, { recursive: true });
  await fsp.writeFile(cacheFile, JSON.stringify(cache));
  await fsp.writeFile(path.join(dataDir, 'index.json'), JSON.stringify(index));
  return index;
}

const loadPersistedIndex = (dataDir) => loadJson(path.join(dataDir, 'index.json'), null);

module.exports = { buildIndex, loadPersistedIndex, nasId, walk };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all library tests PASS (full suite green).

- [ ] **Step 5: Commit**

```bash
git add docker/stremio-nas-addon/lib/library.js docker/stremio-nas-addon/test/library.test.js
git commit -m "feat(stremio-nas-addon): library scanner and index builder"
```

---

### Task 6: HTTP server (`server.js`) + local smoke test

**Files:**
- Create: `docker/stremio-nas-addon/server.js`

- [ ] **Step 1: Implement `server.js`**

```js
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
  version: '1.0.0',
  name: 'NAS Library',
  description: 'Movies and TV Shows from the ASUSTOR NAS',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  idPrefixes: ['tt', 'nas:'],
  catalogs: [
    { type: 'movie', id: 'nas-movies', name: 'NAS Movies', extra: [{ name: 'search' }] },
    { type: 'series', id: 'nas-tv', name: 'NAS TV', extra: [{ name: 'search' }] },
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
  res.end(JSON.stringify(body));
}

function searchFilter(items, extra) {
  const m = /^search=(.*)$/.exec(extra || '');
  if (!m) return items;
  const q = m[1].toLowerCase();
  return items.filter((i) => i.name.toLowerCase().includes(q));
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
      if (type === 'movie' && catalogId === 'nas-movies') {
        return json(res, { metas: searchFilter(index.movies, extra).map((m) => toMeta('movie', m)) });
      }
      if (type === 'series' && catalogId === 'nas-tv') {
        return json(res, { metas: searchFilter(index.series, extra).map((s) => toMeta('series', s)) });
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
  setInterval(rescan, RESCAN_MS);
})();
```

- [ ] **Step 2: Full unit suite still green**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Local smoke test against a fixture tree**

```bash
cd docker/stremio-nas-addon
mkdir -p /tmp/nas-fixture/movies "/tmp/nas-fixture/tv/The Wire/Season 1" /tmp/nas-fixture/data
head -c 1048576 /dev/urandom > "/tmp/nas-fixture/movies/The Matrix (1999).mp4"
head -c 1048576 /dev/urandom > "/tmp/nas-fixture/tv/The Wire/Season 1/The.Wire.S01E01.mp4"
MOVIES_DIR=/tmp/nas-fixture/movies TV_DIR=/tmp/nas-fixture/tv DATA_DIR=/tmp/nas-fixture/data \
  PUBLIC_LAN_BASE=http://127.0.0.1:7000 node server.js &
sleep 3
curl -s http://127.0.0.1:7000/manifest.json | head -c 200; echo
curl -s http://127.0.0.1:7000/catalog/movie/nas-movies.json
curl -s "http://127.0.0.1:7000/catalog/movie/nas-movies/search=matrix.json"
curl -s http://127.0.0.1:7000/stream/movie/tt0133093.json
FILEID=$(curl -s http://127.0.0.1:7000/stream/movie/tt0133093.json | grep -o '/file/[A-Za-z0-9_-]*' | head -1 | cut -d/ -f3)
curl -s -o /dev/null -w '%{http_code} %{size_download}\n' -H 'Range: bytes=0-1023' "http://127.0.0.1:7000/file/$FILEID"
kill %1
```

Expected: manifest JSON; catalog with The Matrix (id `tt0133093` — real Cinemeta match over the network) and search working; stream answer with the LAN URL; `206 1024` for the range request. If offline, the movie appears with a `nas:` id instead — acceptable for the smoke test.

- [ ] **Step 4: Commit**

```bash
git add docker/stremio-nas-addon/server.js
git commit -m "feat(stremio-nas-addon): addon http server"
```

---

### Task 7: Dockerfile, build, push

**Files:**
- Create: `docker/stremio-nas-addon/Dockerfile`

- [ ] **Step 1: Create Dockerfile**

Note: runs as root (not `USER node`) because NFS export squash/uid mapping on the ASUSTOR is unverified; the mounts are read-only so exposure is bounded.

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
COPY lib ./lib
ENV NODE_ENV=production
EXPOSE 7000
CMD ["node", "server.js"]
```

- [ ] **Step 2: Build and push**

```bash
cd docker/stremio-nas-addon
docker build -t maxjeffwell/stremio-nas-addon:1.0.0 .
docker push maxjeffwell/stremio-nas-addon:1.0.0
```

Expected: push succeeds (same manual-image workflow as `maxjeffwell/influxdb-backup`).

- [ ] **Step 3: Commit**

```bash
git add docker/stremio-nas-addon/Dockerfile
git commit -m "feat(stremio-nas-addon): dockerfile"
```

---

### Task 8: Kubernetes manifests

**Files:**
- Create: `k8s/stremio-nas-addon/stremio-nas-addon.yaml`

- [ ] **Step 1: Confirm the ExternalSecret apiVersion in use**

Run: `kubectl get externalsecret stremio-tailscale-external-secret -n stremio -o jsonpath='{.apiVersion}'`
Expected: `external-secrets.io/v1beta1` (if different, use that value in the manifest below).

- [ ] **Step 2: Re-confirm hostPort 7010 still free on debian-marmoset**

Run: `ssh debian-marmoset 'ss -ltn | grep -E ":7010\b" || echo FREE'`
Expected: `FREE`

- [ ] **Step 3: Write `k8s/stremio-nas-addon/stremio-nas-addon.yaml`**

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: stremio-nas-addon
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: nas-addon-tailscale
  namespace: stremio-nas-addon
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: nas-addon-tailscale
  namespace: stremio-nas-addon
rules:
  - apiGroups: [""]
    resources: ["secrets"]
    verbs: ["create"]
  - apiGroups: [""]
    resourceNames: ["nas-addon-tailscale-state"]
    resources: ["secrets"]
    verbs: ["get", "update", "patch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: nas-addon-tailscale
  namespace: stremio-nas-addon
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: nas-addon-tailscale
subjects:
  - kind: ServiceAccount
    name: nas-addon-tailscale
    namespace: stremio-nas-addon
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: nas-addon-tailscale-external-secret
  namespace: stremio-nas-addon
spec:
  refreshInterval: 1h
  secretStoreRef:
    kind: ClusterSecretStore
    name: doppler-secret-store
  target:
    name: nas-addon-tailscale-auth
    creationPolicy: Owner
    deletionPolicy: Retain
  data:
    - secretKey: TS_AUTHKEY
      remoteRef:
        key: STREMIO_TS_AUTHKEY
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: nas-addon-tls
  namespace: stremio-nas-addon
spec:
  secretName: nas-addon-tls
  dnsNames:
    - nas-addon.tailnet.el-jefe.me
  issuerRef:
    kind: ClusterIssuer
    name: letsencrypt-prod-dns
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: nas-addon-ts-serve
  namespace: stremio-nas-addon
data:
  serve.json: |
    {
      "TCP": {
        "443": { "TCPForward": "127.0.0.1:8443" }
      }
    }
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: nas-addon-nginx
  namespace: stremio-nas-addon
data:
  nginx.conf: |
    events {}
    http {
      server {
        listen 8443 ssl;
        ssl_certificate /certs/tls.crt;
        ssl_certificate_key /certs/tls.key;
        location / {
          proxy_pass http://127.0.0.1:7000;
          proxy_http_version 1.1;
          proxy_set_header Host $host;
          proxy_read_timeout 3600s;
          proxy_send_timeout 3600s;
        }
      }
    }
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: nas-addon-cache
  namespace: stremio-nas-addon
spec:
  storageClassName: local-path
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 1Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nas-addon
  namespace: stremio-nas-addon
  labels:
    app: nas-addon
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: nas-addon
  template:
    metadata:
      labels:
        app: nas-addon
    spec:
      nodeSelector:
        kubernetes.io/hostname: debian-marmoset
      serviceAccountName: nas-addon-tailscale
      containers:
        - name: addon
          image: maxjeffwell/stremio-nas-addon:1.0.0
          ports:
            - containerPort: 7000
              hostPort: 7010
          env:
            - { name: PUBLIC_HTTPS_BASE, value: "https://nas-addon.tailnet.el-jefe.me" }
            - { name: PUBLIC_LAN_BASE, value: "http://192.168.50.152:7010" }
          volumeMounts:
            - { name: movies, mountPath: /media/movies, readOnly: true }
            - { name: tv, mountPath: /media/tv, readOnly: true }
            - { name: data, mountPath: /data }
          readinessProbe:
            httpGet: { path: /health, port: 7000 }
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests: { cpu: 50m, memory: 128Mi }
            limits:   { cpu: 500m, memory: 512Mi }
        - name: tls-proxy
          image: nginx:1.27-alpine
          ports:
            - containerPort: 8443
          volumeMounts:
            - { name: nginx-conf, mountPath: /etc/nginx/nginx.conf, subPath: nginx.conf }
            - { name: tls, mountPath: /certs, readOnly: true }
          resources:
            requests: { cpu: 25m, memory: 32Mi }
            limits:   { cpu: 200m, memory: 128Mi }
        - name: tailscale
          image: tailscale/tailscale:stable
          env:
            - { name: TS_USERSPACE, value: "true" }
            - { name: TS_KUBE_SECRET, value: "nas-addon-tailscale-state" }
            - { name: TS_HOSTNAME, value: "nas-addon" }
            - { name: TS_EXTRA_ARGS, value: "--login-server=https://headscale.el-jefe.me" }
            - { name: TS_SERVE_CONFIG, value: "/cfg/serve.json" }
            - name: TS_AUTHKEY
              valueFrom:
                secretKeyRef:
                  name: nas-addon-tailscale-auth
                  key: TS_AUTHKEY
                  optional: true
          volumeMounts:
            - { name: ts-serve, mountPath: /cfg }
          resources:
            requests: { cpu: 25m, memory: 64Mi }
            limits:   { cpu: 200m, memory: 128Mi }
      volumes:
        - name: movies
          nfs:
            server: 192.168.50.133
            path: /volume1/Movies
            readOnly: true
        - name: tv
          nfs:
            server: 192.168.50.133
            path: "/volume1/TV Shows"
            readOnly: true
        - name: data
          persistentVolumeClaim:
            claimName: nas-addon-cache
        - name: ts-serve
          configMap:
            name: nas-addon-ts-serve
        - name: nginx-conf
          configMap:
            name: nas-addon-nginx
        - name: tls
          secret:
            secretName: nas-addon-tls
---
apiVersion: v1
kind: Service
metadata:
  name: nas-addon
  namespace: stremio-nas-addon
spec:
  selector:
    app: nas-addon
  ports:
    - name: http
      port: 7000
      targetPort: 7000
```

- [ ] **Step 4: Dry-run validate**

Run: `kubectl apply --dry-run=server -f k8s/stremio-nas-addon/stremio-nas-addon.yaml`
Expected: all resources validate (created (server dry run)).

- [ ] **Step 5: Commit**

```bash
git add k8s/stremio-nas-addon/stremio-nas-addon.yaml
git commit -m "feat(stremio-nas-addon): k8s manifests"
```

---

### Task 9: Deploy and verify

- [ ] **Step 1: Apply**

```bash
kubectl apply -f k8s/stremio-nas-addon/stremio-nas-addon.yaml
kubectl rollout status deploy/nas-addon -n stremio-nas-addon --timeout=300s
```

Expected: rollout succeeds. First image pull on debian-marmoset takes a minute.

- [ ] **Step 2: Check the scan and tailscale auth**

```bash
kubectl logs -n stremio-nas-addon deploy/nas-addon -c addon | tail -20
kubectl logs -n stremio-nas-addon deploy/nas-addon -c tailscale | tail -20
kubectl get certificate -n stremio-nas-addon
```

Expected: addon logs `scan ok: N movies, M series` with plausible counts; tailscale logged in (node `nas-addon` joins the headscale tailnet); certificate Ready.
**Contingency:** if tailscale auth fails, `STREMIO_TS_AUTHKEY` is a single-use/expired headscale preauth key — mint a new reusable preauth key in headscale, add it to Doppler (portfolio/prd) as `NAS_ADDON_TS_AUTHKEY`, change the ExternalSecret `remoteRef.key` to match, re-apply, delete the pod.

- [ ] **Step 3: Check DNS for the tailnet hostname**

```bash
dig +short stremio.tailnet.el-jefe.me
dig +short nas-addon.tailnet.el-jefe.me
kubectl exec -n stremio-nas-addon deploy/nas-addon -c tailscale -- tailscale ip -4
```

Expected: replicate whatever record type `stremio.tailnet.el-jefe.me` uses (Cloudflare record in the el-jefe.me zone or headscale DNS) for `nas-addon.tailnet.el-jefe.me`, pointed at the tailscale IPv4 printed by the third command. If `nas-addon` already resolves (wildcard / MagicDNS), nothing to do.

- [ ] **Step 4: API verification over LAN HTTP**

```bash
curl -s http://192.168.50.152:7010/health
curl -s http://192.168.50.152:7010/manifest.json | head -c 300; echo
curl -s http://192.168.50.152:7010/catalog/movie/nas-movies.json | head -c 500; echo
STREAMURL=$(curl -s http://192.168.50.152:7010/catalog/movie/nas-movies.json \
  | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
curl -s "http://192.168.50.152:7010/stream/movie/$STREAMURL.json"
FILEID=$(curl -s "http://192.168.50.152:7010/stream/movie/$STREAMURL.json" \
  | grep -o '/file/[A-Za-z0-9_-]*' | head -1 | cut -d/ -f3)
curl -s -o /dev/null -w '%{http_code} %{size_download}\n' \
  -H 'Range: bytes=0-1023' "http://192.168.50.152:7010/file/$FILEID"
```

Expected: health JSON with counts; manifest; catalog with real titles and mostly `tt` ids; stream answer with both URLs; `206 1024`.

- [ ] **Step 5: API verification over tailnet HTTPS (from marmoset, which is on the tailnet)**

```bash
curl -s https://nas-addon.tailnet.el-jefe.me/health
curl -s -o /dev/null -w '%{http_code}\n' https://nas-addon.tailnet.el-jefe.me/manifest.json
```

Expected: `{"status":"ok",...}` and `200` with a valid LE cert (no `-k` needed).

- [ ] **Step 6: Commit any fixes, push everything**

```bash
git push origin main
```

---

### Task 10: End-to-end in a Stremio client (user-assisted)

- [ ] **Step 1: Install the addon in Stremio**

In a Stremio app (desktop/Android): Addons → search box → paste
`https://nas-addon.tailnet.el-jefe.me/manifest.json` (tailnet device) or
`http://192.168.50.152:7010/manifest.json` (LAN device, non-web client) → Install.

- [ ] **Step 2: Verify the three behaviors**

1. Home/Discover shows **NAS Movies** and **NAS TV** rows.
2. Open a matched movie's normal title page → a **NAS tailnet / NAS LAN** source appears alongside other addons' sources.
3. Play a file from each URL variant; seek forward/backward (exercises Range).

Expected: playback + seeking work; pick whichever source row matches the device's network.

---

## Self-review notes

- Spec coverage: scanner/matcher (T5), parser forms incl. `1x05` + `Season N/` (T2), API routes incl. search extra + nas: meta videos (T6), Range/path-safety incl. symlink escape (T3), strict matching + only-positive cache (T4/T5), NFS-down → persisted index (T6 startup + rescan catch), deployment shape/hostPort/PVC/cert/ES (T8), dual stream URLs (T6), client install (T10). hostPort collision check (T8 step 2). All spec sections have tasks.
- `movieById` stream lookup guards `m.fileId` so a hypothetical meta-only entry can't produce a broken stream.
- Type consistency: `streamsFor(entry)` consumes `{fileId, filename}` — shape produced for both movies (top-level) and series episodes (T5).
