import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Tests run inside the real Workers runtime (workerd) with local D1, Durable Objects,
// WebSockets and the Cache API. No network, no account, a few seconds end to end.
export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: { ID_SECRET: 'test-only-secret', TEST_MIGRATIONS: migrations },
          // The real site is built by apps/web; tests only need the vitrina shell.
          assets: {
            directory: path.join(import.meta.dirname, 'test/fixtures/site'),
            binding: 'ASSETS',
          },
        },
      }),
    ],
    test: {
      include: ['test/**/*.test.ts'],
      setupFiles: ['./test/setup.ts'],
    },
  };
});
