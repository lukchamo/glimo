import type { GlimoStatus, LiveEvent } from './types.js';

export interface VitrinaState {
  /** Last sequence number applied. Events with a lower or equal seq are ignored. */
  seq: number;
  agents: Record<string, GlimoStatus>;
}

export const EMPTY_VITRINA: VitrinaState = { seq: 0, agents: {} };

/**
 * Pure reducer for the live channel. Returns the same reference when nothing changed,
 * so UI layers can skip re-rendering glims that did not move.
 */
export function applyLiveEvent(state: VitrinaState, event: LiveEvent): VitrinaState {
  switch (event.t) {
    case 'snapshot': {
      const agents: Record<string, GlimoStatus> = {};
      for (const agent of event.agents) {
        const previous = state.agents[agent.agent.id];
        // Keep the old object when it is the same status: stable identity, no re-render.
        agents[agent.agent.id] =
          previous && previous.updatedAt === agent.updatedAt && previous.state === agent.state
            ? previous
            : agent;
      }
      return { seq: event.seq, agents };
    }
    case 'upsert': {
      if (event.seq <= state.seq) return state;
      return {
        seq: event.seq,
        agents: { ...state.agents, [event.agent.agent.id]: event.agent },
      };
    }
    case 'remove': {
      if (event.seq <= state.seq) return state;
      if (!Object.hasOwn(state.agents, event.id)) return { ...state, seq: event.seq };
      const { [event.id]: _removed, ...agents } = state.agents;
      return { seq: event.seq, agents };
    }
    case 'action':
      return event.seq > state.seq ? { ...state, seq: event.seq } : state;
    default:
      return state;
  }
}

export function isLiveEvent(value: unknown): value is LiveEvent {
  if (typeof value !== 'object' || value === null) return false;
  const t = (value as { t?: unknown }).t;
  return t === 'snapshot' || t === 'upsert' || t === 'remove' || t === 'action';
}
