import { generateKeyPairSync } from 'node:crypto';
import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

/** A Web Push key pair made for this run and thrown away: no key is ever committed. */
function testVapidKeys() {
  const { x, y, d } = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({
    format: 'jwk',
  });
  const part = (value: string | undefined) => Buffer.from(value ?? '', 'base64url');
  return {
    VAPID_PUBLIC_KEY: Buffer.concat([Buffer.from([4]), part(x), part(y)]).toString('base64url'),
    VAPID_PRIVATE_KEY: part(d).toString('base64url'),
  };
}

// Tests run inside the real Workers runtime (workerd) with local D1, Durable Objects,
// WebSockets and the Cache API. No network, no account, a few seconds end to end.
export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            ID_SECRET: 'test-only-secret',
            TEST_MIGRATIONS: migrations,
            ...testVapidKeys(),
          },
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
