#!/usr/bin/env node
// Glimo hook runner: a Claude Code session shows up on your vitrina as a living glim,
// with no help from the model.
//
// "glimo hooks install" copies this file to .glimo/hook.mjs and registers it in Claude
// Code's settings. Claude Code then runs `node .glimo/hook.mjs` on its hook events, with
// the event as JSON on stdin. Zero dependencies, Node 20+, nothing imported from the CLI:
// one run costs a Node start, not an npx start.
//
// What this file promises:
//   · it never blocks or breaks Claude Code: any error or timeout ends in exit code 0, in silence
//   · it prints nothing, unless the person answered a permission prompt from the vitrina
//   · it sends a generic phrase ("Editing files"), never the prompt, a command, a path or
//     a file's content. Only "glimo hooks install --detail" adds a short summary
//   · the key travels in the Authorization header, never in a URL or a log

import { randomBytes } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_URL = 'https://glimo.dev';
const HERE = dirname(fileURLToPath(import.meta.url));

/** One status request may take this long. After that the hook gives up. */
const NETWORK_MS = 1500;
/** Tool hooks fire constantly: the same state and phrase are said once in this window. */
const THROTTLE_MS = 20_000;
/** Same state, new phrase ("Reading" then "Editing"): at most one update in this window. */
const SAME_STATE_MS = 2000;
/** After the server refuses a status (bad key, too many requests) nothing is sent for this long. */
const BACKOFF_MS = 10_000;
/** An event this far in the future can only come from a clock that jumped back. */
const CLOCK_JUMP = 30_000_000;
/** The longest the server keeps a request for decisions open, in seconds. */
const POLL_SECONDS = 20;
/** Session folders nobody touched for this long are swept away. */
const STALE_MS = 2 * 24 * 3_600_000;
/** Events are ordered by when their hook process started, in microseconds. */
const BORN = Math.round(performance.timeOrigin * 1000);
/**
 * A permission request starts right after the PreToolUse of the same call. It gets a
 * small head start so that call, or a sibling running in parallel, cannot overwrite
 * "waiting for you" with "working".
 */
const HEAD_START = 150_000;
/** These tools need an answer that only the terminal can collect. */
const NEEDS_THE_TERMINAL = new Set(['AskUserQuestion', 'ExitPlanMode']);

// ---------- words ----------

/** One line, no control characters, at most `max` characters. */
export function clip(text, max) {
  const line = String(text ?? '')
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (line.length <= max) return line;
  let out = '';
  for (const char of line) {
    if (out.length + char.length > max - 1) break;
    out += char;
  }
  return `${out.trimEnd()}…`;
}

/** "My Project_2" → "my-project-2" */
export function slug(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Best effort: hides what looks like a credential. Not a guarantee. */
export function redact(text) {
  return String(text ?? '')
    .replace(/\/\/[^/\s:@]+:[^/\s@]+@/g, '//…@')
    .replace(/\b(bearer|basic)\s+[^\s"']+/gi, '$1 …')
    .replace(
      /\b([\w-]*(?:token|secret|password|passwd|api[-_]?key))\b(\s*[:=]\s*|\s+)["']?[^\s"']+/gi,
      '$1$2…',
    )
    .replace(/[A-Za-z0-9+/_-]{32,}/g, '…');
}

const TOOL_PHRASES = [
  [/^(Edit|Write|MultiEdit|NotebookEdit)$/, 'Editing files'],
  [/^(Bash|PowerShell|Monitor|BashOutput|KillShell)$/, 'Running a command'],
  [/^(Read|Glob|Grep|LS|NotebookRead)$/, 'Reading the codebase'],
  [/^(WebFetch|WebSearch)$/, 'Searching the web'],
  [/^(Agent|Task)$/, 'Delegating to a subagent'],
];

/** A generic phrase for a tool. It says what kind of work, never what exactly. */
export function toolPhrase(tool) {
  const name = String(tool ?? '');
  const mcp = /^mcp__(.+?)__/.exec(name);
  if (mcp) return `Using ${clip(mcp[1].replace(/[^\w .-]+/g, ' '), 40)} tools`;
  return TOOL_PHRASES.find(([pattern]) => pattern.test(name))?.[1] ?? 'Working on it';
}

function insideProject(file, root) {
  const path = String(file ?? '').replace(/\\/g, '/');
  const base = String(root ?? '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');
  if (base && path.startsWith(`${base}/`)) return path.slice(base.length + 1);
  // Outside the project only the file name is said.
  return path.split('/').filter(Boolean).at(-1) ?? '';
}

function hostOf(url) {
  try {
    return new URL(String(url)).hostname;
  } catch {
    return '';
  }
}

/** Opt-in ("--detail"): the tool name and at most 80 characters about what it is doing. */
function detailFor(tool, toolInput, root) {
  const name = String(tool);
  const args = toolInput && typeof toolInput === 'object' ? toolInput : {};
  const mcp = /^mcp__.+?__(.+)$/.exec(name);
  if (mcp) return clip(mcp[1], 80);
  let about = '';
  if (/^(Bash|PowerShell|Monitor)$/.test(name)) about = args.command;
  else if (/^(Edit|Write|MultiEdit|Read)$/.test(name)) about = insideProject(args.file_path, root);
  else if (name === 'NotebookEdit') about = insideProject(args.notebook_path, root);
  else if (/^(Glob|Grep)$/.test(name)) about = args.pattern;
  else if (name === 'WebSearch') about = args.query;
  else if (name === 'WebFetch') about = hostOf(args.url);
  else if (/^(Agent|Task)$/.test(name)) about = args.description;
  const summary = clip(redact(about), 80);
  return summary ? `${clip(name, 30)}: ${summary}` : clip(name, 30);
}

// ---------- event → status ----------

/**
 * Maps one Claude Code hook event to what the vitrina should show.
 * Returns a status ({ state, reason, say }), { remove: true } when the session ended,
 * or null when the event changes nothing.
 */
export function statusFor(input, { detail = false, root = '' } = {}) {
  const tool = input.tool_name;
  const withDetail = (say) =>
    detail && tool ? clip(`${say} · ${detailFor(tool, input.tool_input, root)}`, 120) : say;

  switch (input.hook_event_name) {
    case 'SessionStart':
      // After a compaction the session is in the middle of its work, not idle.
      if (input.source === 'compact') return null;
      return { state: 'idle', reason: 'idle', say: 'Ready for a task' };
    case 'UserPromptSubmit':
      return { state: 'thinking', reason: 'queued', say: 'Got a new task' };
    case 'PreToolUse':
    case 'PermissionRequest':
      if (tool === 'AskUserQuestion') {
        return { state: 'waiting', reason: 'input-required', say: 'Has a question for you' };
      }
      if (tool === 'ExitPlanMode') {
        return {
          state: 'waiting',
          reason: 'awaiting-approval',
          say: 'Has a plan ready for your review',
        };
      }
      if (input.hook_event_name === 'PermissionRequest') {
        return {
          state: 'waiting',
          reason: 'awaiting-approval',
          say: withDetail('Needs your permission'),
        };
      }
      return { state: 'working', reason: 'working', say: withDetail(toolPhrase(tool)) };
    case 'Notification': {
      // Older Claude Code versions send no type, only the text.
      const type =
        input.notification_type ??
        (/permission/i.test(String(input.message ?? '')) ? 'permission_prompt' : '');
      if (type === 'permission_prompt') {
        return { state: 'waiting', reason: 'awaiting-approval', say: 'Needs your permission' };
      }
      if (type === 'elicitation_dialog' || type === 'elicitation_url_dialog') {
        return { state: 'waiting', reason: 'input-required', say: 'Needs your input' };
      }
      return null;
    }
    case 'Stop':
      return { state: 'done', reason: 'completed', say: 'Finished its turn' };
    case 'StopFailure':
      if (input.error === 'rate_limit') {
        return { state: 'tired', reason: 'rate-limited', say: 'Hit a rate limit' };
      }
      if (input.error === 'authentication_failed') {
        return { state: 'blocked', reason: 'auth-error', say: 'Needs you to sign in again' };
      }
      return { state: 'blocked', reason: 'failed', say: 'Stopped by an API error' };
    case 'SessionEnd':
      return { remove: true };
    default:
      return null;
  }
}

/** Who this session is on the vitrina: one glim per Claude Code session. */
export function agentFor(input, settings = {}, env = process.env) {
  const root = env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const folder =
    String(root)
      .split(/[\\/]+/)
      .filter(Boolean)
      .at(-1) || 'project';
  const project = slug(folder).slice(0, 48).replace(/-+$/, '') || 'project';
  const session = slug(input.session_id).replace(/-/g, '').slice(0, 4) || '0000';
  return {
    id: `cc-${project}-${session}`,
    name: clip(settings.name, 40) || clip(`Claude · ${folder}`, 40),
  };
}

// ---------- configuration ----------

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * The vitrina and the options, first match wins: environment variables, then hook.json
 * (written by "glimo hooks install"), then config.json (written by "glimo init"), both
 * next to this file.
 */
export function loadSettings(dir = HERE, env = process.env) {
  const saved = { ...readJson(join(dir, 'config.json')), ...readJson(join(dir, 'hook.json')) };
  const seconds = Number(saved.approveSeconds);
  return {
    url: String(env.GLIMO_URL ?? saved.url ?? DEFAULT_URL).replace(/\/$/, ''),
    id: env.GLIMO_VITRINA ?? saved.id,
    key: env.GLIMO_KEY ?? saved.key,
    name: env.GLIMO_AGENT_NAME ?? saved.name,
    detail: saved.detail === true,
    approve: saved.approve === true,
    approveSeconds: Number.isFinite(seconds) && seconds > 0 ? Math.min(600, seconds) : 120,
  };
}

// ---------- HTTP ----------

const sleep = (ms, signal) =>
  new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

/** Every call answers with the parsed response, or null when nothing came back in time. */
function connect(settings) {
  const base = `${settings.url}/api/vitrinas/${encodeURIComponent(settings.id)}`;
  const call = async (path, { method = 'GET', body, timeout = NETWORK_MS, signal } = {}) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timer = setTimeout(abort, timeout);
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const response = await fetch(base + path, {
        method,
        headers: {
          authorization: `Bearer ${settings.key}`,
          'user-agent': 'glimo-hook',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {
        // Not JSON: the status code is all there is.
      }
      return { ok: response.ok, data };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  };
  return {
    post: (status) => call('/status', { method: 'POST', body: status }),
    remove: (agentId) => call(`/agents/${encodeURIComponent(agentId)}`, { method: 'DELETE' }),
    decisions: (agentId, seconds, signal) =>
      call(`/actions?agent=${encodeURIComponent(agentId)}&wait=${seconds}`, {
        timeout: (seconds + 5) * 1000,
        signal,
      }),
  };
}

// ---------- what this session said last (a tiny folder under the temp directory) ----------

function writeJson(file, value) {
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(value), { mode: 0o600 });
  renameSync(temp, file);
}

function forget(file) {
  try {
    rmSync(file, { force: true });
  } catch {
    // Already gone.
  }
}

/** Removes the folders of sessions that ended long ago without saying goodbye. */
function sweep(base) {
  try {
    for (const name of readdirSync(base).slice(0, 200)) {
      const path = join(base, name);
      if (Date.now() - statSync(path).mtimeMs > STALE_MS) {
        rmSync(path, { recursive: true, force: true });
      }
    }
  } catch {
    // Housekeeping only.
  }
}

/** The folder of this session, or null: without it the hook still works, statelessly. */
function openSession(settings, input) {
  try {
    const uid = typeof process.getuid === 'function' ? process.getuid() : 'u';
    const base = join(tmpdir(), `glimo-hooks-${uid}`);
    mkdirSync(base, { recursive: true, mode: 0o700 });
    // The temp directory can be shared: only a folder this user owns is trusted.
    const info = lstatSync(base);
    if (!info.isDirectory() || (typeof uid === 'number' && info.uid !== uid)) return null;
    if (input.hook_event_name === 'SessionStart') sweep(base);
    const safe = (text) => String(text ?? '').replace(/[^A-Za-z0-9_-]+/g, '');
    const dir = join(
      base,
      `${safe(settings.id).slice(0, 32)}-${safe(input.session_id).slice(0, 80) || 'session'}`,
    );
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    return dir;
  } catch {
    return null;
  }
}

/** Who the session is gets decided once, so a later `cd` cannot turn it into another glim. */
function remembered(dir, agent, named) {
  if (!dir) return agent;
  const file = join(dir, 'agent.json');
  try {
    writeFileSync(file, JSON.stringify(agent), { flag: 'wx', mode: 0o600 });
    return agent;
  } catch {
    const first = readJson(file);
    if (typeof first?.id !== 'string' || !first.id) return agent;
    // A name the person chose always wins. The folder name is the one that must not drift.
    return {
      id: first.id,
      name: named || typeof first.name !== 'string' ? agent.name : first.name,
    };
  }
}

/** A key for something said now, always later than `key` (a request has a head start). */
const after = (key) =>
  Math.max(Math.round((performance.timeOrigin + performance.now()) * 1000), key + 1);
const eventFile = (dir, key) => join(dir, `e-${String(key).padStart(17, '0')}-${process.pid}.json`);
const approvalFile = (dir) => join(dir, 'approval.json');
const refusedFile = (dir) => join(dir, 'refused.json');
const sendingFile = (dir) => join(dir, 'sending.json');
const signature = (body) =>
  JSON.stringify([body.state, body.say, (body.actions ?? []).map((action) => action.id)]);

/** The files "<kind>-<number>-<pid>.json" of a session: one per hook run, never shared. */
function numbered(dir, kind) {
  try {
    return readdirSync(dir)
      .map((name) => ({ name, match: /^([a-z])-(\d+)-\d+\.json$/.exec(name) }))
      .filter(({ match }) => match?.[1] === kind)
      .map(({ name, match }) => ({ name, key: Number(match[2]), file: join(dir, name) }));
  } catch {
    return [];
  }
}

const events = (dir) => numbered(dir, 'e');

/**
 * The latest event any hook run recorded for this session. An event from the far future
 * is a leftover of a clock that jumped back: it is thrown away, or the glim would stand
 * still until the clock caught up.
 */
function newest(dir) {
  const present = after(0);
  let best = null;
  for (const event of events(dir)) {
    if (event.key - present > CLOCK_JUMP) forget(event.file);
    else if (!best || event.name > best.name) best = event;
  }
  return best;
}

function prune(dir, before) {
  for (const event of events(dir)) if (event.key < before) forget(event.file);
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/** The permission request that is waiting for an answer on the vitrina right now, if any. */
function pendingApproval(dir) {
  const lock = readJson(approvalFile(dir));
  if (!lock) return null;
  if (Date.now() < lock.until && alive(lock.pid)) return lock;
  forget(approvalFile(dir));
  return null;
}

/**
 * What the vitrina holds for this session, as far as this machine knows. The server
 * numbers every write, so the record with the highest number is the status that really
 * landed last, whichever hook run happened to write its file last.
 */
function lastPosted(dir) {
  let best = null;
  for (const record of numbered(dir, 'p')) if (!best || record.name > best.name) best = record;
  return best && readJson(best.file);
}

function notePosted(dir, seq, body) {
  const order = Number.isFinite(seq) ? seq : Date.now();
  writeJson(join(dir, `p-${String(order).padStart(15, '0')}-${process.pid}.json`), {
    sig: body.remove ? 'gone' : signature(body),
    state: body.remove ? null : body.state,
    actions: Boolean(body.actions),
    at: Date.now(),
  });
  for (const record of numbered(dir, 'p')) if (record.key < order) forget(record.file);
}

const backingOff = (dir) => Date.now() - (readJson(refusedFile(dir))?.at ?? 0) < BACKOFF_MS;

/** A status of this session that is on its way to the vitrina right now, if any. */
function onTheWire(dir) {
  const sending = readJson(sendingFile(dir));
  return sending && Date.now() - sending.at < NETWORK_MS + 500 ? sending : null;
}

// ---------- telling the vitrina ----------

async function send(ctx, body) {
  const answered = body.remove ? await ctx.api.remove(ctx.agent.id) : await ctx.api.post(body);
  if (answered && ctx.dir) {
    try {
      if (answered.ok) notePosted(ctx.dir, answered.data?.seq, body);
      else if (!body.remove) writeJson(refusedFile(ctx.dir), { at: Date.now() });
    } catch {
      // The session folder went away (the session ended): nothing to remember.
    }
  }
  return answered;
}

/**
 * Posts a status, unless a later event already spoke or it would repeat what was just said.
 * Hook runs are separate processes and their requests can overtake each other, so after
 * posting it looks again: if something newer was recorded meanwhile, the newest is said
 * once more. The vitrina always ends on the latest status.
 *
 * `patient` is for tool events, which run in the background and come in bursts: a new
 * phrase in the same state waits for the window to pass, and is said only if it is still
 * the latest word by then.
 */
async function publish(ctx, status, key, patient = false) {
  const { dir } = ctx;
  const body = { agent: ctx.agent, ...status };
  // Nowhere to keep state: say it anyway.
  if (!dir) return Boolean(await send(ctx, body));
  try {
    writeJson(eventFile(dir, key), body);
  } catch {
    return Boolean(await send(ctx, body));
  }

  for (let turn = 0; turn < 3; turn++) {
    if ((newest(dir)?.key ?? 0) > key) return false;
    const last = lastPosted(dir);
    if (last?.sig === signature(body) && Date.now() - last.at < THROTTLE_MS) {
      prune(dir, key);
      return false;
    }
    if (!patient) break;
    // The same state was said, or is being said, a moment ago: this is chatter. Wait for
    // the moment to pass. Buttons appearing or going away is never chatter.
    const recent = [last, onTheWire(dir)]
      .filter((said) => said && said.state === body.state && !said.actions)
      .map((said) => Date.now() - said.at)
      .filter((age) => age >= 0 && age < SAME_STATE_MS);
    if (recent.length === 0) break;
    // In a burst most runs learn within a quarter of a second that a later tool came,
    // and leave: only the last one stays for the whole moment.
    const until = Date.now() + SAME_STATE_MS - Math.min(...recent) + 20;
    while (Date.now() < until) {
      await sleep(Math.min(250, until - Date.now()));
      if ((newest(dir)?.key ?? 0) > key) return false;
    }
  }
  if (backingOff(dir)) return false;

  let sent = key;
  try {
    writeJson(sendingFile(dir), {
      state: body.state,
      actions: Boolean(body.actions),
      at: Date.now(),
    });
  } catch {
    // Only a hint for the runs next to this one.
  }
  let answered = await send(ctx, body);
  for (let round = 0; answered && round < 4; round++) {
    const latest = newest(dir);
    if (!latest || latest.key <= sent) break;
    const next = readJson(latest.file);
    // Another run tidied it away between the look and the read: look again.
    if (!next) continue;
    // Its own run got there after this one: the vitrina already ends on it.
    if (lastPosted(dir)?.sig === (next.remove ? 'gone' : signature(next))) break;
    sent = latest.key;
    answered = await send(ctx, next);
  }
  prune(dir, sent);
  return Boolean(answered);
}

/** The session is over: its glim leaves the vitrina. */
async function leave(ctx, key) {
  const { dir } = ctx;
  let busy = false;
  if (dir) {
    forget(approvalFile(dir));
    // Another hook run may still have a status on the wire (Stop, then exit at once).
    busy = (newest(dir)?.key ?? 0) > key - 3_000_000;
    try {
      writeJson(eventFile(dir, key), { remove: true });
    } catch {
      // Stateless is fine here.
    }
    for (const record of numbered(dir, 'p')) forget(record.file);
  }
  await send(ctx, { remove: true });
  if (busy) {
    // That run may have been stopped before it could look again: once more, to be sure.
    await sleep(400);
    await send(ctx, { remove: true });
  }
  if (dir) prune(dir, key);
}

/**
 * Opt-in ("--approve"): Claude Code asks for permission and the person answers from the
 * vitrina. Prints the decision Claude Code expects from a PermissionRequest hook. With no
 * answer in time it prints nothing, so Claude Code shows its usual prompt.
 */
async function askOnVitrina(ctx, status, { key, thread, seconds, afterAllow }) {
  const { dir, api, agent } = ctx;
  if (backingOff(dir)) return;
  // The action ids are unique to this request. A click meant for an earlier prompt can
  // never approve this one: the server only accepts actions the current status declares.
  const nonce = randomBytes(4).toString('hex');
  const allow = `approve-${nonce}`;
  const deny = `deny-${nonce}`;
  const lock = { pid: process.pid, key, thread, nonce, until: Date.now() + (seconds + 20) * 1000 };
  try {
    // One request at a time on the vitrina. A second one goes to the terminal.
    writeFileSync(approvalFile(dir), JSON.stringify(lock), { flag: 'wx', mode: 0o600 });
  } catch {
    return;
  }
  const mine = () => readJson(approvalFile(dir))?.nonce === nonce;
  const body = {
    agent,
    ...status,
    actions: [
      { id: allow, label: 'Allow', kind: 'primary', sensitive: true },
      { id: deny, label: 'Deny', kind: 'secondary' },
    ],
  };

  try {
    let shown = key;
    writeJson(eventFile(dir, shown), body);
    // Without the buttons on the vitrina there is nothing to wait for.
    if (!(await send(ctx, body))?.ok) return;

    const until = Date.now() + seconds * 1000;
    const answeredElsewhere = new AbortController();
    let restoring = false;
    const watch = setInterval(() => {
      // A later event on the same thread took the request away: the prompt was
      // answered in the terminal.
      if (!mine()) return answeredElsewhere.abort();
      // Another hook run slipped a status in before it saw this request: put the
      // question back, or the buttons would be gone while Claude Code still waits.
      if (restoring || (newest(dir)?.key ?? 0) <= shown) return;
      restoring = true;
      shown = after(shown);
      try {
        writeJson(eventFile(dir, shown), body);
      } catch {
        // The session folder went away.
      }
      send(ctx, body).finally(() => {
        restoring = false;
      });
    }, 500);

    let decision = null;
    let failures = 0;
    while (!decision && Date.now() < until && !answeredElsewhere.signal.aborted) {
      const started = Date.now();
      const wait = Math.max(1, Math.min(POLL_SECONDS, Math.ceil((until - started) / 1000)));
      const result = await api.decisions(agent.id, wait, answeredElsewhere.signal);
      const actions = Array.isArray(result?.data?.actions) ? result.data.actions : null;
      // The vitrina cannot be reached, or it says no: the terminal is the place to answer.
      failures = actions ? 0 : failures + 1;
      if (failures >= 3) break;
      decision = actions?.find((a) => a?.actionId === allow || a?.actionId === deny) ?? null;
      // A server that answers at once must not turn this into a busy loop.
      if (!decision) await sleep(started + 1000 - Date.now(), answeredElsewhere.signal);
    }
    clearInterval(watch);
    if (answeredElsewhere.signal.aborted) return;

    if (!decision) {
      // Nobody answered here. The buttons go away and the terminal takes over.
      await publish(ctx, { ...status, say: 'Needs your permission in the terminal' }, after(shown));
      return;
    }
    const allowed = decision.actionId === allow;
    const output = {
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        decision: allowed
          ? { behavior: 'allow' }
          : { behavior: 'deny', message: 'The person denied this from the Glimo vitrina.' },
      },
    };
    await new Promise((resolve) => process.stdout.write(`${JSON.stringify(output)}\n`, resolve));
    await publish(
      ctx,
      allowed
        ? afterAllow
        : { state: 'thinking', reason: 'queued', say: 'Got your no, looking for another way' },
      after(shown),
    );
  } finally {
    if (mine()) forget(approvalFile(dir));
  }
}

// ---------- one hook run ----------

export async function run(input, settings, env = process.env) {
  const event = input.hook_event_name;
  const options = { detail: settings.detail, root: env.CLAUDE_PROJECT_DIR || input.cwd || '' };
  const status = statusFor(input, options);
  if (!status) return;

  const dir = openSession(settings, input);
  const agent = remembered(dir, agentFor(input, settings, env), Boolean(clip(settings.name, 40)));
  const ctx = { dir, api: connect(settings), agent };
  const key = BORN + (event === 'PermissionRequest' ? HEAD_START : 0);
  if (status.remove) return leave(ctx, key);

  // Subagents fire the same hooks with the same session id: `agent_id` tells them apart.
  const thread = String(input.agent_id ?? '');
  const pending = dir && pendingApproval(dir);
  if (pending) {
    // While a request waits on the vitrina, "waiting for you" keeps the floor. Only a
    // later event on the same thread ends it: that thread moved on, so the prompt was
    // answered in the terminal.
    const movedOn =
      event !== 'PermissionRequest' &&
      event !== 'Notification' &&
      thread === pending.thread &&
      key > pending.key;
    if (!movedOn) return;
    forget(approvalFile(dir));
  }

  // The notification is a safety net. It never replaces a more precise "waiting".
  if (event === 'Notification' && dir && lastPosted(dir)?.state === 'waiting') return;

  if (
    event === 'PermissionRequest' &&
    settings.approve &&
    dir &&
    !NEEDS_THE_TERMINAL.has(input.tool_name)
  ) {
    return askOnVitrina(ctx, status, {
      key,
      thread,
      seconds: settings.approveSeconds,
      afterAllow: statusFor({ ...input, hook_event_name: 'PreToolUse' }, options),
    });
  }
  await publish(ctx, status, key, event === 'PreToolUse');
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

async function main() {
  const quit = () => process.exit(0);
  process.on('uncaughtException', quit);
  process.on('unhandledRejection', quit);
  // A hook must never outlive its welcome, whatever happens below.
  let guard = setTimeout(quit, 9000);
  try {
    const settings = loadSettings();
    if (!settings.id || !settings.key) return;
    const input = JSON.parse(await readStdin());
    if (!input || typeof input !== 'object') return;
    if (input.hook_event_name === 'PermissionRequest' && settings.approve) {
      clearTimeout(guard);
      guard = setTimeout(quit, (settings.approveSeconds + 12) * 1000);
    }
    await run(input, settings);
  } catch {
    // Silence is the contract: a hook must never break Claude Code.
  } finally {
    clearTimeout(guard);
  }
}

// Run only when executed directly (the tests import the pure parts).
let invoked = '';
try {
  invoked = process.argv[1] ? realpathSync(process.argv[1]) : '';
} catch {
  // Not a file: imported some other way.
}
if (invoked === fileURLToPath(import.meta.url)) {
  main().finally(() => process.exit(0));
}
