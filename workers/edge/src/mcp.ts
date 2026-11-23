// Glimo's MCP endpoint (Streamable HTTP, stateless, JSON responses).
// Any MCP client can show its agent on a vitrina with three tools:
//   glimo_status   show my current state
//   glimo_action   collect the person's decisions for me
//   glimo_vitrina  read the whole vitrina, most urgent first

import {
  type GlimActionRequest,
  type GlimoStatus,
  parseGlimoStatus,
  SPEC_VERSION,
  STATE_LABEL,
  STATES,
  sortByUrgency,
  summarize,
} from '@glimo/spec';
import type { Result, Snapshot } from './vitrina';

export const MCP_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

export interface McpBackend {
  version: string;
  vitrinaUrl: string;
  upsert(status: GlimoStatus): Promise<Result<{ seq: number }>>;
  pull(agentId: string, waitMs: number): Promise<Result<{ actions: GlimActionRequest[] }>>;
  snapshot(): Promise<Result<Snapshot>>;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

const INSTRUCTIONS = [
  'Glimo shows you to the person as a glim: a small avatar whose expression is your real status.',
  'Call glimo_status every time your state changes: working when you start, waiting when you need',
  'the person (declare the actions they can take), blocked when something failed, done when you finish.',
  'After asking for something, call glimo_action to collect their decision.',
  'Write `say` like a teammate who lets them know: short, concrete, no codes or ids.',
  'Never put secrets, personal data or private content in `say`: the vitrina can be on a wall screen.',
].join(' ');

const AGENT_ID = {
  type: 'string',
  pattern: '^[a-z0-9][a-z0-9-]{0,63}$',
  description: 'Stable id of your agent in this vitrina: lowercase letters, digits and dashes.',
};

const TOOLS = [
  {
    name: 'glimo_status',
    title: 'Show my status',
    description:
      "Show your current status on the person's Glimo vitrina. Call it whenever your state changes. " +
      'States: idle (ready), thinking (planning), working, waiting (you need the person: approval, an answer, an access), ' +
      'blocked (something failed), done, tired (rate limit or quota), sleeping (paused).',
    inputSchema: {
      type: 'object',
      required: ['agent', 'state'],
      additionalProperties: false,
      properties: {
        agent: AGENT_ID,
        name: { type: 'string', maxLength: 40, description: 'Display name. Defaults to the id.' },
        state: { type: 'string', enum: STATES },
        reason: {
          type: 'string',
          maxLength: 64,
          description: 'Agent Status Protocol value behind the state, e.g. awaiting-approval.',
        },
        say: {
          type: 'string',
          maxLength: 120,
          description: 'One short line for the person, e.g. "Wants to send 12 follow-up emails".',
        },
        actions: {
          type: 'array',
          maxItems: 4,
          description:
            'What the person can do about it. Only declare actions you can honour. Mark as sensitive anything that sends, pays, publishes or deletes.',
          items: {
            type: 'object',
            required: ['id', 'label'],
            additionalProperties: false,
            properties: {
              id: {
                type: 'string',
                description:
                  'approve, respond, open, pause, resume, retry, wake, undo, renew-access, raise-limit or your own.',
              },
              label: { type: 'string', maxLength: 32 },
              kind: { type: 'string', enum: ['primary', 'secondary'] },
              sensitive: { type: 'boolean' },
            },
          },
        },
        tools: { type: 'array', maxItems: 32, items: { type: 'string', maxLength: 64 } },
        skills: { type: 'array', maxItems: 32, items: { type: 'string', maxLength: 64 } },
        talkingTo: {
          type: 'array',
          maxItems: 16,
          items: { type: 'string' },
          description: 'Ids of other agents you are collaborating with right now.',
        },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'glimo_action',
    title: 'Collect decisions',
    description:
      'Collect what the person decided for you from the vitrina (approved, replied, asked to pause…). ' +
      'Each decision is delivered once. Use wait_seconds to wait for an answer instead of polling.',
    inputSchema: {
      type: 'object',
      required: ['agent'],
      additionalProperties: false,
      properties: {
        agent: AGENT_ID,
        wait_seconds: {
          type: 'integer',
          minimum: 0,
          maximum: 20,
          description: 'How long to wait for a decision before answering "nothing yet".',
        },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: 'glimo_vitrina',
    title: 'Read the vitrina',
    description:
      'Read the status of every agent in the vitrina, most urgent first. Useful to coordinate with other agents.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    annotations: { readOnlyHint: true },
  },
];

const text = (value: string, isError = false) => ({
  content: [{ type: 'text', text: value }],
  ...(isError ? { isError: true } : {}),
});

const ERROR_TEXT: Record<string, string> = {
  not_found: 'This vitrina no longer exists (they expire after a period without activity).',
  unauthorized: 'The key does not open this vitrina.',
  too_many_agents: 'This vitrina is full. Remove an agent before adding another one.',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function callTool(name: string, args: Record<string, unknown>, backend: McpBackend) {
  if (name === 'glimo_status') {
    const { agent, name: displayName, ...rest } = args;
    const parsed = parseGlimoStatus({
      ...rest,
      spec: SPEC_VERSION,
      agent: { id: agent, name: displayName ?? agent },
      updatedAt: new Date().toISOString(),
      // Sensitive fields are never accepted through the hosted endpoint.
      pov: undefined,
      thoughts: undefined,
    });
    if (!parsed.ok) {
      const issues = parsed.issues.map((i) => `${i.path || 'status'}: ${i.message}`).join('; ');
      return text(`That status is not valid Glimo Spec. ${issues}`, true);
    }
    const result = await backend.upsert(parsed.status);
    if (!result.ok) return text(ERROR_TEXT[result.error] ?? result.error, true);
    const { status } = parsed;
    const line = status.say ? ` "${status.say}"` : '';
    return {
      ...text(
        `Shown: ${status.agent.name} is ${STATE_LABEL.en[status.state].toLowerCase()}.${line} The person sees it at ${backend.vitrinaUrl}`,
      ),
      structuredContent: { ok: true, seq: result.seq, state: status.state },
    };
  }

  if (name === 'glimo_action') {
    const agent = args.agent;
    if (typeof agent !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(agent)) {
      return text('`agent` must be your agent id: lowercase letters, digits and dashes.', true);
    }
    const seconds = typeof args.wait_seconds === 'number' ? args.wait_seconds : 0;
    const result = await backend.pull(agent, Math.round(seconds * 1000));
    if (!result.ok) return text(ERROR_TEXT[result.error] ?? result.error, true);
    if (result.actions.length === 0) {
      return {
        ...text('Nothing yet: the person has not decided.'),
        structuredContent: { actions: [] },
      };
    }
    const lines = result.actions.map(
      (a) => `- ${a.actionId}${a.note ? `: "${a.note}"` : ''} (${a.at})`,
    );
    return {
      ...text(`The person decided:\n${lines.join('\n')}`),
      structuredContent: { actions: result.actions },
    };
  }

  if (name === 'glimo_vitrina') {
    const result = await backend.snapshot();
    if (!result.ok) return text(ERROR_TEXT[result.error] ?? result.error, true);
    const agents = sortByUrgency(result.agents);
    const summary = summarize(agents, 'en');
    const lines = agents.map(
      (a) =>
        `- ${a.agent.name} (${a.agent.id}): ${STATE_LABEL.en[a.state]}${a.say ? `. ${a.say}` : ''}`,
    );
    return {
      ...text([summary.headline, summary.detail, ...lines].filter(Boolean).join('\n')),
      structuredContent: { agents },
    };
  }

  return null;
}

/** Handles one JSON-RPC message. Returns null for notifications (nothing to answer). */
export async function handleMcpMessage(
  message: unknown,
  backend: McpBackend,
): Promise<JsonRpcResponse | null> {
  if (!isRecord(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request.' } };
  }
  const request = message as unknown as JsonRpcRequest;
  const isNotification = !('id' in message);
  if (isNotification) return null;
  const id = typeof request.id === 'string' || typeof request.id === 'number' ? request.id : null;
  const ok = (result: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id, result });
  const fail = (code: number, msg: string): JsonRpcResponse => ({
    jsonrpc: '2.0',
    id,
    error: { code, message: msg },
  });

  switch (request.method) {
    case 'initialize': {
      const asked = isRecord(request.params) ? request.params.protocolVersion : undefined;
      const protocolVersion =
        typeof asked === 'string' && MCP_PROTOCOL_VERSIONS.includes(asked)
          ? asked
          : (MCP_PROTOCOL_VERSIONS[0] as string);
      return ok({
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'glimo', title: 'Glimo', version: backend.version },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: TOOLS });
    case 'tools/call': {
      if (!isRecord(request.params) || typeof request.params.name !== 'string') {
        return fail(-32602, 'tools/call needs a tool name.');
      }
      const args = isRecord(request.params.arguments) ? request.params.arguments : {};
      const result = await callTool(request.params.name, args, backend);
      return result
        ? ok(result)
        : fail(-32602, `Unknown tool: ${request.params.name.slice(0, 64)}`);
    }
    default:
      return fail(-32601, `Method not found: ${request.method}`);
  }
}
