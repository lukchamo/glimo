// What every test file needs to talk to the Worker under test.

import { exports } from 'cloudflare:workers';
import { expect } from 'vitest';

export const ORIGIN = 'https://glimo.test';

export type Json = Record<string, unknown>;

export function call(path: string, init: RequestInit & { key?: string; json?: unknown } = {}) {
  const headers = new Headers(init.headers);
  if (init.key) headers.set('authorization', `Bearer ${init.key}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(init.json);
  }
  return exports.default.fetch(new Request(`${ORIGIN}${path}`, { ...init, headers, body }));
}

let visitor = 0;

/** Each test visitor comes from its own address, like real people do. */
export async function createVitrina() {
  visitor += 1;
  const response = await call('/api/vitrinas', {
    method: 'POST',
    headers: { 'cf-connecting-ip': `203.0.113.${visitor % 250}` },
  });
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string; key: string; url: string; mcp: string };
}

export const status = (id: string, state: string, extra: Json = {}) => ({
  agent: { id, name: id[0]?.toUpperCase() + id.slice(1) },
  state,
  ...extra,
});

export async function push(v: { id: string; key: string }, body: unknown) {
  return call(`/api/vitrinas/${v.id}/status`, { method: 'POST', key: v.key, json: body });
}
