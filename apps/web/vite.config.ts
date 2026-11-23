import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The API, the live channel and the MCP endpoint live in workers/edge.
// `pnpm dev` at the repo root serves both on one origin; `pnpm dev:web` proxies to it.
// A production build is always a production build, whatever NODE_ENV the shell exports
// (a stray NODE_ENV=development would bundle React's development build, 3× the size).
if (process.argv.includes('build')) process.env.NODE_ENV = 'production';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  server: {
    fs: { allow: ['../..'] },
    proxy: {
      '/api': { target: 'http://localhost:8787', ws: true },
      '/mcp': { target: 'http://localhost:8787' },
    },
  },
  test: { include: ['test/**/*.test.ts?(x)'] },
});
