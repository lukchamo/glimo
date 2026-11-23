// glimo hooks — a Claude Code session shows up on the vitrina on its own.
//
//   glimo hooks install [--global] [--approve] [--detail] [--name <display name>]
//   glimo hooks status [--global]
//   glimo hooks uninstall [--global]
//
// Installing copies the runner (claude-hook.mjs) next to the vitrina config as
// .glimo/hook.mjs and registers it in Claude Code's settings. Every other setting, and
// every hook that is not ours, stays exactly as it was.

import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RUNNER_SOURCE = fileURLToPath(new URL('./claude-hook.mjs', import.meta.url));
const RUNNER = 'hook.mjs';
const OPTIONS = 'hook.json';
const DEFAULT_APPROVE_SECONDS = 120;
/** The first Claude Code that knows the exec form of a command hook (`args`). */
const MIN_CLAUDE_CODE = [2, 1, 139];

const USAGE = `Usage
  glimo hooks install [--global] [--approve] [--detail] [--name <display name>]
  glimo hooks status [--global]
  glimo hooks uninstall [--global]`;

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

// ---------- Claude Code settings ----------

/** Our handlers are recognised by the runner they call: a path ending in .glimo/hook.mjs. */
export function isOurs(handler) {
  if (!isRecord(handler)) return false;
  const parts = [handler.command, ...(Array.isArray(handler.args) ? handler.args : [])];
  return parts.some(
    (part) => typeof part === 'string' && /[\\/]\.glimo[\\/]hook\.mjs(?![\w.])/.test(part),
  );
}

/**
 * What "glimo hooks install" registers, in Claude Code's settings format.
 * The command is in exec form (`node` plus the runner as one argument): no shell, so a
 * path with spaces needs no quoting. Status hooks are async, so they never hold Claude
 * Code back. Only two wait: the session end (to take the glim off the vitrina) and,
 * with --approve, the permission request (to bring your answer back).
 */
export function hookEntries(runner, { approve = false, approveSeconds } = {}) {
  const run = (extra) => ({ type: 'command', command: 'node', args: [runner], ...extra });
  const inBackground = [run({ async: true })];
  const seconds = approveSeconds ?? DEFAULT_APPROVE_SECONDS;
  return {
    // Not "compact": after a compaction the session is still in the middle of its work.
    SessionStart: [{ matcher: 'startup|resume|clear|fork', hooks: inBackground }],
    UserPromptSubmit: [{ hooks: inBackground }],
    PreToolUse: [{ hooks: inBackground }],
    PermissionRequest: [
      {
        hooks: approve
          ? [
              run({
                // The runner gives up on its own first, then Claude Code shows its prompt.
                timeout: seconds + 15,
                statusMessage: 'Waiting for your answer on the Glimo vitrina',
              }),
            ]
          : inBackground,
      },
    ],
    Notification: [
      {
        matcher: 'permission_prompt|elicitation_dialog|elicitation_url_dialog',
        hooks: inBackground,
      },
    ],
    Stop: [{ hooks: inBackground }],
    StopFailure: [{ hooks: inBackground }],
    // Claude Code gives session-end hooks 1.5 seconds unless one asks for more.
    SessionEnd: [{ hooks: [run({ timeout: 5 })] }],
  };
}

/** The same settings without our handlers. Everything else is kept as it was. */
export function withoutOurs(settings) {
  const next = structuredClone(settings);
  if (!isRecord(next.hooks)) return next;
  let removed = false;
  for (const [event, groups] of Object.entries(next.hooks)) {
    if (!Array.isArray(groups)) continue;
    const kept = [];
    for (const group of groups) {
      if (!isRecord(group) || !Array.isArray(group.hooks) || !group.hooks.some(isOurs)) {
        kept.push(group);
        continue;
      }
      removed = true;
      const others = group.hooks.filter((handler) => !isOurs(handler));
      if (others.length > 0) kept.push({ ...group, hooks: others });
    }
    if (kept.length > 0) next.hooks[event] = kept;
    else if (groups.length > 0) delete next.hooks[event];
  }
  if (removed && Object.keys(next.hooks).length === 0) delete next.hooks;
  return next;
}

/** The same settings with our entries added once, after whatever is already there. */
export function mergeHooks(settings, entries) {
  const next = withoutOurs(settings);
  if (next.hooks !== undefined && !isRecord(next.hooks)) {
    throw new Error('The "hooks" setting is not an object, so nothing was changed.');
  }
  next.hooks = { ...next.hooks };
  for (const [event, groups] of Object.entries(entries)) {
    const existing = next.hooks[event];
    if (existing !== undefined && !Array.isArray(existing)) {
      throw new Error(`The "hooks.${event}" setting is not a list, so nothing was changed.`);
    }
    next.hooks[event] = [...(existing ?? []), ...groups];
  }
  return next;
}

/** The events that run our runner in these settings. */
export function registeredEvents(settings) {
  if (!isRecord(settings.hooks)) return [];
  return Object.entries(settings.hooks)
    .filter(
      ([, groups]) =>
        Array.isArray(groups) &&
        groups.some(
          (group) => isRecord(group) && Array.isArray(group.hooks) && group.hooks.some(isOurs),
        ),
    )
    .map(([event]) => event);
}

function readSettings(file) {
  if (!existsSync(file)) return { settings: {}, text: null };
  const text = readFileSync(file, 'utf8');
  if (!text.trim()) return { settings: {}, text };
  let settings;
  try {
    settings = JSON.parse(text);
  } catch {
    settings = null;
  }
  if (!isRecord(settings)) {
    throw new Error(
      `${file} is not valid JSON, so nothing was changed. Fix it and run this again.`,
    );
  }
  return { settings, text };
}

/** Writes the settings only when they changed. Keeps the indentation the file had. */
function writeSettings(file, settings, previous) {
  const indent = /^\{\r?\n([ \t]+)"/.exec(previous ?? '')?.[1] ?? 2;
  const text = `${JSON.stringify(settings, null, indent)}\n`;
  if (text === previous) return false;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  return true;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// ---------- where things live ----------

/**
 * Project: the folder where "glimo init" ran holds .glimo/, and Claude Code reads your
 * personal, uncommitted settings for it from .claude/settings.local.json.
 * Global: ~/.glimo/ and Claude Code's user settings, for every project on this machine.
 */
function locate(flags, findConfig) {
  const home = homedir();
  if (flags.global === true) {
    return {
      global: true,
      root: home,
      glimo: join(home, '.glimo'),
      settings: join(process.env.CLAUDE_CONFIG_DIR || join(home, '.claude'), 'settings.json'),
    };
  }
  const config = findConfig();
  const glimo = config ? dirname(config) : join(process.cwd(), '.glimo');
  const root = dirname(glimo);
  return { global: false, root, glimo, settings: join(root, '.claude', 'settings.local.json') };
}

/** A path the way a person would say it: relative to here, or from the home folder. */
function show(path) {
  const inside = (base) => {
    const rest = relative(base, path);
    return rest && !rest.startsWith('..') && !isAbsolute(rest) ? rest.replace(/\\/g, '/') : '';
  };
  const here = inside(process.cwd());
  if (here) return here;
  const home = inside(homedir());
  return home ? `~/${home}` : path;
}

/** True when the file sits in a git repository that would happily commit it. */
function gitWouldCommit(file) {
  try {
    const result = spawnSync('git', ['check-ignore', '-q', file], {
      cwd: dirname(file),
      stdio: 'ignore',
      timeout: 3000,
    });
    return result.status === 1;
  } catch {
    return false;
  }
}

/** The Claude Code on the PATH as [major, minor, patch], or null when it cannot be told. */
function claudeCodeVersion() {
  try {
    const result = spawnSync('claude', ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    });
    const match = /(\d+)\.(\d+)\.(\d+)/.exec(result.stdout ?? '');
    return match ? match.slice(1).map(Number) : null;
  } catch {
    return null;
  }
}

function tooOld(version) {
  for (let i = 0; i < MIN_CLAUDE_CODE.length; i++) {
    if (version[i] !== MIN_CLAUDE_CODE[i]) return version[i] < MIN_CLAUDE_CODE[i];
  }
  return false;
}

const list = (events) => {
  const lines = [];
  for (let i = 0; i < events.length; i += 5) lines.push(events.slice(i, i + 5).join(', '));
  return lines.join(',\n             ');
};

// ---------- commands ----------

function install(flags, out, { loadConfig, findConfig, claudeVersion = claudeCodeVersion }) {
  const config = loadConfig();
  const where = locate(flags, findConfig);
  if (!where.global && resolve(where.root) === resolve(homedir())) {
    throw new Error(
      'Your vitrina lives in your home folder, so these hooks would not belong to a project.\n' +
        'Run "glimo hooks install --global" to cover every project, or "glimo init" inside the project first.',
    );
  }
  const approve = flags.approve === true;
  const detail = flags.detail === true;
  const name = typeof flags.name === 'string' ? flags.name.trim() : '';
  const asked = Number(flags['approve-seconds']);
  const seconds = Number.isFinite(asked) && asked > 0 ? Math.min(600, Math.max(10, asked)) : 120;
  // Forward slashes work for Node on every platform and need no escaping in JSON.
  const runner = join(where.glimo, RUNNER).replace(/\\/g, '/');

  // The settings come first: if they cannot be read, nothing at all is touched.
  const { settings, text } = readSettings(where.settings);
  const next = mergeHooks(settings, hookEntries(runner, { approve, approveSeconds: seconds }));

  mkdirSync(where.glimo, { recursive: true });
  // The key must never be committed.
  const ignore = join(where.glimo, '.gitignore');
  if (!existsSync(ignore)) writeFileSync(ignore, '*\n');
  copyFileSync(RUNNER_SOURCE, join(where.glimo, RUNNER));

  // The runner reads config.json next to it. When that file is not there, or says
  // something else (--global, or a vitrina that came from the environment), the vitrina
  // is written down for the runner too.
  const beside = readJson(join(where.glimo, 'config.json')) ?? {};
  const sameVitrina =
    beside.id === config.id &&
    beside.key === config.key &&
    String(beside.url ?? '').replace(/\/$/, '') === config.url;
  const options = {
    ...(sameVitrina ? {} : { url: config.url, id: config.id, key: config.key }),
    ...(name ? { name } : {}),
    ...(detail ? { detail: true } : {}),
    ...(approve ? { approve: true, approveSeconds: seconds } : {}),
  };
  const optionsFile = join(where.glimo, OPTIONS);
  if (Object.keys(options).length === 0) rmSync(optionsFile, { force: true });
  else {
    writeFileSync(optionsFile, `${JSON.stringify(options, null, 2)}\n`, { mode: 0o600 });
    try {
      chmodSync(optionsFile, 0o600);
    } catch {
      // Windows: permissions are handled by the profile folder.
    }
  }
  writeSettings(where.settings, next, text);

  const lines = [
    `Claude Code now shows up on your vitrina on its own, in ${where.global ? 'every project on this machine' : 'this project'}.`,
    '',
    `  Watch      ${config.url}/v/${config.id}`,
    `  Runner     ${show(join(where.glimo, RUNNER))}`,
    `  Settings   ${show(where.settings)}`,
    `  Events     ${list(registeredEvents(next))}`,
    '',
    'What leaves this machine: the project folder name, the state and a generic phrase such as',
    '"Editing files". Never the prompt, a command, a path or the content of a file.',
  ];
  if (detail) {
    lines.push(
      'With --detail it also sends the tool name and up to 80 characters about what it is doing:',
      'a command, a file name, a search.',
    );
  }
  if (approve) {
    lines.push(
      '',
      'With --approve you can answer permission prompts from the vitrina, with Allow or Deny.',
      `Claude Code waits up to ${seconds} seconds for you there, then shows its usual prompt.`,
      'Anyone who has the key of this vitrina can answer too.',
    );
  }
  if (!where.global && text === null && gitWouldCommit(where.settings)) {
    lines.push(
      '',
      `${show(where.settings)} is new and git does not ignore it yet. Claude Code only takes`,
      'care of that for files it creates itself, so add it to your .gitignore.',
    );
  }
  const version = claudeVersion();
  if (version && tooOld(version)) {
    lines.push(
      '',
      `Your Claude Code is ${version.join('.')}. These hooks need ${MIN_CLAUDE_CODE.join('.')} or later:`,
      'update it, or they will not run.',
    );
  }
  lines.push(
    '',
    'Sessions that are already open normally pick this up on their own. /hooks in Claude Code',
    'shows what is registered.',
    `Undo it with "glimo hooks uninstall${where.global ? ' --global' : ''}".`,
  );
  out(lines.join('\n'));
}

function uninstall(flags, out, { findConfig }) {
  const where = locate(flags, findConfig);
  const { settings, text } = readSettings(where.settings);
  const next = withoutOurs(settings);
  const registered = registeredEvents(settings).length > 0;
  if (registered) {
    if (Object.keys(next).length === 0 && !where.global) {
      // Nothing else was in the project's local settings: leave no empty file behind.
      rmSync(where.settings, { force: true });
      try {
        rmdirSync(dirname(where.settings));
      } catch {
        // .claude holds other things: it stays.
      }
    } else {
      writeSettings(where.settings, next, text);
    }
  }
  const files = [RUNNER, OPTIONS].map((name) => join(where.glimo, name)).filter(existsSync);
  for (const file of files) rmSync(file, { force: true });
  try {
    // A .glimo folder that only held the runner goes away too.
    if (readdirSync(where.glimo).every((name) => name === '.gitignore')) {
      rmSync(where.glimo, { recursive: true, force: true });
    }
  } catch {
    // There was no .glimo folder.
  }
  if (!registered && files.length === 0) {
    out(`There were no Glimo hooks ${where.global ? 'in your user settings' : 'in this project'}.`);
    return;
  }
  out(
    `The Glimo hooks are gone from ${show(where.settings)}, and so is the runner.\n` +
      'Every other setting and hook is as it was. A session that is still open keeps its glim\n' +
      'until the vitrina expires or you run "glimo remove <agent>".',
  );
}

function status(flags, out, { findConfig, defaultUrl }) {
  const where = locate(flags, findConfig);
  const scope = where.global ? 'every project on this machine' : 'this project';
  const again = `glimo hooks install${where.global ? ' --global' : ''}`;
  const events = registeredEvents(readSettings(where.settings).settings);
  if (events.length === 0) {
    out(`No Glimo hooks for ${scope}. Run "${again}" to add them.`);
    return 2;
  }
  const runner = join(where.glimo, RUNNER);
  if (!existsSync(runner)) {
    out(
      `Claude Code is set to run ${show(runner)}, but that file is missing, so nothing is reported.\n` +
        `Run "${again}" again.`,
    );
    return 2;
  }
  // The same order the runner uses: environment, hook.json, config.json.
  const saved = {
    ...readJson(join(where.glimo, 'config.json')),
    ...readJson(join(where.glimo, OPTIONS)),
  };
  const id = process.env.GLIMO_VITRINA ?? saved.id;
  if (!id || !(process.env.GLIMO_KEY ?? saved.key)) {
    out(
      `The Glimo hooks are installed for ${scope}, but there is no vitrina to report to.\n` +
        `Run "glimo init" and then "${again}".`,
    );
    return 2;
  }
  const url = String(process.env.GLIMO_URL ?? saved.url ?? defaultUrl).replace(/\/$/, '');
  const name = process.env.GLIMO_AGENT_NAME ?? saved.name;
  const extras = [
    saved.detail === true ? 'detail (tool name and a short summary are sent)' : '',
    saved.approve === true
      ? `approve (waits ${saved.approveSeconds ?? DEFAULT_APPROVE_SECONDS} seconds for your answer)`
      : '',
    name ? `name "${name}"` : '',
  ].filter(Boolean);
  out(
    [
      `The Glimo hooks are installed for ${scope}.`,
      '',
      `  Watch      ${url}/v/${id}`,
      `  Runner     ${show(runner)}`,
      `  Settings   ${show(where.settings)}`,
      `  Events     ${list(events)}`,
      `  Options    ${extras.length > 0 ? extras.join(', ') : 'none: generic phrases only'}`,
    ].join('\n'),
  );
  return 0;
}

export function hooks(positional, flags, out, deps) {
  // "--global install" parses as global=install: put such strays back where they belong.
  const rest = [...positional];
  const options = { ...flags };
  for (const flag of ['global', 'approve', 'detail']) {
    if (typeof options[flag] === 'string') {
      rest.push(options[flag]);
      options[flag] = true;
    }
  }
  switch (rest[0]) {
    case 'install':
      return install(options, out, deps);
    case 'uninstall':
    case 'remove':
      return uninstall(options, out, deps);
    case 'status':
      return status(options, out, deps);
    default:
      throw new Error(USAGE);
  }
}
