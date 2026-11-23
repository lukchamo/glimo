// Glimo edge Worker.
//
//   glimo.dev/*          static site (served by Workers Static Assets, never reaches this code)
//   glimo.dev/v/:id      live vitrina page (app shell + hardened headers)
//   glimo.dev/api/*      REST API
//   glimo.dev/mcp/:id    MCP endpoint (Streamable HTTP)
//
// State lives in two places: one Durable Object per vitrina (live status, strongly
// consistent) and D1 through Drizzle (skills catalog, vitrina index, audit log).

import { LIMITS, parseGlimoStatus, redactSensitive, SPEC_VERSION } from '@glimo/spec';
import { desc, eq, like, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { type Context, Hono } from 'hono';
import { actionLog, skills, vitrinas } from './db/schema';
import { handleMcpMessage, type JsonRpcResponse } from './mcp';
import { checkPushEndpoint, loadVapid, parseSubscription } from './push';
import {
  API_SECURITY_HEADERS,
  BASE_SECURITY_HEADERS,
  bearerKey,
  createKey,
  createVitrinaId,
  HTML_CSP,
  hashKey,
  isAllowedOrigin,
  isIssuedVitrinaId,
  readJson,
} from './security';
import type { Env } from './types';
import { VERSION } from './version';
import { MAX_WAIT_MS, type VitrinaError } from './vitrina';

export { Vitrina } from './vitrina';

/** Bump when the skills catalog changes so cached answers are replaced. */
const CATALOG_REV = '1';

const MAX_STATUS_BYTES = LIMITS.bytes;
const MAX_ACTION_BYTES = 2048;
const MAX_MCP_BYTES = 65_536;
const MAX_PUSH_BYTES = 2048;
const MAX_NOTE = 500;

type App = { Bindings: Env; Variables: { vitrinaId: string } };
type Ctx = Context<App>;

const app = new Hono<App>();

// ---------- helpers ----------

function fail(
  c: Ctx,
  status: 400 | 401 | 403 | 404 | 405 | 409 | 413 | 415 | 422 | 429 | 500 | 503,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  return c.json({ error: { code, message, ...extra } }, status);
}

const ERROR_STATUS: Record<VitrinaError, [400 | 401 | 404 | 409 | 429, string]> = {
  not_found: [404, 'This vitrina does not exist or has expired.'],
  unauthorized: [401, 'That key does not open this vitrina.'],
  too_many_agents: [409, 'This vitrina is full. Remove an agent before adding another one.'],
  unknown_agent: [404, 'There is no agent with that id in this vitrina.'],
  unknown_action: [409, 'The agent did not declare that action, so it cannot be sent.'],
  confirmation_required: [
    400,
    'This action is sensitive. Send "confirm": true once the person has confirmed it.',
  ],
  too_many_actions: [429, 'Too many decisions are waiting to be collected by the agents.'],
  too_many_subscriptions: [
    409,
    'This vitrina already notifies as many devices as it can. Turn notifications off on one first.',
  ],
};

function failWith(c: Ctx, error: VitrinaError) {
  const [status, message] = ERROR_STATUS[error];
  if (status === 401) c.header('www-authenticate', 'Bearer');
  return fail(c, status, error, message);
}

async function limited(limiter: RateLimit | undefined, key: string): Promise<boolean> {
  if (!limiter) return false;
  try {
    return !(await limiter.limit({ key })).success;
  } catch {
    // Availability first: a failing limiter must not take the API down.
    return false;
  }
}

function tooMany(c: Ctx) {
  c.header('retry-after', '60');
  return fail(c, 429, 'rate_limited', 'Too many requests. Try again in a minute.');
}

const clientIp = (c: Ctx) => c.req.header('cf-connecting-ip') ?? 'unknown';
const origin = (c: Ctx) => new URL(c.req.url).origin;
const extraOrigins = (env: Env) =>
  (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
const stubFor = (c: Ctx) => c.env.VITRINA.get(c.env.VITRINA.idFromName(c.get('vitrinaId')));

function requireKey(c: Ctx): string | Response {
  const key = bearerKey(c.req.raw);
  if (key) return key;
  c.header('www-authenticate', 'Bearer');
  return fail(c, 401, 'unauthorized', 'Send the vitrina key as "Authorization: Bearer gk_…".');
}

// ---------- middleware ----------

// Every API answer: hardened headers, never cached unless a route says otherwise.
app.use('*', async (c, next) => {
  await next();
  if (c.res.status === 101) return;
  for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) c.res.headers.set(name, value);
  if (!c.res.headers.has('cache-control')) c.res.headers.set('cache-control', 'no-store');
});

// Browsers from other sites cannot drive the API (agents and CLIs send no Origin).
app.use('*', async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    if (!isAllowedOrigin(c.req.raw, extraOrigins(c.env))) {
      return fail(c, 403, 'forbidden_origin', 'This API cannot be called from another website.');
    }
  }
  return next();
});

// Vitrina ids prove their own origin: made-up ids stop here, before any storage is touched.
const withVitrina = async (c: Ctx, next: () => Promise<void>) => {
  const secret = c.env.ID_SECRET;
  if (!secret) return fail(c, 503, 'not_configured', 'This deployment has no ID_SECRET yet.');
  const id = c.req.param('id') ?? '';
  if (!(await isIssuedVitrinaId(secret, id))) {
    return fail(c, 404, 'not_found', 'This vitrina does not exist or has expired.');
  }
  c.set('vitrinaId', id);
  return next();
};
app.use('/api/vitrinas/:id', withVitrina);
app.use('/api/vitrinas/:id/*', withVitrina);
app.use('/mcp/:id', withVitrina);

// ---------- health ----------

app.get('/api/health', (c) =>
  c.json({ ok: true, name: 'glimo', version: VERSION, spec: SPEC_VERSION }),
);

// ---------- vitrinas ----------

app.post('/api/vitrinas', async (c) => {
  const secret = c.env.ID_SECRET;
  if (!secret) return fail(c, 503, 'not_configured', 'This deployment has no ID_SECRET yet.');
  if (await limited(c.env.RL_CREATE, clientIp(c))) return tooMany(c);

  const id = await createVitrinaId(secret);
  const key = createKey();
  const stub = c.env.VITRINA.get(c.env.VITRINA.idFromName(id));
  const created = await stub.init(id, await hashKey(key));
  if (!created.ok) return fail(c, 500, 'internal', 'Could not create the vitrina. Try again.');
  c.executionCtx.waitUntil(
    drizzle(c.env.DB)
      .insert(vitrinas)
      .values({ id, createdAt: new Date() })
      .onConflictDoNothing()
      .then(() => undefined),
  );
  const base = origin(c);
  return c.json(
    {
      id,
      // Shown once. Only its SHA-256 is stored.
      key,
      url: `${base}/v/${id}`,
      api: `${base}/api/vitrinas/${id}`,
      mcp: `${base}/mcp/${id}`,
      expiresAt: new Date(created.expiresAt).toISOString(),
    },
    201,
  );
});

app.get('/api/vitrinas/:id', async (c) => {
  if (await limited(c.env.RL_READ, clientIp(c))) return tooMany(c);
  const snapshot = await stubFor(c).snapshot();
  if (!snapshot.ok) return failWith(c, snapshot.error);
  const etag = `W/"${c.get('vitrinaId').slice(1, 9)}-${snapshot.seq}"`;
  c.header('etag', etag);
  c.header('cache-control', 'private, no-cache');
  if (c.req.header('if-none-match') === etag) return c.body(null, 304);
  return c.json({
    id: c.get('vitrinaId'),
    seq: snapshot.seq,
    agents: snapshot.agents,
    expiresAt: new Date(snapshot.expiresAt).toISOString(),
  });
});

app.post('/api/vitrinas/:id/status', async (c) => {
  const key = requireKey(c);
  if (key instanceof Response) return key;
  if (await limited(c.env.RL_WRITE, c.get('vitrinaId'))) return tooMany(c);

  const body = await readJson(c.req.raw, MAX_STATUS_BYTES);
  if (!body.ok) return fail(c, body.status, 'invalid_body', body.message);
  const input =
    typeof body.value === 'object' && body.value !== null && !Array.isArray(body.value)
      ? (body.value as Record<string, unknown>)
      : {};
  // Small conveniences so a one-line curl works: spec and updatedAt are filled in.
  const parsed = parseGlimoStatus({
    ...input,
    spec: input.spec ?? SPEC_VERSION,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  });
  if (!parsed.ok) {
    return fail(c, 422, 'invalid_status', 'That is not a valid Glimo Spec status.', {
      issues: parsed.issues,
    });
  }
  // What the agent sees and thinks never reaches this server in clear text.
  const { status, dropped } = redactSensitive(parsed.status);
  const result = await stubFor(c).upsert(await hashKey(key), status);
  if (!result.ok) return failWith(c, result.error);
  return c.json({
    ok: true,
    seq: result.seq,
    ...(dropped.length > 0
      ? {
          dropped,
          note: 'pov and thoughts are sensitive: this hosted vitrina does not store them.',
        }
      : {}),
  });
});

app.delete('/api/vitrinas/:id/agents/:agentId', async (c) => {
  const key = requireKey(c);
  if (key instanceof Response) return key;
  if (await limited(c.env.RL_WRITE, c.get('vitrinaId'))) return tooMany(c);
  const result = await stubFor(c).remove(await hashKey(key), c.req.param('agentId'));
  if (!result.ok) return failWith(c, result.error);
  return c.json({ ok: true, seq: result.seq });
});

// The person decides from the vitrina.
app.post('/api/vitrinas/:id/actions', async (c) => {
  const key = requireKey(c);
  if (key instanceof Response) return key;
  if (await limited(c.env.RL_WRITE, c.get('vitrinaId'))) return tooMany(c);

  const body = await readJson(c.req.raw, MAX_ACTION_BYTES);
  if (!body.ok) return fail(c, body.status, 'invalid_body', body.message);
  const input = (body.value ?? {}) as Record<string, unknown>;
  const { agentId, actionId, note, confirm } = input;
  if (typeof agentId !== 'string' || typeof actionId !== 'string') {
    return fail(c, 422, 'invalid_action', 'Send "agentId" and "actionId".');
  }
  if (note !== undefined && (typeof note !== 'string' || note.length > MAX_NOTE)) {
    return fail(c, 422, 'invalid_action', `"note" must be text of at most ${MAX_NOTE} characters.`);
  }
  const vitrinaId = c.get('vitrinaId');
  const result = await stubFor(c).act(await hashKey(key), {
    agentId,
    actionId,
    confirm: confirm === true,
    ...(typeof note === 'string' && note.trim() ? { note: note.trim() } : {}),
  });
  if (!result.ok) return failWith(c, result.error);
  // Audit log: what, on which agent, when. Never the free text.
  c.executionCtx.waitUntil(
    drizzle(c.env.DB)
      .insert(actionLog)
      .values({
        vitrinaId,
        agentId,
        actionId,
        label: result.label,
        sensitive: result.sensitive,
        createdAt: new Date(),
      })
      .then(() => undefined),
  );
  return c.json({ ok: true, action: result.action }, 201);
});

// The agent collects the decisions addressed to it (long poll with ?wait=seconds).
app.get('/api/vitrinas/:id/actions', async (c) => {
  const key = requireKey(c);
  if (key instanceof Response) return key;
  if (await limited(c.env.RL_WRITE, c.get('vitrinaId'))) return tooMany(c);
  const agent = c.req.query('agent') ?? '';
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(agent)) {
    return fail(c, 422, 'invalid_agent', 'Send ?agent=<agent id>.');
  }
  const seconds = Number(c.req.query('wait') ?? '0');
  const wait = Number.isFinite(seconds) ? Math.min(Math.max(0, seconds * 1000), MAX_WAIT_MS) : 0;
  const result = await stubFor(c).pull(await hashKey(key), agent, wait);
  if (!result.ok) return failWith(c, result.error);
  return c.json({ actions: result.actions });
});

// Audit log of the decisions taken in this vitrina.
app.get('/api/vitrinas/:id/log', async (c) => {
  const key = requireKey(c);
  if (key instanceof Response) return key;
  if (await limited(c.env.RL_WRITE, c.get('vitrinaId'))) return tooMany(c);
  // The Durable Object is the authority on who holds the key.
  const check = await stubFor(c).check(await hashKey(key));
  if (!check.ok) return failWith(c, check.error);
  const rows = await drizzle(c.env.DB)
    .select({
      agentId: actionLog.agentId,
      actionId: actionLog.actionId,
      label: actionLog.label,
      sensitive: actionLog.sensitive,
      at: actionLog.createdAt,
    })
    .from(actionLog)
    .where(eq(actionLog.vitrinaId, c.get('vitrinaId')))
    .orderBy(desc(actionLog.createdAt))
    .limit(50);
  return c.json({ log: rows });
});

// ---------- notifications (Web Push) ----------

function pushOff(c: Ctx) {
  return fail(c, 503, 'push_not_configured', 'Notifications are not set up on this deployment.');
}

// The public key a browser needs to subscribe.
app.get('/api/push/key', async (c) => {
  if (await limited(c.env.RL_READ, clientIp(c))) return tooMany(c);
  const vapid = await loadVapid(c.env);
  if (!vapid) return pushOff(c);
  return c.json({ publicKey: vapid.publicKey });
});

// A device asks to be told when an agent needs the person. Watching is a read
// capability, so the vitrina id is enough. What it sends is never returned by any read.
app.post('/api/vitrinas/:id/push', async (c) => {
  if (await limited(c.env.RL_WRITE, c.get('vitrinaId'))) return tooMany(c);
  const body = await readJson(c.req.raw, MAX_PUSH_BYTES);
  if (!body.ok) return fail(c, body.status, 'invalid_body', body.message);
  // The address is checked before anything else: this server will post to it.
  const parsed = await parseSubscription(body.value);
  if (!parsed.ok) return fail(c, parsed.status, parsed.code, parsed.message);
  if (!(await loadVapid(c.env))) return pushOff(c);
  const result = await stubFor(c).subscribe({ ...parsed.subscription, site: origin(c) });
  if (!result.ok) return failWith(c, result.error);
  return c.json({ ok: true }, 201);
});

app.delete('/api/vitrinas/:id/push', async (c) => {
  if (await limited(c.env.RL_WRITE, c.get('vitrinaId'))) return tooMany(c);
  const body = await readJson(c.req.raw, MAX_PUSH_BYTES);
  if (!body.ok) return fail(c, body.status, 'invalid_body', body.message);
  const endpoint = (body.value as { endpoint?: unknown } | null)?.endpoint;
  if (typeof endpoint !== 'string') {
    return fail(c, 422, 'invalid_subscription', 'Send "endpoint": the address to forget.');
  }
  const checked = checkPushEndpoint(endpoint);
  if (!checked.ok) return fail(c, checked.status, checked.code, checked.message);
  const result = await stubFor(c).unsubscribe(checked.endpoint);
  if (!result.ok) return failWith(c, result.error);
  return c.json({ ok: true });
});

// ---------- skills catalog (D1 + Drizzle, cached at the edge) ----------

const normalizeQuery = (raw: string | undefined) =>
  (raw ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 32);

/** Fresh for 5 minutes; after that the stale answer is served while a new one is fetched. */
const CATALOG_FRESH_MS = 5 * 60_000;

async function queryCatalog(env: Env, q: string): Promise<Response> {
  const pattern = `%${q}%`;
  const rows = await drizzle(env.DB)
    .select()
    .from(skills)
    .where(
      q
        ? or(
            like(skills.slug, pattern),
            like(skills.name, pattern),
            like(skills.summary, pattern),
            like(skills.nameEs, pattern),
            like(skills.summaryEs, pattern),
            like(skills.category, pattern),
          )
        : undefined,
    )
    .orderBy(skills.position)
    .limit(60);
  const body = JSON.stringify({
    skills: rows.map(({ updatedAt: _updatedAt, position: _position, ...skill }) => skill),
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  const etag = `"${[...new Uint8Array(digest).subarray(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('')}"`;
  return new Response(body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // How long the edge keeps the entry at all. Freshness is tracked with x-glimo-cached-at.
      'cache-control': 'public, s-maxage=86400',
      'x-glimo-cached-at': String(Date.now()),
      etag,
    },
  });
}

app.get('/api/skills', async (c) => {
  if (await limited(c.env.RL_READ, clientIp(c))) return tooMany(c);
  const q = normalizeQuery(c.req.query('q'));
  // The cache key is built from the normalised query, never from the raw URL.
  const cacheKey = new Request(
    `${origin(c)}/api/skills?q=${encodeURIComponent(q)}&rev=${CATALOG_REV}`,
  );
  const cache = caches.default;
  const refresh = async () => {
    const fresh = await queryCatalog(c.env, q);
    await cache.put(cacheKey, fresh.clone());
    return fresh;
  };

  let response = await cache.match(cacheKey);
  let state: 'HIT' | 'STALE' | 'MISS' = 'HIT';
  if (!response) {
    // Nothing cached: answer from D1 and store it without making the caller wait.
    state = 'MISS';
    response = await queryCatalog(c.env, q);
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  } else if (Date.now() - Number(response.headers.get('x-glimo-cached-at')) > CATALOG_FRESH_MS) {
    // Stale-while-revalidate at the edge: this caller gets the stale answer at once,
    // the next one gets the fresh one.
    state = 'STALE';
    c.executionCtx.waitUntil(refresh().catch(() => undefined));
  }

  const etag = response.headers.get('etag');
  const headers = new Headers(response.headers);
  headers.delete('x-glimo-cached-at');
  headers.set('cache-control', 'public, max-age=60');
  headers.set('x-glimo-cache', state);
  if (etag && c.req.header('if-none-match') === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(response.body, { status: 200, headers });
});

// ---------- MCP (Streamable HTTP) ----------

app.post('/mcp/:id', async (c) => {
  const key = requireKey(c);
  if (key instanceof Response) return key;
  if (await limited(c.env.RL_WRITE, c.get('vitrinaId'))) return tooMany(c);
  const body = await readJson(c.req.raw, MAX_MCP_BYTES);
  if (!body.ok) {
    return c.json(
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: body.message } },
      body.status,
    );
  }
  const keyHash = await hashKey(key);
  const stub = stubFor(c);
  // The key must open this vitrina before any tool is even listed.
  const check = await stub.check(keyHash);
  if (!check.ok) return failWith(c, check.error);

  const backend = {
    version: VERSION,
    vitrinaUrl: `${origin(c)}/v/${c.get('vitrinaId')}`,
    upsert: (status: Parameters<typeof stub.upsert>[1]) => stub.upsert(keyHash, status),
    pull: (agentId: string, waitMs: number) => stub.pull(keyHash, agentId, waitMs),
    snapshot: () => stub.snapshot(),
  };
  const messages = Array.isArray(body.value) ? body.value.slice(0, 10) : [body.value];
  const answers: JsonRpcResponse[] = [];
  for (const message of messages) {
    const answer = await handleMcpMessage(message, backend);
    if (answer) answers.push(answer);
  }
  if (answers.length === 0) return c.body(null, 202);
  return c.json(Array.isArray(body.value) ? answers : (answers[0] as JsonRpcResponse));
});

app.all('/mcp/:id', (c) => {
  c.header('allow', 'POST');
  return fail(c, 405, 'method_not_allowed', 'This MCP endpoint only answers POST.');
});

// ---------- fallbacks ----------

app.notFound((c) => fail(c, 404, 'not_found', 'There is nothing at this address.'));

app.onError((error, c) => {
  // Never echo internals to the client; never log request headers (they carry keys).
  console.error('unhandled', c.req.method, new URL(c.req.url).pathname, String(error));
  return fail(c, 500, 'internal', 'Something went wrong on our side.');
});

// ---------- entry ----------

/**
 * /v/:id is the live vitrina page. Its URL is a capability, so the page is never
 * indexed, never cached by shared caches and never leaks its address in a Referer.
 */
async function serveVitrinaPage(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed.', { status: 405, headers: { allow: 'GET, HEAD' } });
  }
  const shell = new URL('/v/', request.url);
  const asset = await env.ASSETS.fetch(new Request(shell, { method: request.method }));
  const response = new Response(asset.body, asset);
  for (const [name, value] of Object.entries(BASE_SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }
  response.headers.set('content-security-policy', HTML_CSP);
  response.headers.set('referrer-policy', 'no-referrer');
  response.headers.set('x-robots-tag', 'noindex, nofollow');
  // no-transform: nothing may inject scripts into this page on its way out.
  response.headers.set('cache-control', 'private, no-cache, no-transform');
  return response;
}

const LIVE_PATH = /^\/api\/vitrinas\/([^/]+)\/live$/;

const plain = (status: number, message: string) =>
  new Response(JSON.stringify({ error: { code: 'live_channel', message } }), {
    status,
    headers: { ...API_SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8' },
  });

/**
 * Live channel: one WebSocket per screen, incremental messages. Handled outside the
 * router so the 101 response reaches the client untouched.
 */
async function serveLive(request: Request, env: Env, id: string): Promise<Response> {
  if (request.method !== 'GET') return plain(405, 'Open this URL as a WebSocket.');
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
    return plain(426, 'Open this URL as a WebSocket.');
  }
  if (!isAllowedOrigin(request, extraOrigins(env))) {
    return plain(403, 'The live channel cannot be opened from another website.');
  }
  if (!env.ID_SECRET || !(await isIssuedVitrinaId(env.ID_SECRET, id))) {
    return plain(404, 'This vitrina does not exist or has expired.');
  }
  if (await limited(env.RL_READ, request.headers.get('cf-connecting-ip') ?? 'unknown')) {
    return plain(429, 'Too many requests. Try again in a minute.');
  }
  return env.VITRINA.get(env.VITRINA.idFromName(id)).fetch(request);
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === '/v' || url.pathname.startsWith('/v/')) {
      return serveVitrinaPage(request, env);
    }
    const live = LIVE_PATH.exec(url.pathname);
    if (live) return serveLive(request, env, live[1] as string);
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
