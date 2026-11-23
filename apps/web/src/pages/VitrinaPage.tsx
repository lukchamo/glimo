// /v/:id — the live vitrina, mobile first (design/canvas/App.dc.html).
// The address is a capability: whoever has it can watch. Deciding needs the key, which
// arrives once in the URL fragment (never sent to the server) and stays in this browser.

import { Glim } from '@glimo/glim';
import {
  type GlimAction,
  type GlimoStatus,
  sortByUrgency,
  summarize,
  urgencyOf,
} from '@glimo/spec';
import { useEffect, useMemo, useState } from 'react';
import { NotifyControl } from '../components/NotifyControl';
import { Link, Logo } from '../components/ui';
import { AgentPanel, Vitrina, type World } from '../components/Vitrina';
import { keyFor, rememberKey, sendAction } from '../lib/api';
import { localePath, sentence, useCopy, useLocale } from '../lib/i18n';
import { useLiveVitrina } from '../lib/useLiveVitrina';
import { callsYou, tabTitle } from '../lib/waiting';

const ID_PATTERN = /^v[0-9a-hjkmnp-tv-z]{24}$/;
const KEY_PATTERN = /^gk_[A-Za-z0-9_-]{43}$/;
const WORLDS: World[] = ['office', 'garden', 'orbit'];

function useWideScreen(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 560px)');
    const sync = () => setWide(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return wide;
}

export default function VitrinaPage({ path }: { path: string }) {
  const copy = useCopy();
  const locale = useLocale();
  const candidate = path.split('/')[2] ?? '';
  const id = ID_PATTERN.test(candidate) ? candidate : null;
  const [key, setKey] = useState<string | null>(null);
  const [world, setWorld] = useState<World>('office');
  const [selected, setSelected] = useState<string | null>(null);
  const wide = useWideScreen();
  const { agents, connection } = useLiveVitrina(id);

  // Take the key out of the address bar as soon as we have it.
  useEffect(() => {
    if (!id) return;
    const takeKey = () => {
      const fromHash = new URLSearchParams(location.hash.slice(1)).get('k');
      if (fromHash && KEY_PATTERN.test(fromHash)) {
        rememberKey(id, fromHash);
        history.replaceState(null, '', location.pathname);
      }
      setKey(keyFor(id));
    };
    takeKey();
    window.addEventListener('hashchange', takeKey);
    try {
      const saved = localStorage.getItem('glimo:world') as World | null;
      if (saved && WORLDS.includes(saved)) setWorld(saved);
    } catch {
      // No storage: the default world is fine.
    }
    return () => window.removeEventListener('hashchange', takeKey);
  }, [id]);

  const byUrgency = useMemo(() => sortByUrgency(agents), [agents]);
  const summary = useMemo(() => summarize(agents, locale), [agents, locale]);
  const current = agents.find((agent) => agent.agent.id === selected) ?? byUrgency[0];
  const needsYou = byUrgency.filter((agent) => urgencyOf(agent) !== 'low');

  // The tab title is a vitrina too: "(2) 2 agents are waiting for you". The number in
  // front is how many cannot go on without the person, readable in a narrow tab.
  const calling = agents.filter((agent) => callsYou(agent.state)).length;
  useEffect(() => {
    if (id && agents.length > 0) document.title = tabTitle(summary.headline, calling);
  }, [id, agents.length, summary.headline, calling]);

  const pickWorld = (next: World) => {
    setWorld(next);
    try {
      localStorage.setItem('glimo:world', next);
    } catch {
      // Not remembered, still applied.
    }
  };

  const onAct = async (agent: GlimoStatus, action: GlimAction) => {
    if (!id || !key) return false;
    await sendAction(id, key, {
      agentId: agent.agent.id,
      actionId: action.id,
      confirm: action.sensitive === true,
    });
    return true;
  };

  const missing = !id || connection === 'missing';

  return (
    <main id="main" className="app" tabIndex={-1}>
      <div className="app__top">
        <Logo tone="on-light" size={26} />
        {!missing && (
          <span className="live-dot" data-status={connection} role="status">
            {connection === 'live'
              ? copy.vitrina.live
              : connection === 'connecting'
                ? copy.vitrina.connecting
                : copy.vitrina.offline}
          </span>
        )}
      </div>

      {missing ? (
        <section className="sheet">
          <h1 style={{ fontSize: 22 }}>{id ? copy.vitrina.missing : copy.vitrina.noId}</h1>
          <div className="sheet__actions">
            <Link className="btn btn--primary" href={localePath(locale, '/playground#live')}>
              {copy.vitrina.missingCta}
            </Link>
          </div>
        </section>
      ) : (
        <>
          <div className="app__headline">
            <h1>{summary.headline}</h1>
            {summary.detail && <p>{summary.detail}</p>}
          </div>

          <NotifyControl key={id} id={id} />

          <fieldset className="field">
            <legend className="sr-only">{copy.worlds.label}</legend>
            <div className="worlds">
              {WORLDS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={world === option}
                  onClick={() => pickWorld(option)}
                >
                  {copy.worlds[option]}
                </button>
              ))}
            </div>
          </fieldset>

          <Vitrina
            agents={agents}
            world={world}
            selectedId={current?.agent.id ?? null}
            onSelect={setSelected}
            glimSize={wide ? 76 : 56}
            label={copy.hero.vitrinaTitle}
          />

          <AgentPanel agent={current} canAct={key !== null} onAct={onAct} variant="sheet" />

          {needsYou.length > 1 && (
            <section className="sheet" aria-label={copy.vitrina.rightNow}>
              <h2 style={{ fontSize: 15 }}>{copy.vitrina.rightNow}</h2>
              <div className="stack" style={{ gap: 4 }}>
                {needsYou.map((agent) => (
                  <button
                    key={agent.agent.id}
                    type="button"
                    className="vitrina__agent"
                    style={{
                      flexDirection: 'row',
                      gap: 10,
                      justifyContent: 'flex-start',
                      padding: 8,
                    }}
                    aria-pressed={agent.agent.id === current?.agent.id}
                    onClick={() => setSelected(agent.agent.id)}
                  >
                    <Glim state={agent.state} size={32} seed={agent.agent.id} alt="" />
                    <span style={{ textAlign: 'left', fontSize: 15 }}>
                      <strong>{sentence(locale, agent.agent.name, agent.state)}</strong> {agent.say}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
