// The vitrina: every agent on its shelf, and the panel that says who needs you with the
// action one tap away. Shared by the home demo, the playground and the live page.

import { Glim } from '@glimo/glim';
import { type GlimAction, type GlimoStatus, STATE_LABEL } from '@glimo/spec';
import { memo, type ReactNode, useEffect, useState } from 'react';
import { sentence, useCopy, useLocale } from '../lib/i18n';

export type World = 'office' | 'garden' | 'orbit';

interface VitrinaProps {
  agents: readonly GlimoStatus[];
  world?: World;
  selectedId: string | null;
  onSelect: (id: string) => void;
  glimSize?: number;
  variant?: 'hero' | 'app';
  label: string;
  /** Title row. */
  head?: ReactNode;
  /** What goes under the shelves (the panel). */
  children?: ReactNode;
  dense?: boolean;
}

export function Vitrina({
  agents,
  world = 'office',
  selectedId,
  onSelect,
  glimSize = 84,
  variant,
  label,
  head,
  children,
  dense,
}: VitrinaProps) {
  const copy = useCopy();
  return (
    <section
      className={[
        'vitrina',
        variant === 'hero' ? 'vitrina--hero' : '',
        world === 'orbit' ? 'glim-on-dark' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-world={world}
      aria-label={label}
    >
      {head}
      {agents.length === 0 ? (
        <p className="vitrina__empty">{copy.vitrina.empty}</p>
      ) : (
        <ul className={dense ? 'vitrina__grid vitrina__grid--dense' : 'vitrina__grid'}>
          {agents.map((agent) => (
            <Cell
              key={agent.agent.id}
              agent={agent}
              size={glimSize}
              selected={agent.agent.id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
      {children}
    </section>
  );
}

/** Memoised: when one agent changes, only its own glim renders again. */
const Cell = memo(function Cell({
  agent,
  size,
  selected,
  onSelect,
}: {
  agent: GlimoStatus;
  size: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const locale = useLocale();
  return (
    <li className="vitrina__cell">
      <button
        type="button"
        className="vitrina__agent"
        aria-pressed={selected}
        onClick={() => onSelect(agent.agent.id)}
      >
        <Glim state={agent.state} size={size} seed={agent.agent.id} locale={locale} alt="" />
        <span className="vitrina__name">{agent.agent.name}</span>
        <span className="vitrina__word">{STATE_LABEL[locale][agent.state]}</span>
      </button>
    </li>
  );
});

type Sent = { ok: boolean; text: string } | null;

/**
 * Who needs you and what you can do about it. Sensitive actions always ask for
 * confirmation; the interface never offers an action the agent did not declare.
 */
export function AgentPanel({
  agent,
  canAct,
  onAct,
  variant = 'bar',
}: {
  agent: GlimoStatus | undefined;
  canAct: boolean;
  onAct: (agent: GlimoStatus, action: GlimAction) => Promise<boolean> | boolean;
  variant?: 'bar' | 'sheet';
}) {
  const copy = useCopy();
  const locale = useLocale();
  const [confirming, setConfirming] = useState<GlimAction | null>(null);
  const [sent, setSent] = useState<Sent>(null);
  const [busy, setBusy] = useState(false);
  const agentId = agent?.agent.id;
  const state = agent?.state;

  // A new agent or a new state: whatever was pending no longer applies.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on identity change only
  useEffect(() => {
    setConfirming(null);
    setSent(null);
  }, [agentId, state]);

  if (!agent) {
    return variant === 'bar' ? (
      <div className="ask">
        <p className="ask__text">{copy.vitrina.selectHint}</p>
      </div>
    ) : null;
  }

  const actions = agent.actions ?? [];
  const run = async (action: GlimAction) => {
    if (action.sensitive && confirming?.id !== action.id) {
      setConfirming(action);
      setSent(null);
      return;
    }
    setConfirming(null);
    setBusy(true);
    let ok = false;
    try {
      ok = await onAct(agent, action);
    } catch {
      ok = false;
    }
    setBusy(false);
    setSent({
      ok,
      text: ok
        ? copy.vitrina.sent.replace('{action}', action.label).replace('{name}', agent.agent.name)
        : copy.vitrina.failed,
    });
  };

  const title = sentence(locale, agent.agent.name, agent.state);
  const buttons = confirming ? (
    <>
      <button
        type="button"
        className="btn btn--yellow"
        disabled={busy}
        onClick={() => run(confirming)}
      >
        {copy.vitrina.confirmCta}: {confirming.label}
      </button>
      <button type="button" className="btn btn--line" onClick={() => setConfirming(null)}>
        {copy.vitrina.cancel}
      </button>
    </>
  ) : (
    actions.map((action, index) => (
      <button
        key={action.id}
        type="button"
        className={
          (action.kind ?? (index === 0 ? 'primary' : 'secondary')) === 'primary'
            ? variant === 'bar'
              ? 'btn btn--yellow'
              : 'btn btn--primary'
            : 'btn btn--line'
        }
        disabled={!canAct || busy}
        onClick={() => run(action)}
      >
        {action.label}
      </button>
    ))
  );

  const status = confirming
    ? copy.vitrina.confirm
    : sent
      ? sent.text
      : actions.length > 0 && !canAct
        ? copy.vitrina.readOnly
        : actions.length === 0 && !agent.say
          ? copy.vitrina.nothing
          : '';

  if (variant === 'sheet') {
    return (
      <section className="sheet" aria-live="polite">
        <div className="sheet__head">
          <Glim state={agent.state} size={40} badge={false} seed={agent.agent.id} alt="" />
          <h2>{title}</h2>
        </div>
        <p>{agent.say ?? copy.vitrina.nothing}</p>
        {(actions.length > 0 || confirming) && <div className="sheet__actions">{buttons}</div>}
        {status && <p className={confirming ? 'confirm' : undefined}>{status}</p>}
      </section>
    );
  }

  return (
    <div className="ask on-dark" aria-live="polite">
      <p className="ask__text">
        <strong>{title}</strong> {agent.say}
      </p>
      {(actions.length > 0 || confirming) && <div className="ask__actions">{buttons}</div>}
      {status && <p className="ask__status">{status}</p>}
    </div>
  );
}
