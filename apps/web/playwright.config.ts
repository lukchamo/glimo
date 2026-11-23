import { defineConfig, devices } from '@playwright/test';

// Browser tests. By default they start the whole thing locally (site + Worker + D1 +
// Durable Objects) on :8787. Point BASE_URL at any deployment to test that instead:
//   BASE_URL=https://glimo.dev pnpm e2e
const external = process.env.BASE_URL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
  use: {
    baseURL: external ?? 'http://127.0.0.1:8787',
    trace: 'off',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /vitrina\.spec\.ts/ },
  ],
  webServer: external
    ? undefined
    : {
        command:
          'pnpm --filter @glimo/web build && pnpm --filter @glimo/edge db:migrate:local && pnpm --filter @glimo/edge exec wrangler dev --port 8787 --ip 127.0.0.1',
        cwd: '../..',
        url: 'http://127.0.0.1:8787/api/health',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
