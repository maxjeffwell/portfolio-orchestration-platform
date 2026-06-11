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

test('rejects prototype-pollution root key and empty rel path', async () => {
  const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url');
  assert.strictEqual(await resolveFileId(roots, b64('__proto__/x')), null);
  assert.strictEqual(await resolveFileId(roots, b64('movies/')), null);
  assert.strictEqual(await resolveFileId(roots, b64('movies')), null);
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
