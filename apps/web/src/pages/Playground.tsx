// /playground — the test bench: poke a glim, validate a status, run a live vitrina and
// feed it from a terminal or an MCP client, and see how many glims a device can animate.

import { Glim } from '@glimo/glim';
import {
  type GlimAction,
  type GlimoStatus,
  type GlimState,
  type LiveEvent,
  parseGlimoStatus,
  SPEC_VERSION,
  STATE_LABEL,
  STATES,
  sortByUrgency,
  type ValidationIssue,
} from '@glimo/spec';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NotifyControl } from '../components/NotifyControl';
import { Snippet } from '../components/ui';
import { AgentPanel, Vitrina, type World } from '../components/Vitrina';
import {
  ApiError,
  type CreatedVitrina,
  createVitrina,
  playgroundVitrina,
  pushStatus,
  rememberKey,
  rememberPlayground,
  sendAction,
} from '../lib/api';
import { DEMO_AFTER, DEMO_AGENTS, DEMO_SCRIPT, type DemoStatus, toStatus } from '../lib/demo';
import { useCopy, useLocale } from '../lib/i18n';
import { useLiveVitrina } from '../lib/useLiveVitrina';

const WORLDS: World[] = ['office', 'garden', 'orbit'];

export default function Playground() {
  const copy = useCopy();
  const p = copy.playground;
  return (
    <main id="main" tabIndex={-1}>
      <div className="wrap">
        <div className="page-head">
          <h1>{p.title}</h1>
          <p>{p.lead}</p>
        </div>
        <nav className="tabs" aria-label={p.title}>
          <a href="#lab">{p.tabs.lab}</a>
          <a href="#spec">{p.tabs.spec}</a>
          <a href="#live">{p.tabs.live}</a>
          <a href="#stress">{p.tabs.stress}</a>
        </nav>
        <Lab />
        <SpecEditor />
        <Live />
        <Stress />
      </div>
    </main>
  );
}

// ---------- 1. Glim lab ----------

function Lab() {
  const copy = useCopy();
  const locale = useLocale();
  const p = copy.playground.lab;
  const [state, setState] = useState<GlimState>('waiting');
  const [size, setSize] = useState(160);
  const [badge, setBadge] = useState(true);
  const [alive, setAlive] = useState(true);
  const [world, setWorld] = useState<World>('office');

  const usage = `import { Glim } from '@glimo/glim';
import '@glimo/glim/glim.css';

<Glim state="${state}" size={${size}}${badge ? '' : ' badge={false}'}${alive ? '' : ' alive={false}'} />`;

  return (
    <section className="panel" id="lab">
      <h2>{p.title}</h2>
      <p className="lead">{p.lead}</p>
      <div className="panel__grid">
        <div className={world === 'orbit' ? 'stage glim-on-dark' : 'stage'} data-world={world}>
          <Glim state={state} size={size} badge={badge} alive={alive} seed="lab" locale={locale} />
        </div>
        <div className="controls">
          <fieldset className="field">
            <legend>{p.state}</legend>
            <div className="seg">
              {STATES.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={state === option}
                  onClick={() => setState(option)}
                >
                  {STATE_LABEL[locale][option]}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="field">
            <label htmlFor="lab-size">
              {p.size}: {size} px
            </label>
            <input
              id="lab-size"
              type="range"
              min={16}
              max={220}
              value={size}
              onChange={(event) => setSize(Number(event.target.value))}
            />
          </div>
          <fieldset className="field">
            <legend>{copy.worlds.label}</legend>
            <div className="seg">
              {WORLDS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={world === option}
                  onClick={() => setWorld(option)}
                >
                  {copy.worlds[option]}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="row">
            <label className="check">
              <input type="checkbox" checked={badge} onChange={(e) => setBadge(e.target.checked)} />
              {p.signal}
            </label>
            <label className="check">
              <input type="checkbox" checked={alive} onChange={(e) => setAlive(e.target.checked)} />
              {p.alive}
            </label>
          </div>
          <Snippet title={p.usage} code={usage} />
        </div>
      </div>
    </section>
  );
}

// ---------- 2. Spec editor ----------

const PRESETS: { name: string; value: object }[] = [
  {
    name: 'waiting',
    value: {
      spec: SPEC_VERSION,
      agent: { id: 'sales', name: 'Sales' },
      state: 'waiting',
      reason: 'awaiting-approval',
      say: 'Wants to send 12 follow-up emails',
      actions: [
        { id: 'approve', label: 'Approve sending', kind: 'primary', sensitive: true },
        { id: 'open', label: 'Edit drafts', kind: 'secondary' },
      ],
      updatedAt: '2026-11-23T10:30:00Z',
    },
  },
  {
    name: 'blocked',
    value: {
      spec: SPEC_VERSION,
      agent: { id: 'data', name: 'Data' },
      state: 'blocked',
      reason: 'auth-error',
      say: 'Its database credential expired',
      actions: [
        { id: 'renew-access', label: 'Renew access', kind: 'primary', sensitive: true },
        { id: 'open', label: 'See the error', kind: 'secondary' },
      ],
      updatedAt: '2026-11-23T10:15:00Z',
    },
  },
  { name: 'minimal', value: { agent: { id: 'research', name: 'Research' }, state: 'thinking' } },
];

/**
 * An example as text. With `now`, its timestamp becomes a few minutes ago, so that
 * "waiting for 12 min" reads true whenever the page is opened.
 */
function exampleText(value: object, now?: number): string {
  const fresh =
    now !== undefined && 'updatedAt' in value
      ? { ...value, updatedAt: new Date(now - 12 * 60_000).toISOString().replace(/\.\d+Z$/, 'Z') }
      : value;
  return JSON.stringify(fresh, null, 2);
}
const FIRST_EXAMPLE = exampleText(PRESETS[0]?.value ?? {});

type Verdict =
  | { kind: 'ok'; status: GlimoStatus }
  | { kind: 'issues'; issues: ValidationIssue[] }
  | { kind: 'json' };

/** Same rules as the server: spec and updatedAt are filled in when missing. */
function validate(text: string): Verdict {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { kind: 'json' };
  }
  const input =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const parsed = parseGlimoStatus({
    ...input,
    spec: input.spec ?? SPEC_VERSION,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  });
  return parsed.ok
    ? { kind: 'ok', status: parsed.status }
    : { kind: 'issues', issues: parsed.issues };
}

function SpecEditor() {
  const copy = useCopy();
  const p = copy.playground.spec;
  const [text, setText] = useState(FIRST_EXAMPLE);
  const verdict = useMemo(() => validate(text), [text]);
  // The first paint is prerendered with a fixed time; once here, the example is recent.
  useEffect(() => {
    const first = PRESETS[0]?.value;
    if (first) {
      setText((current) => (current === FIRST_EXAMPLE ? exampleText(first, Date.now()) : current));
    }
  }, []);
  const [last, setLast] = useState<GlimoStatus | null>(null);
  useEffect(() => {
    if (verdict.kind === 'ok') setLast(verdict.status);
  }, [verdict]);
  const shown = verdict.kind === 'ok' ? verdict.status : last;

  return (
    <section className="panel" id="spec">
      <h2>{p.title}</h2>
      <p className="lead">{p.lead}</p>
      <div className="panel__grid">
        <div className="stack">
          <fieldset className="field">
            <legend>{p.presets}</legend>
            <div className="seg">
              {PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => setText(exampleText(preset.value, Date.now()))}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="field">
            <label htmlFor="spec-json">{p.label}</label>
            <textarea
              id="spec-json"
              className="editor"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
        </div>
        <div className="stack" aria-live="polite">
          {verdict.kind === 'ok' ? (
            <p className="verdict verdict--ok">{p.valid}</p>
          ) : (
            <div className="verdict verdict--bad">
              <div>
                {verdict.kind === 'json' ? p.notJson : p.invalid}
                {verdict.kind === 'issues' && (
                  <ul>
                    {verdict.issues.map((issue) => (
                      <li key={`${issue.path}:${issue.message}`}>
                        <code>{issue.path || 'status'}</code>: {issue.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          {shown && (
            <Vitrina
              agents={[shown]}
              selectedId={shown.agent.id}
              onSelect={() => undefined}
              glimSize={96}
              label={p.title}
            >
              <AgentPanel agent={shown} canAct onAct={() => true} />
            </Vitrina>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------- 3. Live vitrina ----------

function Live() {
  const copy = useCopy();
  const locale = useLocale();
  const p = copy.playground.live;
  const [vitrina, setVitrina] = useState<CreatedVitrina | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const sentAt = useRef<number | null>(null);

  useEffect(() => setVitrina(playgroundVitrina()), []);

  // From the request leaving this browser to the change arriving on the live channel.
  const onEvent = useCallback((event: LiveEvent) => {
    if (event.t === 'upsert' && sentAt.current !== null) {
      setLatency(Math.round(performance.now() - sentAt.current));
      sentAt.current = null;
    }
  }, []);
  const { agents, connection } = useLiveVitrina(vitrina?.id ?? null, onEvent);

  const push = useCallback(
    async (status: GlimoStatus) => {
      if (!vitrina) return;
      sentAt.current = performance.now();
      await pushStatus(vitrina.id, vitrina.key, status).catch(() => {
        sentAt.current = null;
      });
    },
    [vitrina],
  );

  const create = async () => {
    setCreating(true);
    setError(null);
    setSimulating(false);
    try {
      const created = await createVitrina();
      rememberPlayground(created);
      rememberKey(created.id, created.key);
      setVitrina(created);
      setLatency(null);
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 429 ? p.limited : p.failed);
    }
    setCreating(false);
  };

  // A simulated team: the same script as the home demo, but through the real API.
  useEffect(() => {
    if (!simulating || !vitrina) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      for (const agent of DEMO_AGENTS) {
        if (stopped) return;
        await push(toStatus(agent, agent.initial, locale, new Date().toISOString()));
      }
      let step = 0;
      const next = () => {
        timer = setTimeout(async () => {
          if (stopped) return;
          if (!document.hidden) {
            const [, agentId, status] = DEMO_SCRIPT[step % DEMO_SCRIPT.length] as [
              number,
              string,
              DemoStatus,
            ];
            const agent = DEMO_AGENTS.find((a) => a.id === agentId);
            if (agent) await push(toStatus(agent, status, locale, new Date().toISOString()));
            step += 1;
          }
          next();
        }, 2200);
      };
      next();
    };
    void run();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [simulating, vitrina, locale, push]);

  const onAct = async (agent: GlimoStatus, action: GlimAction) => {
    if (!vitrina) return false;
    await sendAction(vitrina.id, vitrina.key, {
      agentId: agent.agent.id,
      actionId: action.id,
      confirm: action.sensitive === true,
    });
    // The simulated agent reacts the way a real one would after collecting the decision.
    const after = DEMO_AFTER[`${agent.agent.id}:${action.id}`];
    const demo = DEMO_AGENTS.find((a) => a.id === agent.agent.id);
    if (simulating && after && demo) {
      void fetch(`/api/vitrinas/${vitrina.id}/actions?agent=${demo.id}`, {
        headers: { authorization: `Bearer ${vitrina.key}` },
      });
      void push(toStatus(demo, after[0], locale, new Date().toISOString()));
      setTimeout(() => void push(toStatus(demo, after[1], locale, new Date().toISOString())), 2800);
    }
    return true;
  };

  const current = agents.find((a) => a.agent.id === selected) ?? sortByUrgency(agents)[0];
  const origin = typeof location === 'undefined' ? '' : location.origin;
  const view = vitrina ? `${origin}/v/${vitrina.id}` : '';
  const curl = vitrina
    ? `curl -X POST ${origin}/api/vitrinas/${vitrina.id}/status \\
  -H "Authorization: Bearer ${vitrina.key}" \\
  -H "Content-Type: application/json" \\
  -d '{"agent":{"id":"sales","name":"Sales"},"state":"waiting","say":"Wants to send 12 emails","actions":[{"id":"approve","label":"Approve sending","sensitive":true}]}'`
    : '';
  const mcp = vitrina
    ? `claude mcp add --transport http glimo ${origin}/mcp/${vitrina.id} \\
  --header "Authorization: Bearer ${vitrina.key}"`
    : '';
  const mcpJson = vitrina
    ? JSON.stringify(
        {
          mcpServers: {
            glimo: {
              type: 'http',
              url: `${origin}/mcp/${vitrina.id}`,
              headers: { Authorization: `Bearer ${vitrina.key}` },
            },
          },
        },
        null,
        2,
      )
    : '';

  return (
    <section className="panel" id="live">
      <h2>{p.title}</h2>
      <p className="lead">{p.lead}</p>

      {!vitrina ? (
        <div className="stack">
          <div className="row">
            <button
              type="button"
              className="btn btn--primary btn--big"
              disabled={creating}
              onClick={create}
            >
              {creating ? p.creating : p.create}
            </button>
          </div>
          {error && <p className="verdict verdict--bad">{error}</p>}
          <p className="note">{p.expires}</p>
        </div>
      ) : (
        <div className="panel__grid">
          <div className="stack">
            <Vitrina
              agents={agents}
              selectedId={current?.agent.id ?? null}
              onSelect={setSelected}
              glimSize={64}
              label={p.title}
              head={
                <div className="vitrina__head">
                  <span className="vitrina__title">{copy.hero.vitrinaTitle}</span>
                  <span className="live-dot" data-status={connection} role="status">
                    {connection === 'live'
                      ? copy.vitrina.live
                      : connection === 'connecting'
                        ? copy.vitrina.connecting
                        : copy.vitrina.offline}
                  </span>
                </div>
              }
            >
              {agents.length > 0 && <AgentPanel agent={current} canAct onAct={onAct} />}
            </Vitrina>
            <div className="row">
              <button
                type="button"
                className={simulating ? 'btn btn--line' : 'btn btn--primary'}
                onClick={() => setSimulating(!simulating)}
              >
                {simulating ? p.stop : p.simulate}
              </button>
              <a
                className="btn btn--line"
                href={`${view}#k=${vitrina.key}`}
                target="_blank"
                rel="noopener"
              >
                {p.open}
              </a>
              <button type="button" className="btn btn--line" disabled={creating} onClick={create}>
                {p.again}
              </button>
            </div>
            <NotifyControl key={vitrina.id} id={vitrina.id} />
            {error && <p className="verdict verdict--bad">{error}</p>}
            <div className="meter" aria-live="polite">
              <div>
                <strong>{latency === null ? '—' : `${latency} ms`}</strong>
                <span>
                  {p.latency}, {p.latencyHint}
                </span>
              </div>
            </div>
          </div>
          <div className="stack">
            <dl className="kv">
              <dt>{p.view}</dt>
              <dd>
                <a href={view} target="_blank" rel="noopener">
                  {view}
                </a>
              </dd>
              <dt>{p.key}</dt>
              <dd>{vitrina.key}</dd>
            </dl>
            <p className="note">
              {p.keyNote} {p.expires}
            </p>
            <Snippet title={p.curl} code={curl} />
            <Snippet title={p.mcp} code={mcp} />
            <Snippet title={p.mcpJson} code={mcpJson} />
          </div>
        </div>
      )}
    </section>
  );
}

// ---------- 4. Stress test ----------

function Stress() {
  const copy = useCopy();
  const p = copy.playground.stress;
  const [count, setCount] = useState(60);
  const [running, setRunning] = useState(false);
  const [states, setStates] = useState<GlimState[]>([]);
  const [fps, setFps] = useState<number | null>(null);
  const [slowest, setSlowest] = useState<number | null>(null);

  useEffect(() => {
    if (!running) {
      setStates([]);
      return;
    }
    setStates(Array.from({ length: count }, (_, i) => STATES[i % STATES.length] as GlimState));
    // A tenth of the crowd changes state every two seconds.
    const churn = setInterval(() => {
      if (document.hidden) return;
      setStates((previous) => {
        const next = [...previous];
        for (let i = 0; i < Math.max(1, Math.round(next.length / 10)); i++) {
          const index = Math.floor(Math.random() * next.length);
          next[index] = STATES[Math.floor(Math.random() * STATES.length)] as GlimState;
        }
        return next;
      });
    }, 2000);

    // Frame meter: only runs while the test runs.
    let frame = 0;
    let last = performance.now();
    let windowStart = last;
    let frames = 0;
    let worst = 0;
    const tick = (now: number) => {
      frames += 1;
      worst = Math.max(worst, now - last);
      last = now;
      if (now - windowStart >= 1000) {
        setFps(Math.round((frames * 1000) / (now - windowStart)));
        setSlowest(Math.round(worst));
        frames = 0;
        worst = 0;
        windowStart = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      clearInterval(churn);
      cancelAnimationFrame(frame);
      setFps(null);
      setSlowest(null);
    };
  }, [running, count]);

  return (
    <section className="panel" id="stress">
      <h2>{p.title}</h2>
      <p className="lead">{p.lead}</p>
      <div className="stack">
        <div className="row">
          <div className="field" style={{ flex: '1 1 260px' }}>
            <label htmlFor="stress-count">
              {p.count}: {count}
            </label>
            <input
              id="stress-count"
              type="range"
              min={9}
              max={400}
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
            />
          </div>
          <button
            type="button"
            className={running ? 'btn btn--line' : 'btn btn--primary'}
            onClick={() => setRunning(!running)}
          >
            {running ? p.stop : p.run}
          </button>
        </div>
        <div className="meter" aria-live="off">
          <div>
            <strong>{fps ?? '—'}</strong>
            <span>{p.fps}</span>
          </div>
          <div>
            <strong>{slowest === null ? '—' : `${slowest} ms`}</strong>
            <span>{p.slow}</span>
          </div>
        </div>
        {running && (
          <div className="crowd">
            {states.map((state, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed positions, identity is the slot
              <Glim key={index} state={state} size={40} seed={`crowd-${index}`} alt="" />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
