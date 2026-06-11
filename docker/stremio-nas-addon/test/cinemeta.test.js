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
