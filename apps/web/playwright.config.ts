import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  webServer: [
    {
      command: 'npm run build -w @teamflow/api && npm run start -w @teamflow/api',
      cwd: '../..',
      url: 'http://127.0.0.1:3000/api/auth/me',
      reuseExistingServer: false,
      env: {
        DATABASE_URL: process.env.DATABASE_URL!,
        SEED_DEMO: 'true',
        NODE_ENV: 'test',
        PORT: '3000',
      },
      timeout: 60_000,
    },
    {
      command: 'npm run dev',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
