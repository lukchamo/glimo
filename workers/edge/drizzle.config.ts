import { defineConfig } from 'drizzle-kit';

// Migrations are plain SQL files applied with `wrangler d1 migrations apply`.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './migrations',
});
