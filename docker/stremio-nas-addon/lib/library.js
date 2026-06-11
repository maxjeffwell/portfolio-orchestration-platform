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

  let index = { builtAt: new Date().toISOString(), movies, series };
  await fsp.mkdir(dataDir, { recursive: true });

  // Guard against NFS blips: if scan came back completely empty, preserve the previous index.
  if (movies.length === 0 && series.length === 0) {
    const prevIndex = await loadPersistedIndex(dataDir);
    if (prevIndex && (prevIndex.movies?.length > 0 || prevIndex.series?.length > 0)) {
      await fsp.writeFile(cacheFile, JSON.stringify(cache));
      return prevIndex;
    }
  }

  await fsp.writeFile(cacheFile, JSON.stringify(cache));
  await fsp.writeFile(path.join(dataDir, 'index.json'), JSON.stringify(index));
  return index;
}

const loadPersistedIndex = (dataDir) => loadJson(path.join(dataDir, 'index.json'), null);

module.exports = { buildIndex, loadPersistedIndex, nasId, walk };
