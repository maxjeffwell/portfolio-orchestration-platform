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

test('buildIndex: empty scan does not clobber a previously good index', async () => {
  const dataDir3 = path.join(base, 'data3');
  await buildIndex({ moviesDir, tvDir, dataDir: dataDir3, match: stubMatch });
  const emptyDir = path.join(base, 'does-not-exist');
  const index = await buildIndex({ moviesDir: emptyDir, tvDir: emptyDir, dataDir: dataDir3, match: stubMatch });
  assert.strictEqual(index.movies.length, 2, 'returns previous index');
  const persisted = await loadPersistedIndex(dataDir3);
  assert.strictEqual(persisted.movies.length, 2, 'index.json preserved');
});
