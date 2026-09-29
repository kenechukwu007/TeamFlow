import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
const require = createRequire(import.meta.url);
const { createTestDatabase } = require('./test-database.cjs');
const root = fileURLToPath(new URL('../', import.meta.url));
let database;
try {
  database = await createTestDatabase();
  const child = spawn(
    process.execPath,
    [require.resolve('@playwright/test/cli'), 'test', '--config', 'apps/web/playwright.config.ts'],
    {
      cwd: root,
      stdio: 'inherit',
      windowsHide: true,
      env: {
        ...process.env,
        DATABASE_URL: database.url,
        SEED_DEMO: 'true',
        DEMO_EMAIL: 'browser-test@example.invalid',
        DEMO_PASSWORD: randomBytes(24).toString('hex'),
        NODE_ENV: 'test',
        PORT: '3000',
      },
    },
  );
  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
  process.exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (database) await database.close();
}
