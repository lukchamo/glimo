#!/usr/bin/env node
// glimo — your agents, at a glance. Zero dependencies, Node 20+.
//
//   npx glimo init                         create a vitrina and remember it in .glimo/
//   npx glimo status sales waiting "Wants to send 12 emails" --action approve:"Approve sending":sensitive
//   npx glimo wait sales                   wait for the person's decision
//   npx glimo hooks install                show every Claude Code session as a glim, on its own
//   npx glimo demo                         bring a sample team to life
//   npx glimo open                         print the address of your vitrina
//   npx glimo mcp                          stdio MCP server (for clients without HTTP transport)

import { spawn } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { hooks } from './hooks.mjs';

export const VERSION = '0.1.0';
const DEFAULT_URL = 'https://glimo.dev';
const STATES = ['idle', 'thinking', 'working', 'waiting', 'blocked', 'done', 'tired', 'sleeping'];

const HELP = `glimo ${VERSION} — your agents, at a glance

Usage
  glimo init [--url <base>] [--no-open]     Create a vitrina and save it in .glimo/config.json
  glimo status <agent> <state> [say…]       Show an agent's status
        [--name <display name>] [--reason <asp value>]
        [--action <id>:<label>[:sensitive]]…
  glimo wait <agent> [--seconds <0-20>]     Wait for the person's decision (prints JSON)
  glimo remove <agent>                      Take an agent off the vitrina
  glimo hooks install [--global]            Show every Claude Code session as a glim, on its own
        [--detail] [--approve] [--name <display name>]
  glimo hooks status [--global]             Say whether the hooks are installed, and for which vitrina
  glimo hooks uninstall [--global]          Remove the hooks and their runner, nothing else
  glimo demo                                Bring a sample team to life (Ctrl+C to stop)
  glimo open                                Print the address of your vitrina
  glimo mcp                                 Run a stdio MCP server for this vitrina

States
  ${STATES.join(', ')}

Claude Code hooks (they report on their own, the model does not have to remember)
  --global                                  Every project on this machine, not only this one
  --detail                                  Also send the tool name and a short summary
  --approve [--approve-seconds <10-600>]    Answer permission prompts from the vitrina
  --name <display name>                     Name of the glim (or GLIMO_AGENT_NAME)

Configuration (first match wins)
  GLIMO_URL, GLIMO_VITRINA, GLIMO_KEY       environment variables
  .glimo/config.json                        written by "glimo init" (keep it out of git)

Docs  https://glimo.dev  ·  https://github.com/lukchamo/glimo
`;

// ---------- arguments ----------

/** Splits argv into positionals and --flags. Repeated flags become arrays. */
export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split(/=(.*)/s, 2);
    const next = argv[i + 1];
    let value = true;
    if (inline !== undefined) value = inline;
    else if (next !== undefined && !next.startsWith('--') && !name.startsWith('no-')) {
      value = next;
      i += 1;
    }
    if (flags[name] === undefined) flags[name] = value;
    else flags[name] = [].concat(flags[name], value);
  }
  return { positional, flags };
}

/** "approve:Approve sending:sensitive" → { id, label, kind, sensitive } */
export function parseAction(text, index = 0) {
  const parts = String(text).split(':');
  const id = parts[0];
  const sensitive = parts.length > 2 && parts.at(-1) === 'sensitive';
  const label = parts.slice(1, sensitive ? -1 : undefined).join(':') || id;
  return {
    id,
    label,
    kind: index === 0 ? 'primary' : 'secondary',
    ...(sensitive ? { sensitive: true } : {}),
  };
}

export function buildStatus(agent, state, say, flags = {}) {
  if (!agent || !state) throw new Error('Usage: glimo status <agent> <state> [say…]');
  if (!STATES.includes(state)) {
    throw new Error(`"${state}" is not a state. Use one of: ${STATES.join(', ')}`);
  }
  const actions = flags.action ? [].concat(flags.action).map(parseAction) : undefined;
  return {
    agent: { id: agent, name: typeof flags.name === 'string' ? flags.name : agent },
    state,
    ...(say ? { say } : {}),
    ...(typeof flags.reason === 'string' ? { reason: flags.reason } : {}),
    ...(actions ? { actions } : {}),
  };
}

// ---------- configuration ----------

function findConfig(start = process.cwd()) {
  let dir = resolve(start);
  for (;;) {
    const file = join(dir, '.glimo', 'config.json');
    if (existsSync(file)) return file;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function loadConfig(env = process.env, cwd = process.cwd()) {
  const file = findConfig(cwd);
  const saved = file ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const config = {
    url: (env.GLIMO_URL ?? saved.url ?? DEFAULT_URL).replace(/\/$/, ''),
    id: env.GLIMO_VITRINA ?? saved.id,
    key: env.GLIMO_KEY ?? saved.key,
  };
  if (!config.id || !config.key) {
    throw new Error('No vitrina yet. Run "glimo init" first (or set GLIMO_VITRINA and GLIMO_KEY).');
  }
  return config;
}

// ---------- HTTP ----------

async function call(config, path, { method = 'GET', body, auth = true } = {}) {
  const response = await fetch(config.url + path, {
    method,
    headers: {
      'user-agent': `glimo-cli/${VERSION}`,
      ...(auth && config.key ? { authorization: `Bearer ${config.key}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON: fall through to the generic message.
  }
  if (!response.ok) {
    const issues = data?.error?.issues
      ?.map((i) => `  ${i.path || 'status'}: ${i.message}`)
      .join('\n');
    throw new Error(
      `${data?.error?.message ?? `Request failed (${response.status})`}${issues ? `\n${issues}` : ''}`,
    );
  }
  return data;
}

function openInBrowser(url) {
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(command, args, { stdio: 'ignore', detached: true })
      .on('error', () => {})
      .unref();
  } catch {
    // No browser here (CI, SSH): the address is printed anyway.
  }
}

// ---------- commands ----------

async function init(flags, out) {
  const url = (
    typeof flags.url === 'string' ? flags.url : (process.env.GLIMO_URL ?? DEFAULT_URL)
  ).replace(/\/$/, '');
  const created = await call({ url }, '/api/vitrinas', { method: 'POST', auth: false });
  const dir = join(process.cwd(), '.glimo');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'config.json');
  writeFileSync(file, `${JSON.stringify({ url, id: created.id, key: created.key }, null, 2)}\n`);
  try {
    chmodSync(file, 0o600);
  } catch {
    // Windows: permissions are handled by the profile folder.
  }
  // The key must never be committed.
  writeFileSync(join(dir, '.gitignore'), '*\n');

  const owner = `${created.url}#k=${created.key}`;
  out(`Your vitrina is ready.

  Watch     ${created.url}
  Decide    ${owner}
            (the part after # is your key: it never leaves your browser)

Show an agent
  glimo status sales waiting "Wants to send 12 emails" --action approve:"Approve sending":sensitive

Connect an MCP client (Claude Code)
  claude mcp add --transport http glimo ${created.mcp} \\
    --header "Authorization: Bearer ${created.key}"

Saved to .glimo/config.json (ignored by git). Hosted vitrinas are deleted after 7 days without activity.`);
  if (flags['no-open'] !== true && flags.open !== false) openInBrowser(owner);
}

async function status(positional, flags, out) {
  const [agent, state, ...say] = positional;
  const config = loadConfig();
  const body = buildStatus(agent, state, say.join(' '), flags);
  await call(config, `/api/vitrinas/${config.id}/status`, { method: 'POST', body });
  out(`${body.agent.name}: ${state}${body.say ? ` — ${body.say}` : ''}`);
}

async function wait(positional, flags, out) {
  const [agent] = positional;
  if (!agent) throw new Error('Usage: glimo wait <agent> [--seconds <0-20>]');
  const config = loadConfig();
  const seconds = Math.min(20, Math.max(0, Number(flags.seconds ?? 20) || 0));
  const result = await call(
    config,
    `/api/vitrinas/${config.id}/actions?agent=${encodeURIComponent(agent)}&wait=${seconds}`,
  );
  out(JSON.stringify(result.actions, null, 2));
  return result.actions.length > 0 ? 0 : 2;
}

async function remove(positional, out) {
  const [agent] = positional;
  if (!agent) throw new Error('Usage: glimo remove <agent>');
  const config = loadConfig();
  await call(config, `/api/vitrinas/${config.id}/agents/${encodeURIComponent(agent)}`, {
    method: 'DELETE',
  });
  out(`${agent} left the vitrina.`);
}

const DEMO = [
  [
    'sales',
    'Sales',
    'waiting',
    'Wants to send 12 follow-up emails',
    ['approve:Approve sending:sensitive', 'open:See emails'],
  ],
  ['support', 'Support', 'working', 'On ticket 18 of 40'],
  ['invoices', 'Invoices', 'tired', "Reached the bank API's daily limit"],
  ['calendar', 'Calendar', 'done', 'Moved 3 meetings to free your Thursday'],
  ['research', 'Research', 'thinking', 'Planning how to compare 5 tenders'],
  [
    'data',
    'Data',
    'blocked',
    'Its database credential expired',
    ['renew-access:Renew access:sensitive'],
  ],
];
const DEMO_LOOP = [
  ['research', 'Research', 'working', 'Reading the requirements of 5 tenders'],
  ['support', 'Support', 'done', 'Closed 40 tickets this morning'],
  ['calendar', 'Calendar', 'idle', 'Ready for the next change'],
  ['research', 'Research', 'done', 'The comparison is ready'],
  ['support', 'Support', 'working', 'New tickets came in: 2 of 9'],
  ['research', 'Research', 'thinking', 'Planning how to compare 5 tenders'],
  ['calendar', 'Calendar', 'done', 'Moved 3 meetings to free your Thursday'],
];

async function demo(out) {
  const config = loadConfig();
  const push = ([id, name, state, say, actions]) =>
    call(config, `/api/vitrinas/${config.id}/status`, {
      method: 'POST',
      body: buildStatus(id, state, say, { name, ...(actions ? { action: actions } : {}) }),
    });
  for (const agent of DEMO) await push(agent);
  out(
    `A sample team is on your vitrina: ${config.url}/v/${config.id}\nApprove something there and watch it react. Ctrl+C to stop.`,
  );
  let step = 0;
  for (;;) {
    // The simulated agents collect decisions the way real ones do.
    for (const id of ['sales', 'data']) {
      const { actions } = await call(
        config,
        `/api/vitrinas/${config.id}/actions?agent=${id}&wait=1`,
      );
      if (actions.length > 0) {
        const name = id === 'sales' ? 'Sales' : 'Data';
        out(`${name}: the person chose "${actions[0].actionId}"`);
        await push([id, name, 'working', 'On it']);
        setTimeout(() => push([id, name, 'done', 'Done, thanks']).catch(() => {}), 2500);
      }
    }
    await push(DEMO_LOOP[step % DEMO_LOOP.length]);
    step += 1;
  }
}

/** stdio ↔ HTTP bridge: lets MCP clients without HTTP transport use the hosted endpoint. */
async function mcp() {
  const config = loadConfig();
  const lines = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    try {
      const response = await fetch(`${config.url}/mcp/${config.id}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.key}`,
          'content-type': 'application/json',
          accept: 'application/json',
          'user-agent': `glimo-cli/${VERSION}`,
        },
        body: JSON.stringify(message),
      });
      if (response.status === 202) continue;
      const text = await response.text();
      if (text) process.stdout.write(`${JSON.stringify(JSON.parse(text))}\n`);
    } catch (error) {
      if (message.id !== undefined) {
        process.stdout.write(
          `${JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: String(error.message ?? error) } })}\n`,
        );
      }
    }
  }
}

export async function main(argv = process.argv.slice(2), out = console.log) {
  const { positional, flags } = parseArgs(argv);
  const [command, ...rest] = positional;
  if (flags.version || command === 'version') return out(VERSION);
  if (!command || flags.help || command === 'help') return out(HELP);
  switch (command) {
    case 'init':
      return init(flags, out);
    case 'status':
    case 'emit':
      return status(rest, flags, out);
    case 'wait':
      return wait(rest, flags, out);
    case 'remove':
      return remove(rest, out);
    case 'hooks':
      return hooks(rest, flags, out, { loadConfig, findConfig, defaultUrl: DEFAULT_URL });
    case 'demo':
      return demo(out);
    case 'open': {
      const config = loadConfig();
      const url = `${config.url}/v/${config.id}#k=${config.key}`;
      out(url);
      if (flags['no-open'] !== true) openInBrowser(url);
      return;
    }
    case 'mcp':
      return mcp();
    default:
      throw new Error(`Unknown command "${command}". Run "glimo --help".`);
  }
}

// Run only when executed directly (npx links the bin, so compare real paths).
const invoked = process.argv[1] ? realpathSync(process.argv[1]) : '';
if (invoked === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => {
      if (typeof code === 'number') process.exitCode = code;
    },
    (error) => {
      console.error(`glimo: ${error.message}`);
      process.exitCode = 1;
    },
  );
}
