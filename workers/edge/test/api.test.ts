import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
// The static site's headers file must carry the same policy the Worker sends.
import siteHeaders from '../../../apps/web/public/_headers?raw';
import { HTML_CSP, KEY_PATTERN, VITRINA_ID_PATTERN } from '../src/security';

const ORIGIN = 'https://glimo.test';

type Json = Record<string, unknown>;

function call(path: string, init: RequestInit & { key?: string; json?: unknown } = {}) {
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
async function createVitrina() {
  visitor += 1;
  const response = await call('/api/vitrinas', {
    method: 'POST',
    headers: { 'cf-connecting-ip': `203.0.113.${visitor % 250}` },
  });
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string; key: string; url: string; mcp: string };
}

const status = (id: string, state: string, extra: Json = {}) => ({
  agent: { id, name: id[0]?.toUpperCase() + id.slice(1) },
  state,
  ...extra,
});

async function push(v: { id: string; key: string }, body: unknown) {
  return call(`/api/vitrinas/${v.id}/status`, { method: 'POST', key: v.key, json: body });
}

describe('health and hardening', () => {
  it('answers health with hardened headers and no caching', async () => {
    const response = await call('/api/health');
    expect(await response.json()).toMatchObject({ ok: true, spec: 'glimo/0.1' });
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(response.headers.get('strict-transport-security')).toContain('max-age=63072000');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('unknown API paths are a JSON 404 without internals', async () => {
    const response = await call('/api/nope/../../etc/passwd');
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'not_found' } });
  });

  it('other websites cannot drive the API', async () => {
    const response = await call('/api/vitrinas', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
    });
    expect(response.status).toBe(403);
    const same = await call('/api/vitrinas', {
      method: 'POST',
      headers: { origin: ORIGIN, 'cf-connecting-ip': '198.51.100.7' },
    });
    expect(same.status).toBe(201);
  });

  it('one address cannot mint vitrinas without limit', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 14; i++) {
      const response = await call('/api/vitrinas', {
        method: 'POST',
        headers: { 'cf-connecting-ip': '198.51.100.99' },
      });
      statuses.push(response.status);
    }
    expect(statuses.filter((s) => s === 201).length).toBeLessThanOrEqual(10);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe('vitrinas', () => {
  it('creates a vitrina with a signed id and a one-time key', async () => {
    const v = await createVitrina();
    expect(v.id).toMatch(VITRINA_ID_PATTERN);
    expect(v.key).toMatch(KEY_PATTERN);
    expect(v.url).toBe(`${ORIGIN}/v/${v.id}`);
    const snapshot = (await (await call(`/api/vitrinas/${v.id}`)).json()) as Json;
    expect(snapshot).toMatchObject({ id: v.id, seq: 0, agents: [] });
  });

  it('never stores the key, only its hash', async () => {
    const v = await createVitrina();
    const stub = env.VITRINA.get(env.VITRINA.idFromName(v.id));
    const stored = await runInDurableObject(stub, (_instance, state) =>
      JSON.stringify(state.storage.sql.exec('SELECT * FROM meta').toArray()),
    );
    expect(stored).not.toContain(v.key);
    expect(stored).toMatch(/"keyHash\\?":\\?"[0-9a-f]{64}/);
  });

  it('made-up and tampered ids are rejected before any storage is touched', async () => {
    const v = await createVitrina();
    const tampered = `${v.id.slice(0, -1)}${v.id.endsWith('0') ? '1' : '0'}`;
    for (const id of [
      'v0000000000000000000000000',
      tampered,
      'nope',
      '..%2f..%2fetc',
      'v'.repeat(300),
    ]) {
      const response = await call(`/api/vitrinas/${id}`);
      expect(response.status).toBe(404);
    }
    const ids = await runInDurableObject(
      env.VITRINA.get(env.VITRINA.idFromName(v.id)),
      () => 'only-the-real-one',
    );
    expect(ids).toBe('only-the-real-one');
  });

  it('writes need the key', async () => {
    const v = await createVitrina();
    const other = await createVitrina();
    const path = `/api/vitrinas/${v.id}/status`;
    const body = status('sales', 'working');

    const missing = await call(path, { method: 'POST', json: body });
    expect(missing.status).toBe(401);
    expect(missing.headers.get('www-authenticate')).toBe('Bearer');
    expect((await call(path, { method: 'POST', json: body, key: other.key })).status).toBe(401);
    expect((await call(path, { method: 'POST', json: body, key: 'gk_short' })).status).toBe(401);
    expect(
      (await call(path, { method: 'POST', json: body, headers: { authorization: 'Basic abc' } }))
        .status,
    ).toBe(401);
    // A key in the URL is ignored: it would end up in logs.
    expect((await call(`${path}?key=${v.key}`, { method: 'POST', json: body })).status).toBe(401);

    expect((await push(v, body)).status).toBe(200);
  });

  it('stores a status and keeps every glim in its place on the shelf', async () => {
    const v = await createVitrina();
    await push(v, status('support', 'working'));
    await push(v, status('legal', 'sleeping'));
    await push(v, status('data', 'blocked', { say: 'Its credential expired' }));
    const result = (await (await push(v, status('sales', 'waiting'))).json()) as Json;
    expect(result).toEqual({ ok: true, seq: 4 });

    const response = await call(`/api/vitrinas/${v.id}`);
    const snapshot = (await response.json()) as { agents: { agent: { id: string } }[] };
    expect(snapshot.agents.map((a) => a.agent.id)).toEqual(['support', 'legal', 'data', 'sales']);
    // Updating an agent does not move it.
    await push(v, status('legal', 'working'));
    const again = (await (await call(`/api/vitrinas/${v.id}`)).json()) as typeof snapshot;
    expect(again.agents.map((a) => a.agent.id)).toEqual(['support', 'legal', 'data', 'sales']);

    const fresh = await call(`/api/vitrinas/${v.id}`);
    const etag = fresh.headers.get('etag') as string;
    const cached = await call(`/api/vitrinas/${v.id}`, { headers: { 'if-none-match': etag } });
    expect(cached.status).toBe(304);
  });

  it('rejects what is not Glimo Spec and says why', async () => {
    const v = await createVitrina();
    const response = await push(v, { agent: { id: 'Sales!', name: '' }, state: 'dancing' });
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { issues: { path: string }[] } };
    expect(body.error.issues.map((i) => i.path).sort()).toEqual([
      'agent.id',
      'agent.name',
      'state',
    ]);
  });

  it('never stores what the agent sees or thinks', async () => {
    const v = await createVitrina();
    const response = await push(
      v,
      status('sales', 'waiting', {
        pov: { app: 'Mail', focus: 'Draft for Hotel Azahar' },
        thoughts: [{ at: '2026-11-23T10:30:00Z', text: 'Three asked for pricing.' }],
      }),
    );
    expect(await response.json()).toMatchObject({ ok: true, dropped: ['pov', 'thoughts'] });
    const text = await (await call(`/api/vitrinas/${v.id}`)).text();
    expect(text).not.toContain('Hotel Azahar');
    expect(text).not.toContain('pricing');
  });

  it('refuses oversized, mistyped and malformed bodies', async () => {
    const v = await createVitrina();
    const path = `/api/vitrinas/${v.id}/status`;
    const big = await push(v, status('sales', 'working', { say: 'x'.repeat(20_000) }));
    expect(big.status).toBe(413);
    const form = await call(path, {
      method: 'POST',
      key: v.key,
      body: 'state=working',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(form.status).toBe(415);
    const broken = await call(path, {
      method: 'POST',
      key: v.key,
      body: '{"agent":',
      headers: { 'content-type': 'application/json' },
    });
    expect(broken.status).toBe(400);
  });

  it('removes an agent', async () => {
    const v = await createVitrina();
    await push(v, status('sales', 'working'));
    const path = `/api/vitrinas/${v.id}/agents/sales`;
    expect((await call(path, { method: 'DELETE' })).status).toBe(401);
    expect((await call(path, { method: 'DELETE', key: v.key })).status).toBe(200);
    expect((await call(path, { method: 'DELETE', key: v.key })).status).toBe(404);
  });

  it('caps the number of agents', async () => {
    const v = await createVitrina();
    for (let i = 0; i < 50; i++) await push(v, status(`agent-${i}`, 'idle'));
    expect((await push(v, status('one-too-many', 'idle'))).status).toBe(409);
    expect((await push(v, status('agent-3', 'working'))).status).toBe(200);
  });

  it('expires after its time without activity and leaves nothing behind', async () => {
    const v = await createVitrina();
    await push(v, status('sales', 'working'));
    const stub = env.VITRINA.get(env.VITRINA.idFromName(v.id));
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await call(`/api/vitrinas/${v.id}`)).status).toBe(200);

    await runInDurableObject(stub, async (instance, state) => {
      (instance as unknown as { meta: { lastActive: number } }).meta.lastActive = 0;
      await state.storage.setAlarm(Date.now() + 1000);
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await call(`/api/vitrinas/${v.id}`)).status).toBe(404);
    expect((await push(v, status('sales', 'working'))).status).toBe(404);
  });
});

describe('actions: the person decides, the agent collects', () => {
  const waiting = status('sales', 'waiting', {
    say: 'Wants to send 12 emails',
    actions: [
      { id: 'approve', label: 'Approve sending', kind: 'primary', sensitive: true },
      { id: 'open', label: 'Edit drafts' },
    ],
  });

  it('only accepts actions the agent declared, and confirms the sensitive ones', async () => {
    const v = await createVitrina();
    await push(v, waiting);
    const path = `/api/vitrinas/${v.id}/actions`;
    const act = (json: Json) => call(path, { method: 'POST', key: v.key, json });

    const noKey = await call(path, {
      method: 'POST',
      json: { agentId: 'sales', actionId: 'approve', confirm: true },
    });
    expect(noKey.status).toBe(401);
    expect((await act({ agentId: 'ghost', actionId: 'approve' })).status).toBe(404);
    const invented = await act({ agentId: 'sales', actionId: 'delete-everything', confirm: true });
    expect(invented.status).toBe(409);
    const unconfirmed = await act({ agentId: 'sales', actionId: 'approve' });
    expect(unconfirmed.status).toBe(400);
    expect(await unconfirmed.json()).toMatchObject({ error: { code: 'confirmation_required' } });

    const approved = await act({ agentId: 'sales', actionId: 'approve', confirm: true });
    expect(approved.status).toBe(201);
    expect(
      (await act({ agentId: 'sales', actionId: 'open', note: 'Shorter subject' })).status,
    ).toBe(201);

    const pull = () => call(`${path}?agent=sales`, { key: v.key });
    expect((await call(`${path}?agent=sales`)).status).toBe(401);
    const first = (await (await pull()).json()) as { actions: Json[] };
    expect(first.actions.map((a) => a.actionId)).toEqual(['approve', 'open']);
    expect(first.actions[1]).toMatchObject({ note: 'Shorter subject' });
    // Each decision is delivered once.
    expect(await (await pull()).json()).toEqual({ actions: [] });

    const log = (await (await call(`/api/vitrinas/${v.id}/log`, { key: v.key })).json()) as {
      log: Json[];
    };
    expect(log.log).toHaveLength(2);
    expect(JSON.stringify(log.log)).not.toContain('Shorter subject');
    expect(log.log.map((entry) => entry.sensitive).sort()).toEqual([false, true]);
    expect((await call(`/api/vitrinas/${v.id}/log`)).status).toBe(401);
  });

  it('a waiting agent is woken by the decision (long poll)', async () => {
    const v = await createVitrina();
    await push(v, waiting);
    const path = `/api/vitrinas/${v.id}/actions`;
    const pending = call(`${path}?agent=sales&wait=5`, { key: v.key });
    await call(path, {
      method: 'POST',
      key: v.key,
      json: { agentId: 'sales', actionId: 'open' },
    });
    const body = (await (await pending).json()) as { actions: Json[] };
    expect(body.actions).toHaveLength(1);
  });
});

describe('live channel', () => {
  async function connect(id: string, headers: Record<string, string> = {}) {
    const response = await call(`/api/vitrinas/${id}/live`, {
      headers: { upgrade: 'websocket', ...headers },
    });
    return response;
  }

  it('sends a snapshot, then only what changes', async () => {
    const v = await createVitrina();
    await push(v, status('sales', 'working'));
    const response = await connect(v.id);
    expect(response.status).toBe(101);
    const socket = response.webSocket as WebSocket;
    const messages: Json[] = [];
    socket.addEventListener('message', (event) => {
      messages.push(JSON.parse(String(event.data)) as Json);
    });
    socket.accept();

    await push(v, status('sales', 'waiting'));
    await call(`/api/vitrinas/${v.id}/agents/sales`, { method: 'DELETE', key: v.key });
    await expect.poll(() => messages.length).toBe(3);
    expect(messages.map((m) => [m.t, m.seq])).toEqual([
      ['snapshot', 1],
      ['upsert', 2],
      ['remove', 3],
    ]);
    socket.close(1000);
  });

  it('is read-only and same-origin', async () => {
    const v = await createVitrina();
    expect((await connect(v.id, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await call(`/api/vitrinas/${v.id}/live`)).status).toBe(426);
    expect((await connect('v0000000000000000000000000')).status).toBe(404);

    const socket = (await connect(v.id)).webSocket as WebSocket;
    const closed = new Promise<number>((resolve) =>
      socket.addEventListener('close', (event) => resolve(event.code)),
    );
    socket.accept();
    socket.send('{"t":"upsert","agent":{}}');
    expect(await closed).toBe(1008);
  });
});

describe('MCP endpoint', () => {
  const rpc = (v: { id: string; key?: string }, message: unknown) =>
    call(`/mcp/${v.id}`, { method: 'POST', key: v.key, json: message });

  it('needs the key before anything is listed', async () => {
    const v = await createVitrina();
    const other = await createVitrina();
    const message = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
    expect((await rpc({ id: v.id }, message)).status).toBe(401);
    expect((await rpc({ id: v.id, key: other.key }, message)).status).toBe(401);
    expect((await call(`/mcp/${v.id}`, { key: v.key })).status).toBe(405);
  });

  it('initializes, lists tools and shows a status', async () => {
    const v = await createVitrina();
    const init = (await (
      await rpc(v, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't' } },
      })
    ).json()) as { result: Json };
    expect(init.result).toMatchObject({
      protocolVersion: '2025-06-18',
      serverInfo: { name: 'glimo' },
    });
    expect((await rpc(v, { jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(
      202,
    );

    const tools = (await (
      await rpc(v, { jsonrpc: '2.0', id: 2, method: 'tools/list' })
    ).json()) as {
      result: { tools: { name: string }[] };
    };
    expect(tools.result.tools.map((t) => t.name)).toEqual([
      'glimo_status',
      'glimo_action',
      'glimo_vitrina',
    ]);

    const shown = (await (
      await rpc(v, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'glimo_status',
          arguments: {
            agent: 'claude-code',
            name: 'Claude Code',
            state: 'waiting',
            say: 'Wants to run the migration',
            actions: [{ id: 'approve', label: 'Run it', kind: 'primary', sensitive: true }],
          },
        },
      })
    ).json()) as { result: { content: { text: string }[]; isError?: boolean } };
    expect(shown.result.isError).toBeUndefined();
    expect(shown.result.content[0]?.text).toContain('Claude Code is waiting for you');

    await call(`/api/vitrinas/${v.id}/actions`, {
      method: 'POST',
      key: v.key,
      json: { agentId: 'claude-code', actionId: 'approve', confirm: true },
    });
    const decided = (await (
      await rpc(v, {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'glimo_action', arguments: { agent: 'claude-code' } },
      })
    ).json()) as { result: { structuredContent: { actions: Json[] } } };
    expect(decided.result.structuredContent.actions).toMatchObject([{ actionId: 'approve' }]);
  });

  it('explains invalid tool input instead of failing the protocol', async () => {
    const v = await createVitrina();
    const bad = (await (
      await rpc(v, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'glimo_status', arguments: { agent: 'Bad Id', state: 'flying' } },
      })
    ).json()) as { result: { isError: boolean; content: { text: string }[] } };
    expect(bad.result.isError).toBe(true);
    expect(bad.result.content[0]?.text).toContain('agent.id');

    const unknown = (await (
      await rpc(v, { jsonrpc: '2.0', id: 2, method: 'resources/list' })
    ).json()) as { error: { code: number } };
    expect(unknown.error.code).toBe(-32601);
  });
});

describe('skills catalog (D1 + Drizzle, cached at the edge)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists the seeded catalog and serves the second request from cache', async () => {
    const first = await call('/api/skills');
    expect(first.status).toBe(200);
    expect(first.headers.get('x-glimo-cache')).toBe('MISS');
    expect(first.headers.get('cache-control')).toBe('public, max-age=60');
    expect(first.headers.get('x-glimo-cached-at')).toBeNull();
    const body = (await first.json()) as { skills: { slug: string; states: string[] }[] };
    expect(body.skills.length).toBeGreaterThanOrEqual(7);
    expect(body.skills[0]).toMatchObject({ slug: 'glimo-status' });
    expect(Array.isArray(body.skills[0]?.states)).toBe(true);

    const second = await call('/api/skills');
    expect(second.headers.get('x-glimo-cache')).toBe('HIT');
    const etag = second.headers.get('etag') as string;
    expect((await call('/api/skills', { headers: { 'if-none-match': etag } })).status).toBe(304);
  });

  it('after five minutes serves the stale answer at once and refreshes behind it', async () => {
    const state = async () => (await call('/api/skills?q=calendar')).headers.get('x-glimo-cache');
    expect(await state()).toBe('MISS');
    expect(await state()).toBe('HIT');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 6 * 60_000);
    expect(await state()).toBe('STALE');
    await expect.poll(state).toBe('HIT');
  });

  it('searches without letting the query reach SQL or the cache key raw', async () => {
    const found = (await (await call('/api/skills?q=Invoice')).json()) as { skills: Json[] };
    expect(found.skills.map((s) => s.slug)).toEqual(['invoice-matching']);
    const spanish = (await (await call('/api/skills?q=licitaciones')).json()) as { skills: Json[] };
    expect(spanish.skills.map((s) => s.slug)).toEqual(['tender-radar']);
    const injected = await call(
      `/api/skills?q=${encodeURIComponent("' OR 1=1; DROP TABLE skills;--")}`,
    );
    expect(injected.status).toBe(200);
    expect(((await injected.json()) as { skills: Json[] }).skills).toEqual([]);
    const still = (await (await call('/api/skills')).json()) as { skills: Json[] };
    expect(still.skills.length).toBeGreaterThanOrEqual(7);
  });
});

describe('vitrina page', () => {
  it('serves the app shell with a strict policy and never leaks its address', async () => {
    const response = await call('/v/v0123456789abcdefghjkmnpq');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('id="root"');
    expect(response.headers.get('content-security-policy')).toBe(HTML_CSP);
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect((await call('/v/abc', { method: 'POST' })).status).toBe(405);
  });

  it('the static site ships the same Content-Security-Policy', () => {
    expect(siteHeaders).toContain(`Content-Security-Policy: ${HTML_CSP}`);
  });

  it('redirects www to the apex', async () => {
    const response = await exports.default.fetch(
      new Request('https://www.glimo.test/api/health', { redirect: 'manual' }),
    );
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('https://glimo.test/api/health');
  });
});
