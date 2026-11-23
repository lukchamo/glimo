import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

// Same SQL files that `wrangler d1 migrations apply` runs in production.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
