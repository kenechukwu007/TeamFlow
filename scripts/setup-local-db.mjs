import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
const root = fileURLToPath(new URL('../', import.meta.url));
const filename = join(root, '.env');
const adminFile = join(root, 'data', 'postgres-admin.json');
try {
  const values = existsSync(filename) ? dotenv.parse(readFileSync(filename, 'utf8')) : {};
  mkdirSync(join(root, 'data'), { recursive: true });
  if (!existsSync(adminFile)) {
    if (existsSync(join(root, 'data', 'postgres', 'PG_VERSION')))
      throw new Error(
        'Restore data/postgres-admin.json for the existing cluster before continuing.',
      );
    writeFileSync(
      adminFile,
      JSON.stringify({ password: randomBytes(32).toString('hex') }, null, 2),
      { mode: 0o600 },
    );
  }
  if (!values.DATABASE_URL || values.DATABASE_URL.includes('REPLACE_WITH_YOUR_PASSWORD')) {
    const password = randomBytes(24).toString('hex');
    values.DATABASE_URL = `postgresql://teamflow:${password}@127.0.0.1:5432/teamflow`;
    values.TEST_DATABASE_URL = `postgresql://teamflow:${password}@127.0.0.1:5432/teamflow_test`;
  }
  values.PORT ??= '3000';
  values.COOKIE_SECURE ??= 'false';
  values.SEED_DEMO ??= 'true';
  writeFileSync(
    filename,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
    { mode: 0o600 },
  );
  console.log('Local database configured in .env. Run npm run db:start.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
