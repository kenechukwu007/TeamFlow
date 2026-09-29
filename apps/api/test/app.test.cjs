const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestDatabase } = require('../../../scripts/test-database.cjs');
const { randomUUID } = require('node:crypto');
process.env.SEED_DEMO = 'false';
const { Test } = require('@nestjs/testing');
const { AppModule, configure } = require('../dist/app');
const { Database } = require('../dist/database');
let app, agent, server, testDatabase;
const headers = { 'X-TeamFlow-Client': 'web' };

before(async () => {
  testDatabase = await createTestDatabase();
  process.env.DATABASE_URL = testDatabase.url;
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication();
  configure(app);
  await app.get(Database).migrate();
  await app.init();
  server = app.getHttpServer();
  agent = request.agent(server);
});
after(async () => {
  if (app) await app.close();
  if (testDatabase) await testDatabase.close();
});

test('private workspace rejects anonymous requests', async () => {
  await request(server).get('/api/workspace').expect(401);
});
test('mutations require application header', async () => {
  await request(server)
    .post('/api/auth/register')
    .send({ name: 'Alex', email: 'alex@example.com', password: 'long-test-password' })
    .expect(403);
});
test('registration rejects short passwords and invalid emails', async () => {
  await request(server)
    .post('/api/auth/register')
    .set(headers)
    .send({ name: 'Alex', email: 'invalid', password: 'short' })
    .expect(400);
});
test('full authenticated project, ticket, comment and deletion flow', async () => {
  const signup = await agent
    .post('/api/auth/register')
    .set(headers)
    .send({ name: 'Test Member', email: 'member@example.com', password: 'long-test-password' })
    .expect(201);
  assert.equal(signup.body.name, 'Test Member');
  assert.equal(signup.body.password_hash, undefined);
  assert.match(signup.headers['set-cookie'][0], /HttpOnly/);
  assert.match(signup.headers['set-cookie'][0], /SameSite=Strict/);
  const me = await agent.get('/api/auth/me').expect(200);
  assert.equal(me.body.email, 'member@example.com');
  await agent
    .post('/api/auth/register')
    .set(headers)
    .send({ name: 'Duplicate', email: 'MEMBER@example.com', password: 'long-test-password' })
    .expect(409);
  const project = await agent
    .post('/api/projects')
    .set(headers)
    .send({ name: 'Release plan', description: 'A test project' })
    .expect(201);
  await agent.post('/api/projects').set(headers).send({ name: '   ' }).expect(400);
  await agent
    .post('/api/tickets')
    .set(headers)
    .send({
      projectId: project.body.id,
      title: 'Bad assignment',
      assigneeId: '00000000-0000-4000-8000-000000000000',
    })
    .expect(400);
  const ticket = await agent
    .post('/api/tickets')
    .set(headers)
    .send({
      projectId: project.body.id,
      title: 'Ship the release',
      description: 'Verify the workflow',
      priority: 'high',
      assigneeId: me.body.id,
    })
    .expect(201);
  assert.equal(ticket.body.status, 'todo');
  await agent
    .patch(`/api/tickets/${ticket.body.id}/status`)
    .set(headers)
    .send({ status: 'invalid' })
    .expect(400);
  await agent
    .patch(`/api/tickets/${ticket.body.id}/status`)
    .set(headers)
    .send({ status: 'in_progress' })
    .expect(200);
  const edited = await agent
    .patch(`/api/tickets/${ticket.body.id}`)
    .set(headers)
    .send({
      title: 'Ship safely',
      description: 'Reviewed',
      priority: 'low',
      status: 'done',
      assigneeId: null,
    })
    .expect(200);
  assert.equal(edited.body.assignee_id, null);
  assert.equal(edited.body.status, 'done');
  const comments = await agent
    .post(`/api/tickets/${ticket.body.id}/comments`)
    .set(headers)
    .send({ body: 'Ready to go!' })
    .expect(201);
  assert.equal(comments.body[0].author_name, 'Test Member');
  await agent
    .post(`/api/tickets/${ticket.body.id}/comments`)
    .set(headers)
    .send({ body: ' ' })
    .expect(400);
  const workspace = await agent.get('/api/workspace').expect(200);
  assert.equal(workspace.body.tickets[0].title, 'Ship safely');
  assert.ok(workspace.body.activity.length >= 4);
  assert.equal(workspace.body.members[0].password_hash, undefined);
  await agent
    .patch(`/api/projects/${project.body.id}`)
    .set(headers)
    .send({ name: 'Updated release', description: 'Edited' })
    .expect(200);
  await agent.delete(`/api/projects/${project.body.id}`).set(headers).expect(204);
  await agent.get(`/api/tickets/${ticket.body.id}/comments`).expect(404);
  const db = app.get(Database);
  assert.equal((await db.get('SELECT count(*)::int AS count FROM comments')).count, 0);
  assert.equal((await db.get('SELECT count(*)::int AS count FROM tickets')).count, 0);
  await agent.post('/api/auth/logout').set(headers).expect(204);
  await agent.get('/api/workspace').expect(401);
});
test('login, invalid credentials, logout and session expiry', async () => {
  await agent
    .post('/api/auth/login')
    .set(headers)
    .send({ email: 'member@example.com', password: 'wrong' })
    .expect(401);
  await agent
    .post('/api/auth/login')
    .set(headers)
    .send({ email: 'MEMBER@example.com', password: 'long-test-password' })
    .expect(200);
  await agent.get('/api/workspace').expect(200);
  await app.get(Database).run('UPDATE sessions SET expires_at=0');
  await agent.get('/api/workspace').expect(401);
});
test('transaction rolls back if related writes fail', async () => {
  const db = app.get(Database);
  const id = randomUUID();
  await assert.rejects(() =>
    db.transaction(async () => {
      await db.run('INSERT INTO projects(id,name) VALUES($1,$2)', id, 'Should disappear');
      throw new Error('Simulated failure');
    }),
  );
  assert.equal(await db.get('SELECT id FROM projects WHERE id=$1', id), undefined);
});
test('SQL input is stored as data, not executed', async () => {
  await agent
    .post('/api/auth/login')
    .set(headers)
    .send({ email: 'member@example.com', password: 'long-test-password' })
    .expect(200);
  const malicious = "Project'); DROP TABLE users; --";
  const result = await agent
    .post('/api/projects')
    .set(headers)
    .send({ name: malicious })
    .expect(201);
  assert.equal(result.body.name, malicious);
  await agent.get('/api/auth/me').expect(200);
});
