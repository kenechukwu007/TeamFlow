const { test } = require('node:test');
const assert = require('node:assert/strict');
const { WorkspaceCache } = require('../dist/cache');
process.env.CACHE_TTL_SECONDS = '30';

test('a failed cache write still returns database data', async () => {
  const cache = new WorkspaceCache();
  cache.client = {
    isReady: true,
    get: async () => null,
    set: async () => {
      throw new Error('offline');
    },
  };
  assert.equal(await cache.remember('1', async () => 'database'), 'database');
});

test('cache hits, revision changes, and disconnected fallback', async () => {
  const cache = new WorkspaceCache();
  const store = new Map();
  cache.client = {
    isReady: true,
    async get(key) {
      return store.get(key) ?? null;
    },
    async set(key, value, options) {
      assert.equal(options.EX, 30);
      store.set(key, value);
    },
  };
  let loads = 0;
  const load = async () => ({ projects: [++loads] });
  assert.deepEqual(await cache.remember('1', load), { projects: [1] });
  assert.deepEqual(await cache.remember('1', load), { projects: [1] });
  assert.deepEqual(await cache.remember('2', load), { projects: [2] });
  cache.client.isReady = false;
  assert.deepEqual(await cache.remember('2', load), { projects: [3] });
  assert.equal(cache.stats.hits, 1);
});

test('cache errors, malformed values and stalled reads fall back to PostgreSQL', async () => {
  for (const get of [
    async () => {
      throw new Error('offline');
    },
    async () => '{bad',
    () => new Promise(() => {}),
  ]) {
    const cache = new WorkspaceCache();
    cache.client = { isReady: true, get };
    assert.equal(await cache.remember('1', async () => 'database'), 'database');
  }
});

test('an in-flight old read cannot overwrite the next revision', async () => {
  const cache = new WorkspaceCache();
  const store = new Map();
  cache.client = {
    isReady: true,
    get: async (key) => store.get(key) ?? null,
    set: async (key, value) => store.set(key, value),
  };
  let finish;
  const delayed = cache.remember(
    '1',
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await cache.remember('2', async () => 'new'), 'new');
  finish('old');
  await delayed;
  assert.equal(await cache.remember('2', async () => 'unexpected'), 'new');
});
