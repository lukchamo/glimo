import { z } from 'zod';
import { STATES } from './states.js';
import { type GlimoStatus, SPEC_VERSION } from './types.js';

/** Hard limits. They mirror spec/glimo-spec.schema.json and keep a status small. */
export const LIMITS = {
  agentId: 64,
  agentName: 40,
  reason: 64,
  say: 120,
  actions: 4,
  actionLabel: 32,
  povText: 200,
  povItems: 20,
  thoughts: 50,
  thoughtText: 280,
  listItems: 32,
  listItemText: 64,
  talkingTo: 16,
  /** Maximum size of one serialized status, in bytes. */
  bytes: 16_384,
} as const;

export const AGENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const ACTION_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** Fields that describe what the agent sees and thinks. Never sent to public surfaces. */
export const SENSITIVE_FIELDS = ['pov', 'thoughts'] as const;

const text = (max: number) => z.string().trim().min(1).max(max);
const dateTime = z.iso.datetime({ offset: true });

export const glimActionSchema = z.object({
  id: z.string().regex(ACTION_ID_PATTERN),
  label: text(LIMITS.actionLabel),
  kind: z.enum(['primary', 'secondary']).optional(),
  sensitive: z.boolean().optional(),
});

export const glimoStatusSchema = z.object({
  spec: z.literal(SPEC_VERSION),
  agent: z.object({
    id: z.string().regex(AGENT_ID_PATTERN),
    name: text(LIMITS.agentName),
  }),
  state: z.enum(STATES as [string, ...string[]]),
  reason: text(LIMITS.reason).optional(),
  say: text(LIMITS.say).optional(),
  urgency: z.enum(['high', 'mid', 'low']).optional(),
  actions: z.array(glimActionSchema).max(LIMITS.actions).optional(),
  pov: z
    .object({
      app: text(LIMITS.povText).optional(),
      focus: text(LIMITS.povText).optional(),
      items: z
        .array(
          z.object({
            title: text(LIMITS.povText),
            detail: text(LIMITS.thoughtText).optional(),
            tag: text(24).optional(),
          }),
        )
        .max(LIMITS.povItems)
        .optional(),
    })
    .optional(),
  thoughts: z
    .array(z.object({ at: dateTime, text: text(LIMITS.thoughtText) }))
    .max(LIMITS.thoughts)
    .optional(),
  tools: z.array(text(LIMITS.listItemText)).max(LIMITS.listItems).optional(),
  skills: z.array(text(LIMITS.listItemText)).max(LIMITS.listItems).optional(),
  world: z
    .object({
      id: text(LIMITS.listItemText).optional(),
      spot: text(LIMITS.listItemText).optional(),
      activity: z
        .enum(['desk', 'phone', 'board', 'meeting', 'coffee', 'sofa', 'door', 'walk'])
        .optional(),
    })
    .optional(),
  talkingTo: z.array(z.string().regex(AGENT_ID_PATTERN)).max(LIMITS.talkingTo).optional(),
  updatedAt: dateTime,
});

export interface ValidationIssue {
  /** Dotted path of the offending field, e.g. `actions.0.label`. */
  path: string;
  message: string;
}

export type ParseResult =
  | { ok: true; status: GlimoStatus }
  | { ok: false; issues: ValidationIssue[] };

/**
 * Validates unknown input against Glimo Spec v0.1.
 * Unknown fields are dropped (clients must ignore what they do not know).
 */
export function parseGlimoStatus(input: unknown): ParseResult {
  const result = glimoStatusSchema.safeParse(input);
  if (result.success) return { ok: true, status: result.data as GlimoStatus };
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  };
}

export function isGlimoStatus(input: unknown): input is GlimoStatus {
  return glimoStatusSchema.safeParse(input).success;
}

/** Removes `pov` and `thoughts`. Returns the stripped copy and which fields were dropped. */
export function redactSensitive(status: GlimoStatus): {
  status: GlimoStatus;
  dropped: (typeof SENSITIVE_FIELDS)[number][];
} {
  const dropped = SENSITIVE_FIELDS.filter((field) => status[field] !== undefined);
  if (dropped.length === 0) return { status, dropped };
  const { pov: _pov, thoughts: _thoughts, ...rest } = status;
  return { status: rest, dropped };
}

/** Convenience builder: fills `spec` and `updatedAt` so an agent only states what changed. */
export function createStatus(
  input: Omit<GlimoStatus, 'spec' | 'updatedAt'> & { updatedAt?: string },
): GlimoStatus {
  return { spec: SPEC_VERSION, ...input, updatedAt: input.updatedAt ?? new Date().toISOString() };
}
