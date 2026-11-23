// Glimo Spec v0.1 — the status contract between any agent and a Glimo UI.
// Human-readable spec: docs/spec.md · JSON Schema: spec/glimo-spec.schema.json

export const SPEC_VERSION = 'glimo/0.1' as const;

/** The eight visual states of a glim. */
export type GlimState =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'waiting'
  | 'blocked'
  | 'done'
  | 'tired'
  | 'sleeping';

export type Urgency = 'high' | 'mid' | 'low';

/** Everyday activity used by living worlds to place and animate a glim. */
export type WorldActivity =
  | 'desk'
  | 'phone'
  | 'board'
  | 'meeting'
  | 'coffee'
  | 'sofa'
  | 'door'
  | 'walk';

export interface GlimAction {
  /** approve, respond, open, pause, resume, retry, wake, undo, renew-access, raise-limit or your own. */
  id: string;
  label: string;
  kind?: 'primary' | 'secondary';
  /** Requires explicit confirmation from the person and is always logged. */
  sensitive?: boolean;
}

export interface PovItem {
  title: string;
  detail?: string;
  tag?: string;
}

/** What the agent sees. Sensitive: stored encrypted, never sent to public surfaces. */
export interface GlimPov {
  app?: string;
  focus?: string;
  items?: PovItem[];
}

/** What the agent thinks. Sensitive: stored encrypted, never sent to public surfaces. */
export interface GlimThought {
  at: string;
  text: string;
}

export interface GlimoStatus {
  spec: typeof SPEC_VERSION;
  agent: { id: string; name: string };
  state: GlimState;
  /** Agent Status Protocol value that caused the state, e.g. `awaiting-approval`. */
  reason?: string;
  /** Short line for the vitrina: "Wants to send 12 emails". */
  say?: string;
  /** Derived from `state` when missing. */
  urgency?: Urgency;
  actions?: GlimAction[];
  pov?: GlimPov;
  thoughts?: GlimThought[];
  tools?: string[];
  skills?: string[];
  world?: { id?: string; spot?: string; activity?: WorldActivity };
  /** Ids of the glims this agent is collaborating with right now. */
  talkingTo?: string[];
  /** ISO 8601 timestamp of this status. */
  updatedAt: string;
}

/** A person's decision travelling back to the agent. */
export interface GlimActionRequest {
  /** Server-assigned id, unique inside the vitrina. */
  id: string;
  agentId: string;
  actionId: string;
  /** Optional free text (for `respond`). */
  note?: string;
  at: string;
}

/** Incremental messages of the live channel (one WebSocket per vitrina). */
export type LiveEvent =
  | { t: 'snapshot'; seq: number; agents: GlimoStatus[] }
  | { t: 'upsert'; seq: number; agent: GlimoStatus }
  | { t: 'remove'; seq: number; id: string }
  | { t: 'action'; seq: number; action: GlimActionRequest };
