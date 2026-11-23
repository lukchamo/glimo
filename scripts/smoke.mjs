#!/usr/bin/env node
// Smoke test: is a Glimo deployment alive, fast and wired end to end?
// Zero dependencies (Node 22+). Takes a few seconds.
//
//   node scripts/smoke.mjs                      checks https://glimo.dev
//   node scripts/smoke.mjs http://127.0.0.1:8787
//
// It creates one throwaway vitrina (deleted automatically after its expiry).

const base = (process.argv[2] ?? process.env.GLIMO_URL ?? 'https://glimo.dev').replace(/\/$/, '');
const results = [];
let failed = false;

async function check(name, run) {
  const start = performance.now();
  try {
    const detail = await run();
    results.push(['ok', name, Math.round(performance.now() - start), detail ?? '']);
  } catch (error) {
    failed = true;
    results.push([
      'FAIL',
      name,
      Math.round(performance.now() - start),
      String(error.message ?? error),
    ]);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const json = (response) => response.json();
const post = (path, body, key) =>
  fetch(base + path, {
    method: 'POST',
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

let vitrina;
let socket;
const events = [];
const waitFor = (predicate, ms = 5000) =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      const found = events.find(predicate);
      if (found) return resolve(found);
      if (Date.now() - started > ms) return reject(new Error('timed out waiting for a live event'));
      setTimeout(poll, 10);
    };
    poll();
  });

await check('home page is served with a strict policy', async () => {
  const response = await fetch(`${base}/`);
  const html = await response.text();
  assert(response.status === 200, `status ${response.status}`);
  assert(html.includes('data-prerender="full"'), 'home is not prerendered');
  assert(html.includes('class="glim'), 'no glims in the first paint');
  const csp = response.headers.get('content-security-policy') ?? '';
  assert(csp.includes("script-src 'self'"), 'missing Content-Security-Policy');
  assert(response.headers.get('x-content-type-options') === 'nosniff', 'missing nosniff');
  const asset = /\/assets\/index-[\w-]+\.js/.exec(html)?.[0];
  assert(asset, 'no fingerprinted script');
  const script = await fetch(base + asset);
  assert(
    (script.headers.get('cache-control') ?? '').includes('immutable'),
    'fingerprinted assets are not cached forever',
  );
  return `${(html.length / 1024).toFixed(0)} KB of HTML`;
});

await check('Spanish home and playground are served', async () => {
  for (const path of ['/es/', '/playground', '/es/playground']) {
    const response = await fetch(base + path);
    assert(response.status === 200, `${path} → ${response.status}`);
  }
  const missing = await fetch(`${base}/definitely-not-here`);
  assert(missing.status === 404, `unknown page → ${missing.status}`);
});

await check('API health', async () => {
  const body = await json(await fetch(`${base}/api/health`));
  assert(body.ok === true, 'not ok');
  return `v${body.version}, ${body.spec}`;
});

await check('skills catalog comes from D1 and is cached at the edge', async () => {
  const first = await fetch(`${base}/api/skills`);
  const body = await json(first);
  assert(body.skills?.length >= 7, 'catalog is empty');
  const second = await fetch(`${base}/api/skills`);
  await second.arrayBuffer();
  assert(second.headers.get('x-glimo-cache') === 'HIT', 'second request was not a cache hit');
  return `${body.skills.length} skills, ${second.headers.get('x-glimo-cache')}`;
});

await check('create a vitrina', async () => {
  const response = await post('/api/vitrinas');
  assert(response.status === 201, `status ${response.status}`);
  vitrina = await json(response);
  assert(/^v[0-9a-z]{24}$/.test(vitrina.id) && vitrina.key.startsWith('gk_'), 'unexpected shape');
});

await check('live channel opens and sends a snapshot', async () => {
  assert(vitrina, 'no vitrina');
  socket = new WebSocket(`${base.replace(/^http/, 'ws')}/api/vitrinas/${vitrina.id}/live`);
  socket.addEventListener('message', (message) => {
    if (message.data !== 'pong') events.push(JSON.parse(message.data));
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve);
    socket.addEventListener('error', () => reject(new Error('socket error')));
  });
  await waitFor((event) => event.t === 'snapshot');
});

await check('a status reaches every screen as an incremental message', async () => {
  assert(vitrina, 'no vitrina');
  const sent = performance.now();
  const response = await post(
    `/api/vitrinas/${vitrina.id}/status`,
    {
      agent: { id: 'smoke', name: 'Smoke' },
      state: 'waiting',
      say: 'Wants your OK to finish the check',
      actions: [{ id: 'approve', label: 'Approve', kind: 'primary', sensitive: true }],
    },
    vitrina.key,
  );
  assert(response.status === 200, `status ${response.status}`);
  const event = await waitFor((e) => e.t === 'upsert');
  assert(event.agent.state === 'waiting', 'wrong state');
  return `${Math.round(performance.now() - sent)} ms from request to screen`;
});

await check('writes need the key', async () => {
  assert(vitrina, 'no vitrina');
  const body = { agent: { id: 'intruder', name: 'Intruder' }, state: 'working' };
  const none = await post(`/api/vitrinas/${vitrina.id}/status`, body);
  const wrong = await post(`/api/vitrinas/${vitrina.id}/status`, body, `gk_${'A'.repeat(43)}`);
  assert(none.status === 401 && wrong.status === 401, `${none.status} / ${wrong.status}`);
});

await check('the person decides, the agent collects it once', async () => {
  assert(vitrina, 'no vitrina');
  const path = `/api/vitrinas/${vitrina.id}/actions`;
  const unconfirmed = await post(path, { agentId: 'smoke', actionId: 'approve' }, vitrina.key);
  assert(
    unconfirmed.status === 400,
    `sensitive action without confirmation → ${unconfirmed.status}`,
  );
  const decided = await post(
    path,
    { agentId: 'smoke', actionId: 'approve', confirm: true },
    vitrina.key,
  );
  assert(decided.status === 201, `status ${decided.status}`);
  const pull = () =>
    fetch(`${base}${path}?agent=smoke`, {
      headers: { authorization: `Bearer ${vitrina.key}` },
    }).then(json);
  const first = await pull();
  const second = await pull();
  assert(first.actions.length === 1 && second.actions.length === 0, 'not delivered exactly once');
});

await check('MCP endpoint lists tools and shows a status', async () => {
  assert(vitrina, 'no vitrina');
  const rpc = (message) => post(`/mcp/${vitrina.id}`, message, vitrina.key).then(json);
  const init = await rpc({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'smoke', version: '0' },
    },
  });
  assert(init.result?.serverInfo?.name === 'glimo', 'initialize failed');
  const tools = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert(tools.result?.tools?.length === 3, 'expected three tools');
  const shown = await rpc({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'glimo_status',
      arguments: { agent: 'mcp-agent', state: 'done', say: 'Checked' },
    },
  });
  assert(!shown.result?.isError, 'tool call failed');
  await waitFor((e) => e.t === 'upsert' && e.agent.agent.id === 'mcp-agent');
  return tools.result.tools.map((tool) => tool.name).join(', ');
});

await check('vitrina page is private by default', async () => {
  assert(vitrina, 'no vitrina');
  const response = await fetch(`${base}/v/${vitrina.id}`);
  await response.arrayBuffer();
  assert(response.status === 200, `status ${response.status}`);
  assert((response.headers.get('x-robots-tag') ?? '').includes('noindex'), 'page can be indexed');
  assert(response.headers.get('referrer-policy') === 'no-referrer', 'address can leak in Referer');
});

socket?.close();

const width = Math.max(...results.map(([, name]) => name.length));
console.log(`\nGlimo smoke test → ${base}\n`);
for (const [status, name, ms, detail] of results) {
  console.log(
    `${status === 'ok' ? '✓' : '✗'} ${name.padEnd(width)}  ${String(ms).padStart(5)} ms  ${detail}`,
  );
}
const total = results.reduce((sum, [, , ms]) => sum + ms, 0);
console.log(
  `\n${failed ? 'FAILED' : 'All good'} · ${results.length} checks in ${(total / 1000).toFixed(1)} s\n`,
);
process.exit(failed ? 1 : 0);
