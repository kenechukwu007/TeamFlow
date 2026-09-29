const { Pool } = require('pg');
const { randomUUID } = require('node:crypto');
const { resolve } = require('node:path');
require('dotenv').config({ path: resolve(__dirname, '../.env'), quiet: true });

exports.createTestDatabase = async () => {
  const value = process.env.TEST_DATABASE_URL;
  if (!value)
    throw new Error(
      'Set TEST_DATABASE_URL to a separate PostgreSQL database ending in _test. See README.md.',
    );
  const url = new URL(value);
  if (!decodeURIComponent(url.pathname).endsWith('_test'))
    throw new Error(
      'Test database name must end in _test. Refusing to run against application data.',
    );
  const pool = new Pool({ connectionString: value, connectionTimeoutMillis: 5000 });
  const schema = `teamflow_test_${randomUUID().replaceAll('-', '')}`;
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set('options', `-c search_path=${schema}`);
    return {
      url: url.toString(),
      async close() {
        // schema is a generated identifier belonging only to this test run.
        try {
          await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
        } finally {
          await pool.end();
        }
      },
    };
  } catch (error) {
    await pool.end();
    throw error;
  }
};
