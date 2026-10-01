const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestDatabase } = require('../../../scripts/test-database.cjs');
const { Database } = require('../dist/database');
const { recordActivity, consumeActivity } = require('../dist/activity');
let db, fixture;
const actor = randomUUID();
before(async () => {
  fixture = await createTestDatabase();
  process.env.DATABASE_URL = fixture.url;
  process.env.BROKER_ENABLED = 'true';
  db = new Database();
  await db.migrate();
  await db.run(
    'INSERT INTO users VALUES($1,$2,$3,$4)',
    actor,
    'Worker test',
    'worker@example.com',
    'unused',
  );
});
after(async () => {
  if (db) await db.onModuleDestroy();
  if (fixture) await fixture.close();
});

test('outbox rolls back with business data and duplicate delivery creates one activity', async () => {
  await assert.rejects(
    db.transaction(async () => {
      await recordActivity(db, actor, 'rolled back');
      throw new Error('rollback');
    }),
    /rollback/,
  );
  assert.equal((await db.get('SELECT count(*)::int AS n FROM activity_outbox')).n, 0);
  await db.transaction(() => recordActivity(db, actor, 'committed'));
  assert.equal((await db.get('SELECT count(*)::int AS n FROM activity')).n, 0);
  const event = await db.get('SELECT * FROM activity_outbox');
  await Promise.all([consumeActivity(db, event.id), consumeActivity(db, event.id)]);
  assert.equal((await db.get('SELECT count(*)::int AS n FROM activity')).n, 1);
  assert.equal((await db.get('SELECT count(*)::int AS n FROM activity_outbox')).n, 0);
});

test('committed writes change the database snapshot used for cache keys', async () => {
  const revision = async () =>
    (await db.get('SELECT pg_current_snapshot()::text AS version')).version;
  const start = await revision();
  await db.run('INSERT INTO projects(id,name) VALUES($1,$2)', randomUUID(), 'commit');
  assert.notEqual(await revision(), start);
});
