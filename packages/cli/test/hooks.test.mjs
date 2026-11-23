import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  agentFor,
  clip,
  loadSettings,
  redact,
  statusFor,
  toolPhrase,
} from '../bin/claude-hook.mjs';
import { main } from '../bin/glimo.mjs';
import {
  hookEntries,
  hooks,
  isOurs,
  mergeHooks,
  registeredEvents,
  withoutOurs,
} from '../bin/hooks.mjs';

const RUNNER_SOURCE = fileURLToPath(new URL('../bin/claude-hook.mjs', import.meta.url));
const EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PermissionRequest',
  'Notification',
  'Stop',
  'StopFailure',
  'SessionEnd',
];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Everything a hook receives that must never leave the machine. */
const SECRET = 'TOP-SECRET-9f3a';
const base = { session_id: 'ab12cd34-0000-4000-8000-000000000000', cwd: `/home/me/${SECRET}/app` };
const tool = (name, input, event = 'PreToolUse') => ({
  ...base,
  hook_event_name: event,
  tool_name: name,
  tool_input: input,
});

describe('event → status', () => {
  it('maps every Claude Code event to a state, an ASP reason and a generic phrase', () => {
    const cases = [
      [{ hook_event_name: 'SessionStart', source: 'startup' }, 'idle', 'idle', 'Ready for a task'],
      [{ hook_event_name: 'SessionStart', source: 'resume' }, 'idle', 'idle', 'Ready for a task'],
      [
        { hook_event_name: 'UserPromptSubmit', prompt: 'x' },
        'thinking',
        'queued',
        'Got a new task',
      ],
      [tool('Edit', {}), 'working', 'working', 'Editing files'],
      [tool('Write', {}), 'working', 'working', 'Editing files'],
      [tool('NotebookEdit', {}), 'working', 'working', 'Editing files'],
      [tool('Bash', {}), 'working', 'working', 'Running a command'],
      [tool('PowerShell', {}), 'working', 'working', 'Running a command'],
      [tool('Read', {}), 'working', 'working', 'Reading the codebase'],
      [tool('Grep', {}), 'working', 'working', 'Reading the codebase'],
      [tool('Glob', {}), 'working', 'working', 'Reading the codebase'],
      [tool('WebSearch', {}), 'working', 'working', 'Searching the web'],
      [tool('WebFetch', {}), 'working', 'working', 'Searching the web'],
      [tool('mcp__github__create_issue', {}), 'working', 'working', 'Using github tools'],
      [tool('mcp__plugin_acme_db__query', {}), 'working', 'working', 'Using plugin_acme_db tools'],
      [tool('Agent', {}), 'working', 'working', 'Delegating to a subagent'],
      [tool('Task', {}), 'working', 'working', 'Delegating to a subagent'],
      [tool('SomethingNew', {}), 'working', 'working', 'Working on it'],
      [tool('AskUserQuestion', {}), 'waiting', 'input-required', 'Has a question for you'],
      [
        tool('ExitPlanMode', {}),
        'waiting',
        'awaiting-approval',
        'Has a plan ready for your review',
      ],
      [
        tool('Bash', {}, 'PermissionRequest'),
        'waiting',
        'awaiting-approval',
        'Needs your permission',
      ],
      [
        { hook_event_name: 'Notification', notification_type: 'permission_prompt' },
        'waiting',
        'awaiting-approval',
        'Needs your permission',
      ],
      [
        { hook_event_name: 'Notification', message: 'Claude needs your permission to use Bash' },
        'waiting',
        'awaiting-approval',
        'Needs your permission',
      ],
      [
        { hook_event_name: 'Notification', notification_type: 'elicitation_dialog' },
        'waiting',
        'input-required',
        'Needs your input',
      ],
      [{ hook_event_name: 'Stop' }, 'done', 'completed', 'Finished its turn'],
      [
        { hook_event_name: 'StopFailure', error: 'rate_limit' },
        'tired',
        'rate-limited',
        'Hit a rate limit',
      ],
      [
        { hook_event_name: 'StopFailure', error: 'authentication_failed' },
        'blocked',
        'auth-error',
        'Needs you to sign in again',
      ],
      [
        { hook_event_name: 'StopFailure', error: 'server_error' },
        'blocked',
        'failed',
        'Stopped by an API error',
      ],
    ];
    for (const [input, state, reason, say] of cases) {
      expect(statusFor({ ...base, ...input }), JSON.stringify(input)).toEqual({
        state,
        reason,
        say,
      });
    }
  });

  it('takes the glim away when the session ends and ignores what changes nothing', () => {
    expect(statusFor({ ...base, hook_event_name: 'SessionEnd', reason: 'other' })).toEqual({
      remove: true,
    });
    // After a compaction the session is still in the middle of its work.
    expect(statusFor({ ...base, hook_event_name: 'SessionStart', source: 'compact' })).toBeNull();
    expect(
      statusFor({ ...base, hook_event_name: 'Notification', notification_type: 'idle_prompt' }),
    ).toBeNull();
    expect(
      statusFor({ ...base, hook_event_name: 'Notification', notification_type: 'auth_success' }),
    ).toBeNull();
    expect(statusFor({ ...base, hook_event_name: 'PostToolUse', tool_name: 'Bash' })).toBeNull();
    expect(statusFor({ ...base, hook_event_name: 'SomethingNew' })).toBeNull();
  });

  const loaded = [
    { hook_event_name: 'SessionStart', source: 'startup', session_title: SECRET, model: SECRET },
    { hook_event_name: 'UserPromptSubmit', prompt: `please read ${SECRET}` },
    tool('Bash', { command: `curl -H "x: ${SECRET}" example.com`, description: SECRET }),
    tool('Edit', { file_path: `/home/me/${SECRET}.ts`, old_string: SECRET, new_string: SECRET }),
    tool('Write', { file_path: `/home/me/${SECRET}.env`, content: `KEY=${SECRET}` }),
    tool('Read', { file_path: `/home/me/${SECRET}.pem` }),
    tool('Grep', { pattern: SECRET, path: `/home/me/${SECRET}` }),
    tool('WebFetch', { url: `https://example.com/?token=${SECRET}`, prompt: SECRET }),
    tool('WebSearch', { query: SECRET }),
    tool('Agent', { prompt: SECRET, description: SECRET }),
    tool('mcp__github__create_issue', { title: SECRET, body: SECRET }),
    tool('AskUserQuestion', { questions: [{ question: SECRET, header: SECRET }] }),
    tool('ExitPlanMode', { plan: SECRET, planFilePath: `/home/me/${SECRET}.md` }),
    tool('Bash', { command: `rm -rf ${SECRET}` }, 'PermissionRequest'),
    { hook_event_name: 'Notification', notification_type: 'permission_prompt', message: SECRET },
    { hook_event_name: 'Stop', last_assistant_message: SECRET },
    { hook_event_name: 'StopFailure', error: 'server_error', error_details: SECRET },
  ];

  it('sends no prompt, command, path or tool input by default', () => {
    for (const input of loaded) {
      const sent = JSON.stringify(
        statusFor({ ...base, transcript_path: `/home/me/${SECRET}.jsonl`, ...input }),
      );
      expect(sent, input.tool_name ?? input.hook_event_name).not.toContain(SECRET);
      expect(sent).not.toContain('/home/me');
    }
  });

  it('with --detail adds the tool name and at most 80 characters, and still never the prompt', () => {
    const detail = { detail: true, root: '/home/me/app' };
    expect(statusFor(tool('Bash', { command: 'npm test -- --watch' }), detail).say).toBe(
      'Running a command · Bash: npm test -- --watch',
    );
    expect(statusFor(tool('Edit', { file_path: '/home/me/app/src/a.ts' }), detail).say).toBe(
      'Editing files · Edit: src/a.ts',
    );
    // Outside the project only the file name is said.
    expect(statusFor(tool('Read', { file_path: '/etc/ssh/config' }), detail).say).toBe(
      'Reading the codebase · Read: config',
    );
    expect(
      statusFor(tool('WebFetch', { url: 'https://example.com/a?token=abc' }), detail).say,
    ).toBe('Searching the web · WebFetch: example.com');
    expect(statusFor(tool('mcp__github__create_issue', { title: 'x' }), detail).say).toBe(
      'Using github tools · create_issue',
    );
    expect(
      statusFor(tool('Bash', { command: 'rm -rf node_modules' }, 'PermissionRequest'), detail).say,
    ).toBe('Needs your permission · Bash: rm -rf node_modules');

    const long = statusFor(tool('Bash', { command: `echo ${'a b '.repeat(200)}` }), detail).say;
    expect(long.length).toBeLessThanOrEqual(120);
    expect(long.slice('Running a command · Bash: '.length).length).toBeLessThanOrEqual(80);
    expect(long.endsWith('…')).toBe(true);

    for (const input of [loaded[1], loaded[15], loaded[11], loaded[12]]) {
      expect(JSON.stringify(statusFor({ ...base, ...input }, detail))).not.toContain(SECRET);
    }
  });

  it('hides what looks like a credential in a summary (best effort)', () => {
    expect(redact('curl -H "Authorization: Bearer abc.def" https://x')).not.toContain('abc.def');
    expect(redact('deploy --token s3cr3t --env prod')).toBe('deploy --token … --env prod');
    expect(redact('API_KEY=abc123 node run.js')).toBe('API_KEY=… node run.js');
    expect(redact('git clone https://me:hunter2@github.com/a/b')).not.toContain('hunter2');
    expect(redact(`echo ${'x1'.repeat(20)}`)).toBe('echo …');
    expect(redact('npm test')).toBe('npm test');
  });

  it('keeps every text within the limits of Glimo Spec', () => {
    expect(clip('a\n\tb   c', 20)).toBe('a b c');
    expect(clip('x'.repeat(50), 10)).toBe(`${'x'.repeat(9)}…`);
    expect(toolPhrase(`mcp__${'s'.repeat(90)}__tool`).length).toBeLessThanOrEqual(120);
    for (const input of loaded) {
      const status = statusFor({ ...base, ...input }, { detail: true, root: '/home/me/app' });
      expect(status.say.length).toBeLessThanOrEqual(120);
      expect(status.reason.length).toBeLessThanOrEqual(64);
    }
  });
});

describe('agent identity', () => {
  it('is one glim per session: cc-<project>-<session>, named after the project folder', () => {
    const agent = agentFor(base, {}, { CLAUDE_PROJECT_DIR: '/home/me/My Project_2' });
    expect(agent).toEqual({ id: 'cc-my-project-2-ab12', name: 'Claude · My Project_2' });
    // Without the variable Claude Code sets, the working directory is used.
    expect(agentFor({ session_id: 'ZZ99', cwd: 'C:\\Users\\me\\Tienda Ñandú' }, {}, {})).toEqual({
      id: 'cc-tienda-nandu-zz99',
      name: 'Claude · Tienda Ñandú',
    });
  });

  it('always fits the id pattern and the 40 character name', () => {
    const pattern = /^[a-z0-9][a-z0-9-]{0,63}$/;
    for (const dir of [
      '/',
      '/tmp/---',
      `/x/${'long-name-'.repeat(12)}`,
      '/x/日本語',
      '/x/.hidden',
    ]) {
      for (const session_id of [undefined, '', '----', 'A_b-9xyz']) {
        const agent = agentFor({ session_id }, {}, { CLAUDE_PROJECT_DIR: dir });
        expect(agent.id, `${dir} ${session_id}`).toMatch(pattern);
        expect(agent.name.length).toBeGreaterThan(0);
        expect(agent.name.length).toBeLessThanOrEqual(40);
      }
    }
  });

  it('takes the display name from --name or GLIMO_AGENT_NAME', () => {
    const env = { CLAUDE_PROJECT_DIR: '/x/app' };
    expect(agentFor(base, { name: 'Backend' }, env).name).toBe('Backend');
    expect(agentFor(base, { name: 'n'.repeat(60) }, env).name.length).toBe(40);
    const dir = mkdtempSync(join(tmpdir(), 'glimo-settings-'));
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify({ url: 'http://a/', id: 'v1', key: 'k1' }),
    );
    writeFileSync(join(dir, 'hook.json'), JSON.stringify({ name: 'Saved', approve: true }));
    expect(loadSettings(dir, {})).toMatchObject({
      url: 'http://a',
      id: 'v1',
      key: 'k1',
      name: 'Saved',
      approve: true,
      approveSeconds: 120,
      detail: false,
    });
    // Environment variables win, as in the CLI.
    expect(
      loadSettings(dir, { GLIMO_AGENT_NAME: 'Env', GLIMO_VITRINA: 'v2', GLIMO_KEY: 'k2' }),
    ).toMatchObject({ id: 'v2', key: 'k2', name: 'Env' });
  });
});

describe('Claude Code settings', () => {
  const runner = '/home/me/app/.glimo/hook.mjs';
  const theirs = { type: 'command', command: '/home/me/bin/lint.sh' };

  it('registers the runner for every event in exec form, in the background', () => {
    const entries = hookEntries(runner);
    expect(Object.keys(entries)).toEqual(EVENTS);
    for (const [event, groups] of Object.entries(entries)) {
      expect(groups).toHaveLength(1);
      const [handler] = groups[0].hooks;
      expect(handler).toMatchObject({ type: 'command', command: 'node', args: [runner] });
      expect(isOurs(handler)).toBe(true);
      // Only the end of the session waits, to take the glim off the vitrina.
      if (event === 'SessionEnd') expect(handler).toMatchObject({ timeout: 5 });
      else expect(handler.async).toBe(true);
    }
    expect(entries.SessionStart[0].matcher).toBe('startup|resume|clear|fork');
    expect(entries.Notification[0].matcher).toContain('permission_prompt');
    expect(entries.PreToolUse[0].matcher).toBeUndefined();
  });

  it('with --approve the permission request waits for the answer, with a matching timeout', () => {
    const [handler] = hookEntries(runner, { approve: true, approveSeconds: 90 })
      .PermissionRequest[0].hooks;
    expect(handler.async).toBeUndefined();
    expect(handler.timeout).toBe(105);
    expect(handler.statusMessage).toMatch(/vitrina/);
  });

  it('recognises its own handlers and nobody else’s', () => {
    expect(isOurs({ type: 'command', command: 'node "/a b/.glimo/hook.mjs"' })).toBe(true);
    expect(isOurs({ type: 'command', command: 'node', args: ['C:\\app\\.glimo\\hook.mjs'] })).toBe(
      true,
    );
    expect(isOurs(theirs)).toBe(false);
    expect(isOurs({ type: 'command', command: 'node', args: ['/x/.glimo/hook.mjs.bak'] })).toBe(
      false,
    );
    expect(isOurs({ type: 'http', url: 'https://glimo.dev/hook' })).toBe(false);
    expect(isOurs(null)).toBe(false);
  });

  it('merges into a fresh file', () => {
    const merged = mergeHooks({}, hookEntries(runner));
    expect(Object.keys(merged)).toEqual(['hooks']);
    expect(registeredEvents(merged)).toEqual(EVENTS);
  });

  it('keeps every existing setting and every hook that is not ours', () => {
    const existing = {
      model: 'opus',
      permissions: { allow: ['Bash(npm test)'], deny: ['Read(./.env)'] },
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [theirs] }],
        PostToolUse: [{ matcher: 'Edit|Write', hooks: [theirs] }],
      },
      env: { FOO: 'bar' },
    };
    const before = structuredClone(existing);
    const merged = mergeHooks(existing, hookEntries(runner));
    expect(existing).toEqual(before);
    expect(merged.model).toBe('opus');
    expect(merged.permissions).toEqual(before.permissions);
    expect(merged.env).toEqual(before.env);
    expect(merged.hooks.PostToolUse).toEqual(before.hooks.PostToolUse);
    // Theirs first and untouched, ours after.
    expect(merged.hooks.PreToolUse).toHaveLength(2);
    expect(merged.hooks.PreToolUse[0]).toEqual(before.hooks.PreToolUse[0]);
    expect(isOurs(merged.hooks.PreToolUse[1].hooks[0])).toBe(true);
    expect(Object.keys(merged)).toEqual(['model', 'permissions', 'hooks', 'env']);
  });

  it('is idempotent, also when the options change', () => {
    const existing = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [theirs] }] } };
    const once = mergeHooks(existing, hookEntries(runner));
    const twice = mergeHooks(once, hookEntries(runner));
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
    const approving = mergeHooks(twice, hookEntries(runner, { approve: true }));
    expect(approving.hooks.PermissionRequest).toHaveLength(1);
    expect(approving.hooks.PreToolUse).toHaveLength(2);
    expect(JSON.stringify(mergeHooks(approving, hookEntries(runner)))).toBe(JSON.stringify(once));
  });

  it('uninstalls only what is ours', () => {
    const existing = {
      model: 'opus',
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [theirs] }] },
    };
    expect(withoutOurs(mergeHooks(existing, hookEntries(runner)))).toEqual(existing);
    expect(withoutOurs(mergeHooks({}, hookEntries(runner)))).toEqual({});
    expect(withoutOurs(mergeHooks({ hooks: {} }, hookEntries(runner)))).toEqual({});
    // Someone put their handler in the same group as ours: theirs stays.
    const shared = {
      hooks: { Stop: [{ hooks: [theirs, { type: 'command', command: 'node', args: [runner] }] }] },
    };
    expect(withoutOurs(shared)).toEqual({ hooks: { Stop: [{ hooks: [theirs] }] } });
    // Settings without any of ours come back as they were.
    expect(withoutOurs(existing)).toEqual(existing);
  });

  it('refuses to guess when the hooks setting has an unexpected shape', () => {
    expect(() => mergeHooks({ hooks: [] }, hookEntries(runner))).toThrow(/nothing was changed/);
    expect(() => mergeHooks({ hooks: { Stop: {} } }, hookEntries(runner))).toThrow(
      /nothing was changed/,
    );
  });
});

// ---------- a server that stands in for the vitrina ----------

function vitrina() {
  const requests = [];
  const held = [];
  const mock = { requests, url: '', handler: null, seq: 0 };
  // Like the real server, every write gets the next number when it lands.
  mock.next = () => {
    mock.seq += 1;
    return mock.seq;
  };
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      const entry = {
        method: request.method,
        url: request.url,
        auth: request.headers.authorization,
        body: body ? JSON.parse(body) : null,
      };
      requests.push(entry);
      const reply = (value, status = 200) => {
        response.statusCode = status;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify(value));
      };
      held.push(response);
      if (mock.handler?.(entry, reply) === true) return;
      if (entry.url === '/api/vitrinas') {
        reply(
          { id: 'vtest', key: 'gk_test', url: `${mock.url}/v/vtest`, mcp: `${mock.url}/mcp/vtest` },
          201,
        );
      } else if (entry.url.includes('/actions')) reply({ actions: [] });
      else reply({ ok: true, seq: mock.next() });
    });
  });
  mock.start = async () => {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    mock.url = `http://127.0.0.1:${server.address().port}`;
  };
  mock.reset = () => {
    for (const response of held.splice(0)) if (!response.writableEnded) response.end('{}');
    requests.length = 0;
    mock.handler = null;
  };
  mock.stop = () => {
    mock.reset();
    server.closeAllConnections();
    server.close();
  };
  mock.statuses = () => requests.filter((r) => r.url.endsWith('/status')).map((r) => r.body);
  mock.until = async (found, ms = 5000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (found()) return true;
      await sleep(20);
    }
    throw new Error('The request never arrived.');
  };
  return mock;
}

/** Runs a hook the way Claude Code does: `node <runner>` with the event on stdin. */
function runHook(runner, input, env = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(process.execPath, [runner], {
      env: { PATH: process.env.PATH, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr, ms: Date.now() - started }));
    child.stdin.on('error', () => {});
    child.stdin.end(typeof input === 'string' ? input : JSON.stringify(input));
  });
}

describe('glimo hooks', () => {
  const mock = vitrina();
  const cwd = process.cwd();
  const saved = { ...process.env };
  const sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'glimo-hooks-cli-')));
  const home = join(sandbox, 'home');
  const project = join(sandbox, 'Shop App');
  const settingsFile = join(project, '.claude', 'settings.local.json');
  const run = async (...argv) => {
    const lines = [];
    const code = await main(argv, (line) => lines.push(line));
    return { code, text: lines.join('\n') };
  };
  const read = (file) => JSON.parse(readFileSync(file, 'utf8'));

  beforeAll(async () => {
    await mock.start();
    mkdirSync(home, { recursive: true });
    mkdirSync(project, { recursive: true });
    for (const name of Object.keys(process.env)) {
      if (name.startsWith('GLIMO_') || name === 'CLAUDE_CONFIG_DIR') delete process.env[name];
    }
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    process.chdir(project);
  });

  afterAll(() => {
    process.chdir(cwd);
    for (const name of Object.keys(process.env)) delete process.env[name];
    Object.assign(process.env, saved);
    mock.stop();
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('needs a vitrina first, and explains how to use it', async () => {
    await expect(run('hooks', 'install')).rejects.toThrow(/glimo init/);
    await expect(run('hooks')).rejects.toThrow(/glimo hooks install/);
    expect(existsSync(settingsFile)).toBe(false);
    expect((await run('hooks', 'status')).code).toBe(2);
    expect((await run('--help')).text).toContain('glimo hooks install');
  });

  it('installs the runner and registers it in the personal project settings', async () => {
    await run('init', '--url', mock.url, '--no-open');
    const { text } = await run('hooks', 'install');
    const runner = join(project, '.glimo', 'hook.mjs');

    expect(readFileSync(runner, 'utf8')).toBe(readFileSync(RUNNER_SOURCE, 'utf8'));
    expect(existsSync(join(project, '.glimo', 'hook.json'))).toBe(false);
    expect(readFileSync(join(project, '.glimo', '.gitignore'), 'utf8')).toBe('*\n');

    const settings = read(settingsFile);
    expect(registeredEvents(settings)).toEqual(EVENTS);
    expect(settings.hooks.PreToolUse[0].hooks[0]).toEqual({
      type: 'command',
      command: 'node',
      args: [runner],
      async: true,
    });
    // The settings never hold the key: it stays in .glimo/, which git ignores.
    expect(readFileSync(settingsFile, 'utf8')).not.toContain('gk_');

    expect(text).toContain(`${mock.url}/v/vtest`);
    expect(text).toContain('.glimo/hook.mjs');
    expect(text).toContain('.claude/settings.local.json');
    for (const event of EVENTS) expect(text).toContain(event);
    expect(text).not.toContain('gk_test');
  });

  it('the installed runner works on its own, from a folder with a space in its name', async () => {
    mock.reset();
    const result = await runHook(
      join(project, '.glimo', 'hook.mjs'),
      { session_id: randomUUID(), cwd: project, hook_event_name: 'Stop' },
      { TMPDIR: join(sandbox, 'tmp-a'), CLAUDE_PROJECT_DIR: project },
    );
    expect(result).toMatchObject({ code: 0, stdout: '', stderr: '' });
    expect(mock.statuses()).toMatchObject([
      { agent: { name: 'Claude · Shop App' }, state: 'done', say: 'Finished its turn' },
    ]);
    expect(mock.statuses()[0].agent.id).toMatch(/^cc-shop-app-[a-f0-9]{4}$/);
  });

  it('running it twice changes nothing', async () => {
    const before = readFileSync(settingsFile, 'utf8');
    const stamp = statSync(settingsFile).mtimeMs;
    await sleep(20);
    await run('hooks', 'install');
    expect(readFileSync(settingsFile, 'utf8')).toBe(before);
    expect(statSync(settingsFile).mtimeMs).toBe(stamp);
  });

  it('says whether it is installed, and for which vitrina', async () => {
    const { code, text } = await run('hooks', 'status');
    expect(code).toBe(0);
    expect(text).toContain(`${mock.url}/v/vtest`);
    expect(text).toContain('generic phrases only');
    expect(text).not.toContain('gk_test');
  });

  it('stores --approve, --detail and --name for the runner, and forgets them again', async () => {
    const { text } = await run(
      'hooks',
      'install',
      '--approve',
      '--approve-seconds',
      '45',
      '--detail',
      '--name',
      'Shop backend',
    );
    expect(read(join(project, '.glimo', 'hook.json'))).toEqual({
      name: 'Shop backend',
      detail: true,
      approve: true,
      approveSeconds: 45,
    });
    const [handler] = read(settingsFile).hooks.PermissionRequest[0].hooks;
    expect(handler.async).toBeUndefined();
    expect(handler.timeout).toBe(60);
    expect(text).toMatch(/--detail it also sends the tool name/);
    expect(text).toMatch(/waits up to 45 seconds/);
    expect((await run('hooks', 'status')).text).toMatch(/detail.*approve.*name "Shop backend"/);

    // "--approve install" is the same thing typed in another order.
    await run('hooks', '--approve', 'install');
    expect(read(join(project, '.glimo', 'hook.json'))).toEqual({
      approve: true,
      approveSeconds: 120,
    });

    await run('hooks', 'install');
    expect(existsSync(join(project, '.glimo', 'hook.json'))).toBe(false);
    expect(read(settingsFile).hooks.PermissionRequest[0].hooks[0].async).toBe(true);
    expect(read(settingsFile).hooks.PermissionRequest).toHaveLength(1);
  });

  it('uninstall leaves no trace in a project that had no settings', async () => {
    const { text } = await run('hooks', 'uninstall');
    expect(text).toMatch(/gone/);
    expect(existsSync(settingsFile)).toBe(false);
    expect(existsSync(join(project, '.claude'))).toBe(false);
    expect(existsSync(join(project, '.glimo', 'hook.mjs'))).toBe(false);
    // The vitrina itself is not ours to remove.
    expect(read(join(project, '.glimo', 'config.json'))).toMatchObject({ id: 'vtest' });
    expect((await run('hooks', 'uninstall')).text).toMatch(/no Glimo hooks/);
    expect((await run('hooks', 'status')).code).toBe(2);
  });

  it('keeps existing settings and hooks through install and uninstall, byte for byte', async () => {
    const existing = `${JSON.stringify(
      {
        permissions: { allow: ['Bash(pnpm test)'] },
        hooks: {
          PreToolUse: [
            { matcher: 'Bash', hooks: [{ type: 'command', command: '/usr/local/bin/guard.sh' }] },
          ],
          PostToolUse: [
            { matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'pnpm format' }] },
          ],
        },
        outputStyle: 'Explanatory',
      },
      null,
      4,
    )}\n`;
    mkdirSync(join(project, '.claude'), { recursive: true });
    writeFileSync(settingsFile, existing);

    await run('hooks', 'install');
    const settings = read(settingsFile);
    expect(settings.permissions).toEqual({ allow: ['Bash(pnpm test)'] });
    expect(settings.outputStyle).toBe('Explanatory');
    expect(settings.hooks.PostToolUse).toEqual(JSON.parse(existing).hooks.PostToolUse);
    expect(settings.hooks.PreToolUse[0]).toEqual(JSON.parse(existing).hooks.PreToolUse[0]);
    expect(registeredEvents(settings)).toEqual([
      'PreToolUse',
      ...EVENTS.filter((e) => e !== 'PreToolUse'),
    ]);

    const installed = readFileSync(settingsFile, 'utf8');
    await run('hooks', 'install');
    expect(readFileSync(settingsFile, 'utf8')).toBe(installed);

    await run('hooks', 'uninstall');
    expect(readFileSync(settingsFile, 'utf8')).toBe(existing);
    rmSync(join(project, '.claude'), { recursive: true });
  });

  it('touches nothing when the settings file is not valid JSON', async () => {
    mkdirSync(join(project, '.claude'), { recursive: true });
    writeFileSync(settingsFile, '{ "model": "opus", }');
    await expect(run('hooks', 'install')).rejects.toThrow(/not valid JSON, so nothing was changed/);
    expect(readFileSync(settingsFile, 'utf8')).toBe('{ "model": "opus", }');
    expect(existsSync(join(project, '.glimo', 'hook.mjs'))).toBe(false);
    rmSync(join(project, '.claude'), { recursive: true });
  });

  it('--global covers every project: user settings, ~/.glimo and a copy of the vitrina', async () => {
    const userSettings = join(home, '.claude', 'settings.json');
    mkdirSync(join(home, '.claude'), { recursive: true });
    writeFileSync(userSettings, `${JSON.stringify({ theme: 'dark' }, null, 2)}\n`);

    const { text } = await run('hooks', 'install', '--global', '--name', 'Laptop');
    const runner = join(home, '.glimo', 'hook.mjs');
    expect(existsSync(runner)).toBe(true);
    expect(read(join(home, '.glimo', 'hook.json'))).toEqual({
      url: mock.url,
      id: 'vtest',
      key: 'gk_test',
      name: 'Laptop',
    });
    if (process.platform !== 'win32') {
      expect(statSync(join(home, '.glimo', 'hook.json')).mode & 0o777).toBe(0o600);
    }
    expect(readFileSync(join(home, '.glimo', '.gitignore'), 'utf8')).toBe('*\n');
    expect(read(userSettings).theme).toBe('dark');
    expect(read(userSettings).hooks.Stop[0].hooks[0].args).toEqual([runner]);
    expect(readFileSync(userSettings, 'utf8')).not.toContain('gk_');
    expect(text).toContain('every project on this machine');
    expect(text).toContain('~/.claude/settings.json');
    expect(text).not.toContain('gk_test');
    // The project was not touched.
    expect(existsSync(settingsFile)).toBe(false);
    expect(existsSync(join(project, '.glimo', 'hook.mjs'))).toBe(false);

    const status = await run('hooks', 'status', '--global');
    expect(status.code).toBe(0);
    expect(status.text).toContain(`${mock.url}/v/vtest`);
    expect(status.text).toContain('name "Laptop"');
    expect(status.text).not.toContain('gk_test');

    // The global runner reports to the vitrina it was installed for, from any folder.
    mock.reset();
    const elsewhere = join(sandbox, 'elsewhere');
    mkdirSync(elsewhere);
    await runHook(
      runner,
      {
        session_id: randomUUID(),
        cwd: elsewhere,
        hook_event_name: 'UserPromptSubmit',
        prompt: 'x',
      },
      { TMPDIR: join(sandbox, 'tmp-b'), CLAUDE_PROJECT_DIR: elsewhere },
    );
    expect(mock.requests).toMatchObject([
      { method: 'POST', url: '/api/vitrinas/vtest/status', auth: 'Bearer gk_test' },
    ]);
    expect(mock.statuses()[0].agent.name).toBe('Laptop');

    await run('hooks', 'uninstall', '--global');
    expect(read(userSettings)).toEqual({ theme: 'dark' });
    expect(existsSync(join(home, '.glimo'))).toBe(false);
  });

  it('honours CLAUDE_CONFIG_DIR for the user settings', async () => {
    process.env.CLAUDE_CONFIG_DIR = join(home, 'claude-config');
    await run('hooks', 'install', '--global');
    expect(registeredEvents(read(join(home, 'claude-config', 'settings.json')))).toEqual(EVENTS);
    await run('hooks', 'uninstall', '--global');
    // The user settings file is never deleted, even when nothing else is in it.
    expect(read(join(home, 'claude-config', 'settings.json'))).toEqual({});
    delete process.env.CLAUDE_CONFIG_DIR;
  });

  it('warns when the Claude Code on this machine is too old to run the hooks', async () => {
    const deps = {
      loadConfig: () => ({ url: mock.url, id: 'vtest', key: 'gk_test' }),
      findConfig: () => join(project, '.glimo', 'config.json'),
      defaultUrl: mock.url,
    };
    const say = (claudeVersion) => {
      const lines = [];
      hooks(['install'], {}, (line) => lines.push(line), { ...deps, claudeVersion });
      return lines.join('\n');
    };
    expect(say(() => [2, 1, 138])).toMatch(
      /Your Claude Code is 2\.1\.138\. These hooks need 2\.1\.139/,
    );
    expect(say(() => [2, 0, 500])).toMatch(/need 2\.1\.139/);
    expect(say(() => [2, 1, 139])).not.toMatch(/need 2\.1\.139/);
    expect(say(() => [3, 0, 0])).not.toMatch(/need 2\.1\.139/);
    // Claude Code is not on the PATH: nothing to say.
    expect(say(() => null)).not.toMatch(/need 2\.1\.139/);
    await run('hooks', 'uninstall');
  });

  it('does not treat a vitrina in the home folder as a project', async () => {
    const stray = join(home, 'notes');
    mkdirSync(join(home, '.glimo'), { recursive: true });
    mkdirSync(stray);
    copyFileSync(join(project, '.glimo', 'config.json'), join(home, '.glimo', 'config.json'));
    process.chdir(stray);
    await expect(run('hooks', 'install')).rejects.toThrow(/--global/);
    expect(existsSync(join(home, '.claude', 'settings.local.json'))).toBe(false);
    process.chdir(project);
    rmSync(join(home, '.glimo'), { recursive: true });
  });
});

describe('the runner, end to end', () => {
  const mock = vitrina();
  const sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'glimo-hook-run-')));
  const project = join(sandbox, 'storefront');
  const runner = join(project, '.glimo', 'hook.mjs');
  const temp = join(sandbox, 'tmp');
  let session;

  const configure = (options) => {
    if (options) writeFileSync(join(project, '.glimo', 'hook.json'), JSON.stringify(options));
    else rmSync(join(project, '.glimo', 'hook.json'), { force: true });
  };
  const hook = (event, extra = {}, env = {}) =>
    runHook(
      runner,
      { session_id: session, cwd: project, hook_event_name: event, ...extra },
      { TMPDIR: temp, TEMP: temp, TMP: temp, CLAUDE_PROJECT_DIR: project, ...env },
    );
  const stateDir = () => join(temp, `glimo-hooks-${process.getuid?.() ?? 'u'}`, `vtest-${session}`);
  const agentId = () => `cc-storefront-${session.slice(0, 4)}`;
  /** Pretends the last thing this session said was said `ms` earlier. */
  const age = (ms) => {
    const name = readdirSync(stateDir())
      .filter((file) => file.startsWith('p-'))
      .sort()
      .at(-1);
    const file = join(stateDir(), name);
    const last = JSON.parse(readFileSync(file, 'utf8'));
    writeFileSync(file, JSON.stringify({ ...last, at: last.at - ms }));
  };

  beforeAll(async () => {
    await mock.start();
    mkdirSync(join(project, '.glimo'), { recursive: true });
    mkdirSync(temp, { recursive: true });
    copyFileSync(RUNNER_SOURCE, runner);
    writeFileSync(
      join(project, '.glimo', 'config.json'),
      JSON.stringify({ url: mock.url, id: 'vtest', key: 'gk_test' }),
    );
  });

  beforeEach(() => {
    mock.reset();
    configure(null);
    session = randomUUID();
  });

  afterEach(() => mock.reset());

  afterAll(() => {
    mock.stop();
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('posts the status with the key in the Authorization header, never in the URL', async () => {
    const result = await hook('UserPromptSubmit', { prompt: `deploy ${SECRET}` });
    expect(result).toMatchObject({ code: 0, stdout: '', stderr: '' });
    expect(mock.requests).toHaveLength(1);
    const [sent] = mock.requests;
    expect(sent.method).toBe('POST');
    expect(sent.url).toBe('/api/vitrinas/vtest/status');
    expect(sent.auth).toBe('Bearer gk_test');
    expect(sent.url).not.toContain('gk_');
    expect(sent.body).toEqual({
      agent: { id: agentId(), name: 'Claude · storefront' },
      state: 'thinking',
      reason: 'queued',
      say: 'Got a new task',
    });
  });

  it('never lets a prompt, a command or a path into the request', async () => {
    await hook('UserPromptSubmit', { prompt: SECRET, transcript_path: `/home/me/${SECRET}.jsonl` });
    await hook('PreToolUse', {
      tool_name: 'Bash',
      tool_input: { command: `cat /etc/${SECRET}`, description: SECRET },
      tool_use_id: SECRET,
    });
    await hook('PermissionRequest', {
      tool_name: 'Write',
      tool_input: { file_path: `/home/me/${SECRET}.env`, content: SECRET },
      permission_suggestions: [
        { type: 'addRules', rules: [{ toolName: 'Write', ruleContent: SECRET }] },
      ],
    });
    // In real life a person answers the prompt and the tool runs before the turn ends.
    await sleep(200);
    await hook('Stop', { last_assistant_message: SECRET });
    expect(mock.statuses().map((s) => s.state)).toEqual(['thinking', 'working', 'waiting', 'done']);
    const wire = JSON.stringify(mock.requests);
    expect(wire).not.toContain(SECRET);
    expect(wire).not.toContain('/home/me');
    expect(wire).not.toContain('/etc/');
    // Nothing but what the Glimo Spec status needs.
    for (const status of mock.statuses()) {
      expect(Object.keys(status).sort()).toEqual(['agent', 'reason', 'say', 'state']);
    }
  });

  it('with --detail sends the tool name and a short summary, and the name from --name', async () => {
    configure({ detail: true, name: 'Storefront bot' });
    await hook('PreToolUse', {
      tool_name: 'Edit',
      tool_input: {
        file_path: join(project, 'src', 'cart.ts'),
        old_string: SECRET,
        new_string: SECRET,
      },
    });
    expect(mock.statuses()).toEqual([
      {
        agent: { id: agentId(), name: 'Storefront bot' },
        state: 'working',
        reason: 'working',
        say: 'Editing files · Edit: src/cart.ts',
      },
    ]);
  });

  it('says the same thing once: tool hooks fire constantly', async () => {
    const read = { tool_name: 'Read', tool_input: { file_path: '/a' } };
    await hook('PreToolUse', read);
    await hook('PreToolUse', read);
    await hook('PreToolUse', { tool_name: 'Grep', tool_input: { pattern: 'x' } });
    expect(mock.statuses().map((s) => s.say)).toEqual(['Reading the codebase']);

    // A new state is always said at once.
    await hook('Stop');
    expect(mock.statuses().map((s) => s.state)).toEqual(['working', 'done']);
    await hook('Stop');
    expect(mock.statuses()).toHaveLength(2);

    // After the window the same status is said again, so the vitrina knows it is alive.
    age(21_000);
    await hook('Stop');
    expect(mock.statuses()).toHaveLength(3);
  });

  it('a burst of tools ends on the last phrase, without a request per tool', async () => {
    await hook('PreToolUse', { tool_name: 'Read', tool_input: {} });
    // Same state, new phrase, right away: these wait in the background.
    const edit = hook('PreToolUse', { tool_name: 'Edit', tool_input: {} });
    await sleep(150);
    const bash = hook('PreToolUse', { tool_name: 'Bash', tool_input: {} });
    await sleep(300);
    expect(mock.statuses().map((s) => s.say)).toEqual(['Reading the codebase']);
    const results = await Promise.all([edit, bash]);
    for (const result of results) expect(result).toMatchObject({ code: 0, stdout: '', stderr: '' });
    // Only the latest word is said once the moment has passed.
    expect(mock.statuses().map((s) => s.say)).toEqual([
      'Reading the codebase',
      'Running a command',
    ]);
    expect(results[1].ms).toBeGreaterThan(1200);
    expect(results[1].ms).toBeLessThan(4000);
  });

  it('a new state does not wait behind a burst', async () => {
    await hook('PreToolUse', { tool_name: 'Read', tool_input: {} });
    const edit = hook('PreToolUse', { tool_name: 'Edit', tool_input: {} });
    await sleep(150);
    const stop = await hook('Stop');
    expect(stop.ms).toBeLessThan(1200);
    await edit;
    expect(mock.statuses().map((s) => s.say)).toEqual([
      'Reading the codebase',
      'Finished its turn',
    ]);
  });

  it('is not held back by a clock that jumped', async () => {
    await hook('SessionStart', { source: 'startup' });
    // A leftover event from "the future": the clock was set back since.
    writeFileSync(
      join(stateDir(), `e-${String(Date.now() * 1000 + 3_600_000_000).padStart(17, '0')}-1.json`),
      '{}',
    );
    await hook('UserPromptSubmit', { prompt: 'x' });
    expect(mock.statuses().map((s) => s.state)).toEqual(['idle', 'thinking']);
  });

  it('keeps one glim per session even when Claude changes directory', async () => {
    await hook('SessionStart', { source: 'startup' }, { CLAUDE_PROJECT_DIR: '' });
    await hook('Stop', { cwd: join(project, 'packages', 'api') }, { CLAUDE_PROJECT_DIR: '' });
    const agent = { id: agentId(), name: 'Claude · storefront' };
    expect(mock.statuses().map((s) => s.agent)).toEqual([agent, agent]);
  });

  it('takes the glim off the vitrina when the session ends', async () => {
    await hook('SessionStart', { source: 'startup' });
    mock.reset();
    const result = await hook('SessionEnd', { reason: 'prompt_input_exit' });
    expect(result).toMatchObject({ code: 0, stdout: '', stderr: '' });
    expect(mock.requests.length).toBeGreaterThanOrEqual(1);
    for (const sent of mock.requests) {
      expect(sent).toEqual({
        method: 'DELETE',
        url: `/api/vitrinas/vtest/agents/${agentId()}`,
        auth: 'Bearer gk_test',
        body: null,
      });
    }
  });

  it('ends on the latest status when requests overtake each other', async () => {
    // "working" lands on the server after "done", although it was sent first.
    mock.handler = (entry, reply) => {
      if (entry.body?.state !== 'working') return false;
      setTimeout(() => reply({ ok: true, seq: mock.next() }), 600);
      return true;
    };
    const slow = hook('PreToolUse', { tool_name: 'Bash', tool_input: {} });
    await mock.until(() => mock.statuses().length === 1);
    await hook('Stop');
    await slow;
    // The run that was overtaken says the latest status once more.
    expect(mock.statuses().map((s) => s.state)).toEqual(['working', 'done', 'done']);
  });

  it('does not repeat itself when the requests landed in order', async () => {
    // "working" landed first. Only its answer was slow.
    mock.handler = (entry, reply) => {
      if (entry.body?.state !== 'working') return false;
      const seq = mock.next();
      setTimeout(() => reply({ ok: true, seq }), 600);
      return true;
    };
    const slow = hook('PreToolUse', { tool_name: 'Bash', tool_input: {} });
    await mock.until(() => mock.statuses().length === 1);
    await hook('Stop');
    await slow;
    expect(mock.statuses().map((s) => s.state)).toEqual(['working', 'done']);
  });

  it('a status still on the wire cannot bring back a session that ended', async () => {
    mock.handler = (entry, reply) => {
      if (entry.body?.state !== 'done') return false;
      setTimeout(() => reply({ ok: true, seq: mock.next() }), 600);
      return true;
    };
    const slow = hook('Stop');
    await mock.until(() => mock.statuses().length === 1);
    await hook('SessionEnd', { reason: 'other' });
    await slow;
    expect(mock.requests.at(-1).method).toBe('DELETE');
    expect(mock.requests.filter((r) => r.method === 'DELETE').length).toBeGreaterThanOrEqual(2);
  });

  it('exits with code 0 in about two seconds when the server never answers', async () => {
    const sockets = [];
    const silent = createTcpServer((socket) => sockets.push(socket));
    await new Promise((resolve) => silent.listen(0, '127.0.0.1', resolve));
    const result = await hook(
      'PreToolUse',
      { tool_name: 'Bash', tool_input: { command: 'ls' } },
      { GLIMO_URL: `http://127.0.0.1:${silent.address().port}` },
    );
    for (const socket of sockets) socket.destroy();
    silent.close();
    expect(result).toMatchObject({ code: 0, stdout: '', stderr: '' });
    expect(result.ms).toBeGreaterThan(1300);
    expect(result.ms).toBeLessThan(3500);
    expect(mock.requests).toHaveLength(0);
  });

  it('stays silent and exits 0 whatever goes wrong', async () => {
    const quiet = { code: 0, stdout: '', stderr: '' };
    const env = { TMPDIR: temp, CLAUDE_PROJECT_DIR: project };
    expect(await runHook(runner, 'not json at all', env)).toMatchObject(quiet);
    expect(await runHook(runner, '', env)).toMatchObject(quiet);
    expect(await runHook(runner, '[1,2,3]', env)).toMatchObject(quiet);
    expect(await hook('SomethingNew')).toMatchObject(quiet);
    // The server refuses: still not Claude Code's problem, and no reason to insist.
    mock.handler = (_entry, reply) => {
      reply({ error: { code: 'unauthorized', message: 'no' } }, 401);
      return true;
    };
    expect(await hook('Stop')).toMatchObject(quiet);
    expect(await hook('UserPromptSubmit', { prompt: 'x' })).toMatchObject(quiet);
    expect(mock.requests).toHaveLength(1);
    session = randomUUID();
    // Nowhere to keep state (the temp directory is a file): it still reports.
    mock.reset();
    const blocked = join(sandbox, 'not-a-folder');
    writeFileSync(blocked, '');
    const nowhere = { TMPDIR: blocked, TEMP: blocked, TMP: blocked };
    expect(await hook('Stop', {}, nowhere)).toMatchObject(quiet);
    expect(mock.statuses()).toMatchObject([{ agent: { id: agentId() }, state: 'done' }]);
    // No vitrina configured: nothing to do.
    const bare = join(sandbox, 'bare');
    mkdirSync(bare);
    copyFileSync(RUNNER_SOURCE, join(bare, 'hook.mjs'));
    expect(
      await runHook(join(bare, 'hook.mjs'), { session_id: session, hook_event_name: 'Stop' }, env),
    ).toMatchObject(quiet);
  });

  describe('with --approve', () => {
    const request = {
      tool_name: 'Bash',
      tool_input: { command: `rm -rf ${SECRET}`, description: 'Clean up' },
      permission_mode: 'default',
    };
    const asked = () => mock.statuses().find((status) => status.actions);
    /** The person presses a button on the vitrina. */
    const press = (pick) => {
      mock.handler = (entry, reply) => {
        if (!entry.url.includes('/actions')) return false;
        const actionId = pick(asked().actions);
        reply({
          actions: [{ id: '7', agentId: agentId(), actionId, at: new Date().toISOString() }],
        });
        return true;
      };
    };

    it('shows Allow and Deny, and prints the decision Claude Code expects when the person allows', async () => {
      configure({ approve: true, approveSeconds: 20 });
      press((actions) => actions[0].id);
      const result = await hook('PermissionRequest', request);
      expect(result.code).toBe(0);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toEqual({
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision: { behavior: 'allow' },
        },
      });

      const question = asked();
      expect(question).toMatchObject({
        agent: { id: agentId() },
        state: 'waiting',
        reason: 'awaiting-approval',
        say: 'Needs your permission',
      });
      expect(question.actions).toHaveLength(2);
      expect(question.actions[0]).toEqual({
        id: expect.stringMatching(/^approve-[a-f0-9]{8}$/),
        label: 'Allow',
        kind: 'primary',
        sensitive: true,
      });
      expect(question.actions[1]).toEqual({
        id: expect.stringMatching(/^deny-[a-f0-9]{8}$/),
        label: 'Deny',
        kind: 'secondary',
      });

      const poll = mock.requests.find((r) => r.url.includes('/actions'));
      expect(poll.method).toBe('GET');
      expect(poll.url).toBe(`/api/vitrinas/vtest/actions?agent=${agentId()}&wait=20`);
      expect(poll.auth).toBe('Bearer gk_test');
      // Afterwards the buttons are gone and the glim is back at work.
      expect(mock.statuses().at(-1)).toEqual({
        agent: question.agent,
        state: 'working',
        reason: 'working',
        say: 'Running a command',
      });
      expect(JSON.stringify(mock.requests)).not.toContain(SECRET);
      expect(existsSync(join(stateDir(), 'approval.json'))).toBe(false);
    });

    it('prints a deny decision when the person denies', async () => {
      configure({ approve: true, approveSeconds: 20 });
      press((actions) => actions[1].id);
      const result = await hook('PermissionRequest', request);
      expect(JSON.parse(result.stdout)).toEqual({
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision: {
            behavior: 'deny',
            message: 'The person denied this from the Glimo vitrina.',
          },
        },
      });
      expect(mock.statuses().at(-1).actions).toBeUndefined();
      expect(mock.statuses().at(-1).state).toBe('thinking');
    });

    it('prints nothing when nobody answers, so Claude Code shows its usual prompt', async () => {
      configure({ approve: true, approveSeconds: 2 });
      const result = await hook('PermissionRequest', request);
      expect(result).toMatchObject({ code: 0, stdout: '', stderr: '' });
      expect(result.ms).toBeGreaterThan(1800);
      expect(result.ms).toBeLessThan(6000);
      expect(asked()).toBeDefined();
      // It asked the server at a human pace, not in a busy loop.
      expect(mock.requests.filter((r) => r.url.includes('/actions')).length).toBeLessThanOrEqual(3);
      // The buttons do not stay behind: the terminal has the prompt now.
      expect(mock.statuses().at(-1)).toMatchObject({
        state: 'waiting',
        say: 'Needs your permission in the terminal',
      });
      expect(mock.statuses().at(-1).actions).toBeUndefined();
      expect(existsSync(join(stateDir(), 'approval.json'))).toBe(false);
    });

    it('ignores a decision that was meant for an earlier prompt', async () => {
      configure({ approve: true, approveSeconds: 2 });
      mock.handler = (entry, reply) => {
        if (!entry.url.includes('/actions')) return false;
        reply({
          actions: [
            { id: '1', agentId: agentId(), actionId: 'approve', at: 'x' },
            { id: '2', agentId: agentId(), actionId: 'approve-00000000', at: 'x' },
          ],
        });
        return true;
      };
      const result = await hook('PermissionRequest', request);
      expect(result).toMatchObject({ code: 0, stdout: '' });
    });

    it('with --detail says what the permission is for', async () => {
      configure({ approve: true, approveSeconds: 20, detail: true });
      press((actions) => actions[0].id);
      await hook('PermissionRequest', {
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf node_modules' },
      });
      expect(asked().say).toBe('Needs your permission · Bash: rm -rf node_modules');
    });

    it('leaves questions and plans to the terminal', async () => {
      configure({ approve: true, approveSeconds: 20 });
      const result = await hook('PermissionRequest', {
        tool_name: 'AskUserQuestion',
        tool_input: { questions: [{ question: SECRET }] },
      });
      expect(result).toMatchObject({ code: 0, stdout: '' });
      expect(result.ms).toBeLessThan(1500);
      expect(mock.statuses()).toMatchObject([{ state: 'waiting', say: 'Has a question for you' }]);
      expect(mock.statuses()[0].actions).toBeUndefined();
      expect(mock.requests.some((r) => r.url.includes('/actions'))).toBe(false);
    });

    it('does not wait when the buttons could not be shown', async () => {
      configure({ approve: true, approveSeconds: 20 });
      const sockets = [];
      const silent = createTcpServer((socket) => sockets.push(socket));
      await new Promise((resolve) => silent.listen(0, '127.0.0.1', resolve));
      const result = await hook('PermissionRequest', request, {
        GLIMO_URL: `http://127.0.0.1:${silent.address().port}`,
      });
      for (const socket of sockets) socket.destroy();
      silent.close();
      expect(result).toMatchObject({ code: 0, stdout: '', stderr: '' });
      expect(result.ms).toBeLessThan(3500);
    });

    it('keeps the question on the vitrina while it waits, and steps aside when the terminal answers', async () => {
      configure({ approve: true, approveSeconds: 30 });
      // The long poll stays open, as on the real server.
      mock.handler = (entry) => entry.url.includes('/actions');
      const waiting = hook('PermissionRequest', request);
      await mock.until(() => asked() && mock.requests.some((r) => r.url.includes('/actions')));
      const before = mock.statuses().length;

      // A subagent keeps working, the notification fires, a second prompt arrives:
      // none of them takes the buttons away.
      await hook('PreToolUse', { tool_name: 'Read', tool_input: {}, agent_id: 'agent-7' });
      await hook('Notification', { notification_type: 'permission_prompt', message: 'x' });
      const second = await hook('PermissionRequest', { ...request, agent_id: 'agent-7' });
      expect(second).toMatchObject({ code: 0, stdout: '' });
      expect(second.ms).toBeLessThan(1500);
      expect(mock.statuses()).toHaveLength(before);

      // The same thread moves on: the person answered in the terminal.
      await sleep(200);
      await hook('PreToolUse', { tool_name: 'Bash', tool_input: {} });
      const result = await waiting;
      expect(result).toMatchObject({ code: 0, stdout: '', stderr: '' });
      expect(result.ms).toBeLessThan(10_000);
      expect(mock.statuses().at(-1)).toMatchObject({ state: 'working', say: 'Running a command' });
      expect(mock.statuses().at(-1).actions).toBeUndefined();
    });
  });
});
