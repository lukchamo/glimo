import type { GlimoStatus, GlimState, Urgency } from './types.js';

export type Locale = 'en' | 'es';

/** Canonical display order (lifecycle order, not urgency order). */
export const STATES: readonly GlimState[] = [
  'idle',
  'thinking',
  'working',
  'waiting',
  'blocked',
  'done',
  'tired',
  'sleeping',
];

export const STATE_LABEL: Record<Locale, Record<GlimState, string>> = {
  en: {
    idle: 'Ready',
    thinking: 'Thinking',
    working: 'Working',
    waiting: 'Waiting for you',
    blocked: 'Blocked',
    done: 'Done',
    tired: 'Out of energy',
    sleeping: 'Sleeping',
  },
  es: {
    idle: 'Listo',
    thinking: 'Pensando',
    working: 'Trabajando',
    waiting: 'Te espera',
    blocked: 'Bloqueado',
    done: 'Hecho',
    tired: 'Sin energía',
    sleeping: 'Durmiendo',
  },
};

export const STATE_COLOR: Record<GlimState, string> = {
  idle: '#FFFFFF',
  thinking: '#B9A6FF',
  working: '#FF8A3D',
  waiting: '#FFD43B',
  blocked: '#F0525A',
  done: '#5BC7F5',
  tired: '#8E93B5',
  sleeping: '#C9CDE3',
};

/** When several ASP values apply at once the highest priority wins (last wins). */
export const STATE_PRIORITY: readonly GlimState[] = [
  'sleeping',
  'idle',
  'done',
  'thinking',
  'working',
  'tired',
  'waiting',
  'blocked',
];

export function isGlimState(value: unknown): value is GlimState {
  return typeof value === 'string' && (STATES as readonly string[]).includes(value);
}

export function deriveUrgency(state: GlimState): Urgency {
  if (state === 'waiting' || state === 'blocked') return 'high';
  if (state === 'done' || state === 'tired') return 'mid';
  return 'low';
}

export function urgencyOf(status: Pick<GlimoStatus, 'state' | 'urgency'>): Urgency {
  return status.urgency ?? deriveUrgency(status.state);
}

const URGENCY_RANK: Record<Urgency, number> = { high: 0, mid: 1, low: 2 };

/** Order for the vitrina and "Right now": most urgent first, then most recent. */
export function sortByUrgency<T extends Pick<GlimoStatus, 'state' | 'urgency' | 'updatedAt'>>(
  list: readonly T[],
): T[] {
  return [...list].sort(
    (a, b) =>
      URGENCY_RANK[urgencyOf(a)] - URGENCY_RANK[urgencyOf(b)] ||
      b.updatedAt.localeCompare(a.updatedAt),
  );
}

export interface VitrinaSummary {
  /** "2 agents are waiting for you" */
  headline: string;
  /** "2 working, 1 blocked, 1 out of energy" */
  detail: string;
  counts: Record<GlimState, number>;
}

/** One-sentence summary of a vitrina, in the "teammate who lets you know" voice. */
export function summarize(
  list: readonly Pick<GlimoStatus, 'state'>[],
  locale: Locale = 'en',
): VitrinaSummary {
  const counts = Object.fromEntries(STATES.map((s) => [s, 0])) as Record<GlimState, number>;
  for (const item of list) counts[item.state] += 1;

  const es = locale === 'es';
  const waiting = counts.waiting;
  let headline: string;
  if (list.length === 0) {
    headline = es ? 'Tu vitrina está vacía' : 'Your vitrina is empty';
  } else if (waiting > 0) {
    headline = es
      ? waiting === 1
        ? '1 agente te espera'
        : `${waiting} agentes te esperan`
      : waiting === 1
        ? '1 agent is waiting for you'
        : `${waiting} agents are waiting for you`;
  } else if (counts.blocked > 0) {
    headline = es
      ? counts.blocked === 1
        ? '1 agente está bloqueado'
        : `${counts.blocked} agentes están bloqueados`
      : counts.blocked === 1
        ? '1 agent is blocked'
        : `${counts.blocked} agents are blocked`;
  } else {
    headline = es ? 'Nadie te necesita ahora' : 'Nobody needs you right now';
  }

  const parts: string[] = [];
  const add = (n: number, en: string, esWord: string) => {
    if (n > 0) parts.push(`${n} ${es ? esWord : en}`);
  };
  add(counts.working, 'working', 'trabajando');
  if (waiting > 0)
    add(counts.blocked, 'blocked', counts.blocked === 1 ? 'bloqueado' : 'bloqueados');
  add(counts.tired, 'out of energy', 'sin energía');
  add(counts.thinking, 'thinking', 'pensando');
  add(counts.done, 'done', counts.done === 1 ? 'hecho' : 'hechos');
  add(counts.sleeping, 'sleeping', 'durmiendo');
  add(counts.idle, 'ready', counts.idle === 1 ? 'listo' : 'listos');

  return { headline, detail: parts.join(', '), counts };
}
