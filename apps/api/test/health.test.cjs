const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Test } = require('@nestjs/testing');
const request = require('supertest');
const { AppModule, configure } = require('../dist/app');
const { Database } = require('../dist/database');
const { WorkspaceCache } = require('../dist/cache');

test('health endpoint permits unauthenticated checks and hides database failures', async () => {
  let failing = false;
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Database)
    .useValue({
      async get(sql) {
        assert.equal(sql, 'SELECT 1');
        if (failing) throw new Error('private database connection details');
        return { '?column?': 1 };
      },
    })
    .overrideProvider(WorkspaceCache)
    .useValue({})
    .compile();
  const app = module.createNestApplication();
  configure(app);
  try {
    await app.init();
    await request(app.getHttpServer()).get('/api/health').expect(200, { status: 'ok' });
    failing = true;
    const response = await request(app.getHttpServer()).get('/api/health').expect(503);
    assert.equal(response.body.message, 'Service unavailable');
    assert.ok(!response.text.includes('private database connection details'));
    failing = false;
    await request(app.getHttpServer()).get('/api/health').expect(200, { status: 'ok' });
  } finally {
    await app.close();
  }
});
