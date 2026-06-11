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
  const key = decoded.slice(0, slash);
  const root = Object.prototype.hasOwnProperty.call(roots, key) ? roots[key] : null;
  if (typeof root !== 'string') return null;
  const rel = decoded.slice(slash + 1);
  if (!rel) return null;
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(root + path.sep)) return null;
  let real, realRoot;
  try {
    real = await fsp.realpath(abs);
    realRoot = await fsp.realpath(root);
  } catch { return null; }
  if (!real.startsWith(realRoot + path.sep)) return null;
  return real;
}

function serveFile(req, res, absPath, size) {
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', MIME[path.extname(absPath).toLowerCase()] || 'application/octet-stream');
  // Single-range only; multi-range requests intentionally fall through to a full 200 (RFC 7233 allows this).
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
    const stream = fs.createReadStream(absPath, { start, end });
    stream.on('error', (err) => { if (!res.writableEnded) res.destroy(err); });
    stream.pipe(res);
  } else {
    res.writeHead(200, { 'Content-Length': size });
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(absPath);
    stream.on('error', (err) => { if (!res.writableEnded) res.destroy(err); });
    stream.pipe(res);
  }
}

module.exports = { MIME, makeFileId, resolveFileId, serveFile };
