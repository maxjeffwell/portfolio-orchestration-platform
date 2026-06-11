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
