// Home A, "The vitrina" (design/canvas/HomeA.dc.html), English first.

import { Glim } from '@glimo/glim';
import {
  type GlimAction,
  type GlimoStatus,
  type GlimState,
  STATE_LABEL,
  STATES,
  sortByUrgency,
} from '@glimo/spec';
import { useEffect, useState } from 'react';
import catalog from '../../../../skills/catalog.json';
import { Command, CopyButton, Icon, Link } from '../components/ui';
import { AgentPanel, Vitrina } from '../components/Vitrina';
import { localePath, useCopy, useLocale } from '../lib/i18n';
import { CREATE_COMMAND, SITE, skillInstallCommand } from '../lib/site';
import { useDemoVitrina } from '../lib/useDemoVitrina';

interface Skill {
  slug: string;
  name: string;
  nameEs: string;
  summary: string;
  summaryEs: string;
  needs: string;
  needsEs: string;
  icon: string;
}

const MCP_CLIENTS = ['Claude Code', 'Codex', 'Cursor', 'Gemini CLI', 'OpenCode', 'curl'];

export default function Home() {
  const copy = useCopy();
  const locale = useLocale();
  return (
    <main id="main" tabIndex={-1}>
      <section className="hero on-dark">
        <div className="wrap hero__row">
          <div className="hero__copy">
            <h1>{copy.hero.title}</h1>
            <p className="hero__lead">{copy.hero.lead}</p>
            <div className="hero__cta">
              <Link
                href={localePath(locale, '/playground#live')}
                className="btn btn--yellow btn--big"
              >
                {copy.hero.open}
              </Link>
            </div>
            <Command command={CREATE_COMMAND} />
            <p className="hero__note">
              {copy.hero.note} <a href={SITE.repoUrl}>{copy.hero.github}</a>
            </p>
          </div>
          <div className="hero__stage">
            <DemoVitrina />
          </div>
        </div>
      </section>

      <section className="section section--tight">
        <div className="wrap">
          <div className="section__head">
            <h2>{copy.states.title}</h2>
            <p>{copy.states.lead}</p>
          </div>
          <ul className="states">
            {STATES.map((state) => (
              <li key={state}>
                <div className="state-card">
                  <Glim state={state} size={72} seed={`state-${state}`} alt="" />
                  <span className="state-card__name">{STATE_LABEL[locale][state]}</span>
                  <span className="state-card__when">{copy.states.when[state]}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section" id="steps">
        <div className="wrap">
          <div className="section__head">
            <h2>{copy.steps.title}</h2>
          </div>
          <ol className="steps">
            <li>
              <div className="step">
                <span className="step__n" aria-hidden="true">
                  1
                </span>
                <h3>{copy.steps.one.title}</h3>
                <p>{copy.steps.one.body}</p>
                <pre className="code">
                  {'claude mcp add \\\n  --transport http glimo \\\n  '}
                  {SITE.origin}
                  {'/mcp/<vitrina>\n'}
                  <span className="dim">{copy.steps.one.note}</span>
                </pre>
              </div>
            </li>
            <li>
              <div className="step">
                <span className="step__n" aria-hidden="true">
                  2
                </span>
                <h3>{copy.steps.two.title}</h3>
                <p>{copy.steps.two.body}</p>
                <div className="mini-worlds">
                  <MiniWorld state="working" name={copy.worlds.office} bg="#EEF0FB" />
                  <MiniWorld state="done" name={copy.worlds.garden} bg="#DDF3E4" />
                  <MiniWorld state="thinking" name={copy.worlds.orbit} bg="#1C1F5C" dark />
                </div>
              </div>
            </li>
            <li>
              <div className="step">
                <span className="step__n" aria-hidden="true">
                  3
                </span>
                <h3>{copy.steps.three.title}</h3>
                <p>{copy.steps.three.body}</p>
                <pre className="code">
                  {`npx skills add ${SITE.repo}\n`}
                  <span className="dim">{copy.steps.three.note}</span>
                </pre>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <SkillsSection />

      <section className="spec on-dark" id="spec">
        <div className="wrap spec__row">
          <div className="spec__copy">
            <h2 className="h2">{copy.spec.title}</h2>
            <p>{copy.spec.lead}</p>
            <ul>
              {copy.spec.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <p>
              <a className="more" href={SITE.specUrl}>
                {copy.spec.read}
              </a>
              {' · '}
              <a className="more" href="/spec/v0.1/glimo-spec.schema.json">
                {copy.spec.schema}
              </a>
            </p>
          </div>
          <div className="spec__file">
            <div className="spec__file-head">
              <Glim state="waiting" size={60} seed="spec" alt="" />
              <span>sales.glimo.json</span>
            </div>
            <SpecSample say={copy.spec.say} approve={copy.spec.approve} />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section__head">
            <h2>{copy.principles.title}</h2>
          </div>
          <ul className="principles">
            {copy.principles.items.map((item) => (
              <li key={item.title}>
                <div className="principle">
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
          <ul className="chips" aria-label={copy.principles.worksWith}>
            {MCP_CLIENTS.map((client) => (
              <li key={client}>{client}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="final on-dark" id="start">
        <div className="wrap final__col">
          <div className="final__glims">
            {(['done', 'working', 'waiting', 'thinking', 'idle'] as GlimState[]).map((state) => (
              <Glim
                key={state}
                state={state}
                size={64}
                badge={false}
                seed={`final-${state}`}
                alt=""
              />
            ))}
          </div>
          <h2>{copy.final.title}</h2>
          <Link href={localePath(locale, '/playground#live')} className="btn btn--yellow btn--big">
            {copy.hero.open}
          </Link>
          <Command command={CREATE_COMMAND} />
          <p>{copy.final.note}</p>
        </div>
      </section>
    </main>
  );
}

/** The living example: a scripted team, and it reacts when you decide. */
function DemoVitrina() {
  const copy = useCopy();
  const locale = useLocale();
  const { agents, playing, setPlaying, decide, stage } = useDemoVitrina(locale);
  const [selected, setSelected] = useState<string | null>(null);
  const current = agents.find((agent) => agent.agent.id === selected) ?? sortByUrgency(agents)[0];
  const waiting = agents.filter((agent) => agent.state === 'waiting').length;

  const onAct = (agent: GlimoStatus, action: GlimAction) => {
    decide(agent.agent.id, action.id);
    return true;
  };

  return (
    <div ref={stage}>
      <Vitrina
        agents={agents}
        selectedId={current?.agent.id ?? null}
        onSelect={setSelected}
        variant="hero"
        label={copy.hero.vitrinaLabel}
        head={
          <div className="vitrina__head">
            <span className="vitrina__title">{copy.hero.vitrinaTitle}</span>
            <span className="vitrina__meta">
              <span>
                {copy.vitrina.agents(agents.length)}
                {waiting > 0 ? `, ${copy.vitrina.waiting(waiting)}` : ''}
              </span>
              <button
                type="button"
                className="icon-btn"
                aria-pressed={!playing}
                onClick={() => setPlaying(!playing)}
              >
                <Icon name={playing ? 'pause' : 'play'} size={16} />
                {playing ? copy.hero.pause : copy.hero.play}
              </button>
            </span>
          </div>
        }
      >
        <AgentPanel agent={current} canAct onAct={onAct} />
      </Vitrina>
    </div>
  );
}

function MiniWorld({
  state,
  name,
  bg,
  dark,
}: {
  state: GlimState;
  name: string;
  bg: string;
  dark?: boolean;
}) {
  return (
    <div
      className={dark ? 'mini-world glim-on-dark' : 'mini-world'}
      style={{ background: bg, color: dark ? '#FFFFFF' : undefined }}
    >
      <Glim state={state} size={40} badge={false} seed={`world-${name}`} alt="" />
      <span>{name}</span>
    </div>
  );
}

function SpecSample({ say, approve }: { say: string; approve: string }) {
  const k = (text: string) => <span className="k">"{text}"</span>;
  const v = (text: string) => <span className="s">"{text}"</span>;
  return (
    <pre className="code">
      {'{\n  '}
      {k('spec')}: {v('glimo/0.1')}
      {',\n  '}
      {k('agent')}: {'{ '}
      {k('id')}: {v('sales')}, {k('name')}: {v('Sales')}
      {' },\n  '}
      {k('state')}: {v('waiting')}
      {',\n  '}
      {k('reason')}: {v('awaiting-approval')}
      {',\n  '}
      {k('say')}: {v(say)}
      {',\n  '}
      {k('actions')}: {'[{\n    '}
      {k('id')}: {v('approve')}
      {',\n    '}
      {k('label')}: {v(approve)}
      {',\n    '}
      {k('sensitive')}: <span className="s">true</span>
      {'\n  }]\n}'}
    </pre>
  );
}

/**
 * Skills: painted at once from the catalog bundled with the page, then refreshed from
 * the API (D1 behind an edge cache) so new skills show up without a new build.
 */
function SkillsSection() {
  const copy = useCopy();
  const locale = useLocale();
  const [skills, setSkills] = useState<Skill[]>(catalog as Skill[]);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = () =>
      fetch('/api/skills', { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { skills?: Skill[] } | null) => {
          if (body?.skills?.length) setSkills(body.skills);
        })
        .catch(() => undefined);
    // After the page is interactive: the catalog is already on screen.
    let idle: number | undefined;
    let timer: number | undefined;
    if (window.requestIdleCallback) idle = window.requestIdleCallback(() => void refresh());
    else timer = window.setTimeout(() => void refresh(), 1200);
    return () => {
      controller.abort();
      if (idle !== undefined) window.cancelIdleCallback(idle);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <section className="section" id="skills">
      <div className="wrap">
        <div className="section__head">
          <div>
            <h2>{copy.skills.title}</h2>
            <p style={{ marginTop: 12, maxWidth: 640 }}>{copy.skills.lead}</p>
          </div>
          <a className="more" href={SITE.skillsUrl}>
            {copy.skills.all}
          </a>
        </div>
        <ul className="skills">
          {skills.slice(0, 6).map((skill) => (
            <li key={skill.slug}>
              <article className="skill">
                <div className="skill__icon">
                  <Icon name={skill.icon} />
                </div>
                <div className="skill__body">
                  <h3>{locale === 'es' ? skill.nameEs : skill.name}</h3>
                  <p>{locale === 'es' ? skill.summaryEs : skill.summary}</p>
                  <div className="skill__foot">
                    <span className="skill__needs">
                      {copy.skills.needs}: {locale === 'es' ? skill.needsEs : skill.needs}
                    </span>
                    <CopyButton
                      text={skillInstallCommand(skill.slug)}
                      className="btn btn--line"
                      label={copy.skills.install}
                      done={copy.skills.copied}
                    />
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
