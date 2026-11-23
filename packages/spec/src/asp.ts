import { STATE_PRIORITY } from './states.js';
import type { GlimState } from './types.js';

/** Agent Status Protocol (ASP v0.1 draft) values that produce each visual state. */
export const ASP_TO_STATE: Readonly<Record<string, GlimState>> = {
  // lifecycle
  online: 'idle',
  idle: 'idle',
  busy: 'working',
  'at-capacity': 'tired',
  paused: 'sleeping',
  offline: 'sleeping',
  draining: 'sleeping',
  stopping: 'sleeping',
  crashed: 'blocked',
  unreachable: 'blocked',
  // health
  'rate-limited': 'tired',
  'quota-exhausted': 'tired',
  overloaded: 'tired',
  unhealthy: 'blocked',
  'auth-error': 'blocked',
  'dependency-down': 'blocked',
  stalled: 'blocked',
  // task
  submitted: 'thinking',
  queued: 'thinking',
  working: 'working',
  delegated: 'working',
  retrying: 'working',
  'input-required': 'waiting',
  'auth-required': 'waiting',
  'awaiting-approval': 'waiting',
  completed: 'done',
  failed: 'blocked',
  rejected: 'blocked',
  'timed-out': 'blocked',
};

/**
 * Turns one or several ASP values into the highest-priority visual state.
 * Unknown values are ignored; with no known value the result is `idle`.
 */
export function fromASP(values: readonly string[]): { state: GlimState; reason?: string } {
  let best: { state: GlimState; reason?: string } = { state: 'idle' };
  let bestRank = -1;
  for (const value of values) {
    if (!Object.hasOwn(ASP_TO_STATE, value)) continue;
    const state = ASP_TO_STATE[value] as GlimState;
    const rank = STATE_PRIORITY.indexOf(state);
    if (rank > bestRank) {
      best = { state, reason: value };
      bestRank = rank;
    }
  }
  return best;
}
