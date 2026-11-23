import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyLiveEvent,
  createStatus,
  deriveUrgency,
  EMPTY_VITRINA,
  fromASP,
  type GlimoStatus,
  LIMITS,
  parseGlimoStatus,
  redactSensitive,
  STATE_LABEL,
  STATES,
  sortByUrgency,
  summarize,
} from '../src/index.js';

const SPEC_DIR = join(import.meta.dirname, '../../../spec');
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as unknown;

const base: GlimoStatus = {
  spec: 'glimo/0.1',
  agent: { id: 'sales', name: 'Sales' },
  state: 'working',
  updatedAt: '2026-11-23T10:00:00Z',
};

describe('examples in spec/', () => {
  const files = readdirSync(join(SPEC_DIR, 'examples')).filter((f) => f.endsWith('.glimo.json'));

  it('ships at least two agent examples', () => {
    expect(files.length).toBeGreaterThanOrEqual(2);
  });

  it.each(files)('%s is a valid Glimo Spec status', (file) => {
    const result = parseGlimoStatus(readJson(join(SPEC_DIR, 'examples', file)));
    expect(result).toMatchObject({ ok: true });
  });

  it('the package copy of the schema matches the source of truth', () => {
    expect(readJson(join(import.meta.dirname, '../schema.json'))).toEqual(
      readJson(join(SPEC_DIR, 'glimo-spec.schema.json')),
    );
  });
});

describe('parseGlimoStatus', () => {
  it('accepts the minimal status', () => {
    expect(parseGlimoStatus(base)).toEqual({ ok: true, status: base });
  });

  it('drops unknown fields instead of failing', () => {
    const result = parseGlimoStatus({ ...base, future: { x: 1 }, __proto__: { polluted: true } });
    expect(result.ok && 'future' in result.status).toBe(false);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it.each([
    ['wrong spec version', { ...base, spec: 'glimo/9' }, 'spec'],
    ['unknown state', { ...base, state: 'dancing' }, 'state'],
    ['uppercase agent id', { ...base, agent: { id: 'Sales', name: 'Sales' } }, 'agent.id'],
    ['empty name', { ...base, agent: { id: 'sales', name: ' ' } }, 'agent.name'],
    ['say too long', { ...base, say: 'x'.repeat(LIMITS.say + 1) }, 'say'],
    ['bad date', { ...base, updatedAt: 'yesterday' }, 'updatedAt'],
    [
      'too many actions',
      { ...base, actions: Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, label: 'Go' })) },
      'actions',
    ],
    [
      'action id with markup',
      { ...base, actions: [{ id: '<script>', label: 'Go' }] },
      'actions.0.id',
    ],
  ])('rejects %s', (_name, input, path) => {
    const result = parseGlimoStatus(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((i) => i.path)).toContain(path);
  });

  it.each([null, undefined, 42, 'text', []])('rejects non-object input %j', (input) => {
    expect(parseGlimoStatus(input).ok).toBe(false);
  });
});

describe('states', () => {
  it('has a label in every locale for every state', () => {
    for (const locale of ['en', 'es'] as const) {
      for (const state of STATES) expect(STATE_LABEL[locale][state]).toBeTruthy();
    }
  });

  it('derives urgency from the state', () => {
    expect(STATES.map(deriveUrgency)).toEqual([
      'low',
      'low',
      'low',
      'high',
      'high',
      'mid',
      'mid',
      'low',
    ]);
  });

  it('sorts urgent first, then most recent', () => {
    const at = (id: string, state: GlimoStatus['state'], minute: number): GlimoStatus => ({
      ...base,
      agent: { id, name: id },
      state,
      updatedAt: `2026-11-23T10:${String(minute).padStart(2, '0')}:00Z`,
    });
    const sorted = sortByUrgency([
      at('a', 'working', 5),
      at('b', 'done', 1),
      at('c', 'blocked', 2),
      at('d', 'waiting', 9),
      at('e', 'sleeping', 8),
    ]);
    expect(sorted.map((s) => s.agent.id)).toEqual(['d', 'c', 'b', 'e', 'a']);
  });

  it('an explicit urgency overrides the derived one', () => {
    const urgent = { ...base, agent: { id: 'x', name: 'X' }, urgency: 'high' as const };
    expect(sortByUrgency([{ ...base, state: 'done' }, urgent])[0]).toBe(urgent);
  });

  it('summarizes a vitrina in one sentence', () => {
    const list = (['waiting', 'waiting', 'working', 'working', 'blocked', 'tired'] as const).map(
      (state) => ({ state }),
    );
    expect(summarize(list, 'en')).toMatchObject({
      headline: '2 agents are waiting for you',
      detail: '2 working, 1 blocked, 1 out of energy',
    });
    expect(summarize(list, 'es')).toMatchObject({
      headline: '2 agentes te esperan',
      detail: '2 trabajando, 1 bloqueado, 1 sin energía',
    });
    expect(summarize([{ state: 'working' }]).headline).toBe('Nobody needs you right now');
    expect(summarize([]).headline).toBe('Your vitrina is empty');
  });
});

describe('fromASP', () => {
  it('maps single values', () => {
    expect(fromASP(['awaiting-approval'])).toEqual({
      state: 'waiting',
      reason: 'awaiting-approval',
    });
    expect(fromASP(['completed'])).toEqual({ state: 'done', reason: 'completed' });
    expect(fromASP(['offline'])).toEqual({ state: 'sleeping', reason: 'offline' });
  });

  it('the highest priority wins: blocked > waiting > tired > working > thinking > done', () => {
    expect(fromASP(['working', 'rate-limited', 'input-required']).state).toBe('waiting');
    expect(fromASP(['completed', 'queued', 'busy', 'auth-error']).state).toBe('blocked');
    expect(fromASP(['busy', 'quota-exhausted']).state).toBe('tired');
  });

  it('ignores unknown values and prototype keys', () => {
    expect(fromASP([])).toEqual({ state: 'idle' });
    expect(fromASP(['constructor', 'toString', 'nope'])).toEqual({ state: 'idle' });
  });
});

describe('privacy', () => {
  it('redactSensitive removes pov and thoughts and reports it', () => {
    const full: GlimoStatus = {
      ...base,
      pov: { app: 'Mail', focus: 'Draft for Hotel Azahar' },
      thoughts: [{ at: base.updatedAt, text: 'I will not send anything without approval.' }],
    };
    const { status, dropped } = redactSensitive(full);
    expect(dropped).toEqual(['pov', 'thoughts']);
    expect(status).toEqual(base);
    expect(full.pov).toBeDefined();
  });

  it('returns the same object when there is nothing to drop', () => {
    expect(redactSensitive(base)).toEqual({ status: base, dropped: [] });
  });
});

describe('live channel reducer', () => {
  const other: GlimoStatus = { ...base, agent: { id: 'data', name: 'Data' }, state: 'blocked' };

  it('applies snapshot, upsert and remove', () => {
    let state = applyLiveEvent(EMPTY_VITRINA, { t: 'snapshot', seq: 3, agents: [base] });
    state = applyLiveEvent(state, { t: 'upsert', seq: 4, agent: other });
    expect(Object.keys(state.agents)).toEqual(['sales', 'data']);
    state = applyLiveEvent(state, { t: 'remove', seq: 5, id: 'sales' });
    expect(state).toEqual({ seq: 5, agents: { data: other } });
  });

  it('ignores stale events and keeps identity for unchanged glims', () => {
    const state = applyLiveEvent(EMPTY_VITRINA, { t: 'snapshot', seq: 10, agents: [base] });
    expect(applyLiveEvent(state, { t: 'upsert', seq: 9, agent: other })).toBe(state);
    const again = applyLiveEvent(state, { t: 'snapshot', seq: 11, agents: [{ ...base }] });
    expect(again.agents.sales).toBe(state.agents.sales);
  });
});

describe('createStatus', () => {
  it('fills spec and updatedAt', () => {
    const status = createStatus({ agent: { id: 'sales', name: 'Sales' }, state: 'idle' });
    expect(parseGlimoStatus(status).ok).toBe(true);
  });
});
