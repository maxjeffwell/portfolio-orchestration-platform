'use strict';

const VIDEO_EXT = /\.(mkv|mp4|avi|m4v|ts|webm)$/i;

const isVideo = (name) => VIDEO_EXT.test(name);

const clean = (s) => s.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();

// "Title (1999).mkv" | "Title.1999.1080p.x264.mkv" -> { title, year }
function parseMovieName(filename) {
  const base = filename.replace(VIDEO_EXT, '');

  // First try: parenthesized year "Title (1999)"
  let m = base.match(/^(.+?)\s*\(?((?:19|20)\d{2})\)?[\s._-]*$/);
  if (m) return { title: clean(m[1]), year: Number(m[2]) };

  // Second try: look for year followed by quality markers (scene-style)
  const years = [];
  let yearMatch;
  const yearRegex = /((?:19|20)\d{2})/g;
  while ((yearMatch = yearRegex.exec(base)) !== null) {
    years.push({ year: yearMatch[1], idx: yearMatch.index });
  }

  if (years.length === 0) return { title: clean(base), year: null };

  // Prefer a year followed by quality patterns, otherwise take the last year
  let selectedYear = null;
  for (const { year, idx } of years) {
    const afterYear = base.substring(idx + 4);
    if (/^[\s._-]*(2160p|1080p|720p|480p|BluRay|x265|x264|HEVC|AVC)/i.test(afterYear)) {
      selectedYear = { year, idx };
      break;
    }
  }
  if (!selectedYear) selectedYear = years[years.length - 1];

  const title = base.substring(0, selectedYear.idx).replace(/[\s._-]+$/, '');
  return { title: clean(title), year: Number(selectedYear.year) };
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
