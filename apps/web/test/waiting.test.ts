import { describe, expect, it } from 'vitest';
import { callsYou, sinceLabel, tabTitle } from '../src/lib/waiting';

// Local time on purpose: "yesterday" is about the reader's calendar, wherever the tests run.
const at = (day: number, hour: number, minute = 0, second = 0) =>
  new Date(2026, 10, day, hour, minute, second).getTime();
const iso = (time: number) => new Date(time).toISOString();
const NOW = at(23, 15, 30);
const ago = (ms: number) => iso(NOW - ms);
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

describe('how long a glim has been waiting', () => {
  it.each([
    [0, 'just now', 'ahora mismo'],
    [59 * SECOND, 'just now', 'ahora mismo'],
    [MINUTE, 'for 1 min', 'desde hace 1 min'],
    [12 * MINUTE + 40 * SECOND, 'for 12 min', 'desde hace 12 min'],
    [59 * MINUTE + 59 * SECOND, 'for 59 min', 'desde hace 59 min'],
    [HOUR, 'for 1 h', 'desde hace 1 h'],
    [2 * HOUR + 59 * MINUTE, 'for 2 h', 'desde hace 2 h'],
    [23 * HOUR + 59 * MINUTE, 'for 23 h', 'desde hace 23 h'],
  ])('%i ms ago → "%s" / "%s"', (elapsed, en, es) => {
    expect(sinceLabel('en', ago(elapsed), NOW)).toBe(en);
    expect(sinceLabel('es', ago(elapsed), NOW)).toBe(es);
  });

  it('from a full day on it counts calendar days', () => {
    // 24 hours exactly, and late the day before: both are yesterday.
    expect(sinceLabel('en', iso(at(22, 15, 30)), NOW)).toBe('since yesterday');
    expect(sinceLabel('es', iso(at(22, 0, 5)), NOW)).toBe('desde ayer');
    // 47 hours, but two calendar days back: "yesterday" would be wrong.
    expect(sinceLabel('en', iso(at(21, 2)), at(23, 1))).toBe('for 2 days');
    expect(sinceLabel('es', iso(at(21, 2)), at(23, 1))).toBe('desde hace 2 días');
    expect(sinceLabel('en', iso(at(13, 9)), NOW)).toBe('for 10 days');
    expect(sinceLabel('es', iso(at(13, 9)), NOW)).toBe('desde hace 10 días');
  });

  it('yesterday evening, less than a day ago, is still counted in hours', () => {
    expect(sinceLabel('en', iso(at(22, 23)), at(23, 1))).toBe('for 2 h');
  });

  it('a timestamp in the future is "just now": the agent and this device have two clocks', () => {
    expect(sinceLabel('en', iso(NOW + 5 * MINUTE), NOW)).toBe('just now');
    expect(sinceLabel('es', iso(NOW + 3 * 24 * HOUR), NOW)).toBe('ahora mismo');
  });

  it('says nothing when it does not know', () => {
    for (const locale of ['en', 'es'] as const) {
      expect(sinceLabel(locale, 'not a date', NOW)).toBeNull();
      expect(sinceLabel(locale, '', NOW)).toBeNull();
      expect(sinceLabel(locale, '2026-13-45T99:00:00Z', NOW)).toBeNull();
      expect(sinceLabel(locale, ago(MINUTE), Number.NaN)).toBeNull();
    }
  });

  it('follows the voice: lower case, no emojis, no arrows', () => {
    for (const locale of ['en', 'es'] as const) {
      for (const elapsed of [0, MINUTE, HOUR, 30 * HOUR, 90 * HOUR]) {
        const label = sinceLabel(locale, ago(elapsed), NOW) as string;
        expect(label).toBe(label.toLowerCase());
        expect(label).not.toMatch(/\p{Extended_Pictographic}|[→←»]/u);
      }
    }
  });
});

describe('who calls the person back', () => {
  it('only a glim that waits for you or is blocked', () => {
    expect(callsYou('waiting')).toBe(true);
    expect(callsYou('blocked')).toBe(true);
    for (const state of ['idle', 'thinking', 'working', 'done', 'tired', 'sleeping'] as const) {
      expect(callsYou(state)).toBe(false);
    }
    expect(callsYou(undefined)).toBe(false);
  });
});

describe('tab title', () => {
  it('puts the number of agents that need the person in front, when there are any', () => {
    expect(tabTitle('2 agents are waiting for you', 2)).toBe(
      '(2) 2 agents are waiting for you · Glimo',
    );
    expect(tabTitle('1 agente está bloqueado', 1)).toBe('(1) 1 agente está bloqueado · Glimo');
    expect(tabTitle('Nobody needs you right now', 0)).toBe('Nobody needs you right now · Glimo');
  });
});
