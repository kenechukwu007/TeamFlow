const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdtemp, unlink, rmdir } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const { createTestDatabase } = require('../../../scripts/test-database.cjs');
const { Database } = require('../dist/database');
const { importSqlite } = require('../dist/import-sqlite');
const { hashPassword, verifyPassword } = require('../dist/password');
let db, testDatabase;
before(async () => {
  testDatabase = await createTestDatabase();
  process.env.DATABASE_URL = testDatabase.url;
  db = new Database();
  await db.migrate();
});
after(async () => {
  if (db) await db.onModuleDestroy();
  if (testDatabase) await testDatabase.close();
});

test('migrations can run again without losing data', async () => {
  await db.migrate();
  assert.equal((await db.get('SELECT count(*)::int AS count FROM schema_migrations')).count, 1);
});

test('concurrent requests have isolated transaction connections', async () => {
  const rolledBack = randomUUID(),
    committed = randomUUID();
  let signal, release;
  const started = new Promise((resolve) => (signal = resolve));
  const finish = new Promise((resolve) => (release = resolve));
  const failing = db.transaction(async () => {
    await db.run('INSERT INTO projects(id,name) VALUES($1,$2)', rolledBack, 'Uncommitted');
    signal();
    await finish;
    throw new Error('rollback');
  });
  const rejection = assert.rejects(failing, /rollback/);
  await started;
  try {
    assert.equal(await db.get('SELECT id FROM projects WHERE id=$1', rolledBack), undefined);
    await db.transaction(async () => {
      await db.run('INSERT INTO projects(id,name) VALUES($1,$2)', committed, 'Committed');
    });
  } finally {
    release();
  }
  await rejection;
  assert.equal(await db.get('SELECT id FROM projects WHERE id=$1', rolledBack), undefined);
  assert.equal((await db.get('SELECT id FROM projects WHERE id=$1', committed)).id, committed);
  await db.run('DELETE FROM projects WHERE id=$1', committed);
});

test('SQLite import preserves records, hashes, timestamps and refuses a second import', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'teamflow-import-'));
  const filename = join(directory, 'source.sqlite');
  const source = new DatabaseSync(filename);
  const user = randomUUID(),
    project = randomUUID(),
    ticket = randomUUID(),
    comment = randomUUID(),
    activity = randomUUID();
  const hash = await hashPassword('existing-user-password');
  const timestamp = '2026-09-20T12:00:00.000Z';
  source.exec(`
    CREATE TABLE users(id TEXT,name TEXT,email TEXT,password_hash TEXT);
    CREATE TABLE projects(id TEXT,name TEXT,description TEXT,created_at TEXT);
    CREATE TABLE tickets(id TEXT,project_id TEXT,title TEXT,description TEXT,status TEXT,priority TEXT,assignee_id TEXT,created_at TEXT,updated_at TEXT);
    CREATE TABLE comments(id TEXT,ticket_id TEXT,user_id TEXT,body TEXT,created_at TEXT);
    CREATE TABLE activity(id TEXT,actor_id TEXT,message TEXT,created_at TEXT);
  `);
  source
    .prepare('INSERT INTO users VALUES(?,?,?,?)')
    .run(user, 'Existing User', 'old@example.com', hash);
  source
    .prepare('INSERT INTO projects VALUES(?,?,?,?)')
    .run(project, 'Original project', 'Keep this', timestamp);
  source
    .prepare('INSERT INTO tickets VALUES(?,?,?,?,?,?,?,?,?)')
    .run(
      ticket,
      project,
      'Original ticket',
      'Details',
      'in_progress',
      'high',
      user,
      timestamp,
      timestamp,
    );
  source
    .prepare('INSERT INTO comments VALUES(?,?,?,?,?)')
    .run(comment, ticket, user, 'Original comment', timestamp);
  source
    .prepare('INSERT INTO activity VALUES(?,?,?,?)')
    .run(activity, user, 'created a project', timestamp);
  source.close();
  try {
    const counts = await importSqlite(db, filename);
    assert.deepEqual(counts, { users: 1, projects: 1, tickets: 1, comments: 1, activity: 1 });
    const person = await db.get('SELECT * FROM users WHERE id=$1', user);
    assert.equal(person.password_hash, hash);
    assert.equal(await verifyPassword('existing-user-password', person.password_hash), true);
    assert.equal((await db.get('SELECT * FROM tickets WHERE id=$1', ticket)).assignee_id, user);
    assert.equal(
      (
        await db.get('SELECT created_at FROM comments WHERE id=$1', comment)
      ).created_at.toISOString(),
      timestamp,
    );
    await assert.rejects(() => importSqlite(db, filename), /not empty/);
    assert.equal((await db.get('SELECT count(*)::int AS count FROM users')).count, 1);
    const unchanged = new DatabaseSync(filename, { readOnly: true });
    assert.equal(unchanged.prepare('SELECT password_hash FROM users').get().password_hash, hash);
    unchanged.close();
  } finally {
    await unlink(filename);
    await rmdir(directory);
  }
});
