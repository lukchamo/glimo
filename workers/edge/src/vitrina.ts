// Vitrina: one Durable Object per vitrina. It is the single source of truth for the
// current status of every agent in it, and the live channel that fans changes out to
// every connected screen as small incremental messages.
//
//   · SQLite storage inside the object: strongly consistent, zero network hops
//   · WebSocket Hibernation: idle vitrinas cost nothing while screens stay connected
//   · writes need the vitrina key (only its SHA-256 is stored)
//   · an alarm deletes everything after a period without activity

import { DurableObject } from 'cloudflare:workers';
import type { GlimActionRequest, GlimoStatus, LiveEvent } from '@glimo/spec';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { vitrinas } from './db/schema';
import { timingSafeEqual } from './security';
import type { Env } from './types';

export const MAX_AGENTS = 50;
export const MAX_SOCKETS = 64;
export const MAX_PENDING_ACTIONS = 100;
export const MAX_WAIT_MS = 20_000;
const HOUR = 3_600_000;

export type VitrinaError =
  | 'not_found'
  | 'unauthorized'
  | 'too_many_agents'
  | 'unknown_agent'
  | 'unknown_action'
  | 'confirmation_required'
  | 'too_many_actions';

export type Result<T> = ({ ok: true } & T) | { ok: false; error: VitrinaError };

export interface Snapshot {
  seq: number;
  agents: GlimoStatus[];
  createdAt: number;
  expiresAt: number;
}

interface Meta {
  id: string;
  keyHash: string;
  createdAt: number;
  lastActive: number;
  seq: number;
}

export class Vitrina extends DurableObject<Env> {
  private meta: Meta | null = null;
  private agents = new Map<string, GlimoStatus>();
  private waiters = new Map<string, Set<() => void>>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, status TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        action_id TEXT NOT NULL,
        note TEXT,
        at TEXT NOT NULL
      );
    `);
    const row = sql.exec<{ v: string }>("SELECT v FROM meta WHERE k = 'meta'").toArray()[0];
    if (row) {
      this.meta = JSON.parse(row.v) as Meta;
      for (const agent of sql.exec<{ id: string; status: string }>(
        'SELECT id, status FROM agents ORDER BY rowid',
      )) {
        this.agents.set(agent.id, JSON.parse(agent.status) as GlimoStatus);
      }
    }
    // Keep-alive pings are answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  private get ttl(): number {
    const hours = Number(this.env.VITRINA_TTL_HOURS);
    return (Number.isFinite(hours) && hours > 0 ? hours : 168) * HOUR;
  }

  private saveMeta(): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO meta (k, v) VALUES ('meta', ?1) ON CONFLICT (k) DO UPDATE SET v = ?1",
      JSON.stringify(this.meta),
    );
  }

  /** Marks activity. The expiry alarm is only pushed forward once per hour at most. */
  private touch(now: number): void {
    if (!this.meta) return;
    const previous = this.meta.lastActive;
    this.meta.lastActive = now;
    if (now - previous > HOUR) void this.ctx.storage.setAlarm(now + this.ttl);
  }

  private authorized(keyHash: string): boolean {
    return this.meta !== null && timingSafeEqual(this.meta.keyHash, keyHash);
  }

  private broadcast(event: LiveEvent): void {
    const message = JSON.stringify(event);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(message);
      } catch {
        // The socket is gone; the runtime cleans it up.
      }
    }
  }

  /** Creates the vitrina. Called once, right after the Worker minted its id. */
  async init(id: string, keyHash: string): Promise<Result<{ expiresAt: number }>> {
    if (this.meta) return { ok: false, error: 'unauthorized' };
    const now = Date.now();
    this.meta = { id, keyHash, createdAt: now, lastActive: now, seq: 0 };
    this.saveMeta();
    await this.ctx.storage.setAlarm(now + this.ttl);
    return { ok: true, expiresAt: now + this.ttl };
  }

  /** Does this key open this vitrina? */
  async check(keyHash: string): Promise<Result<object>> {
    if (!this.meta) return { ok: false, error: 'not_found' };
    if (!this.authorized(keyHash)) return { ok: false, error: 'unauthorized' };
    return { ok: true };
  }

  async snapshot(): Promise<Result<Snapshot>> {
    if (!this.meta) return { ok: false, error: 'not_found' };
    return {
      ok: true,
      seq: this.meta.seq,
      // Arrival order: every glim keeps its place on the shelf. Interfaces sort by urgency.
      agents: [...this.agents.values()],
      createdAt: this.meta.createdAt,
      expiresAt: this.meta.lastActive + this.ttl,
    };
  }

  async upsert(keyHash: string, status: GlimoStatus): Promise<Result<{ seq: number }>> {
    if (!this.meta) return { ok: false, error: 'not_found' };
    if (!this.authorized(keyHash)) return { ok: false, error: 'unauthorized' };
    const id = status.agent.id;
    if (!this.agents.has(id) && this.agents.size >= MAX_AGENTS) {
      return { ok: false, error: 'too_many_agents' };
    }
    this.agents.set(id, status);
    this.meta.seq += 1;
    this.touch(Date.now());
    this.ctx.storage.sql.exec(
      'INSERT INTO agents (id, status) VALUES (?1, ?2) ON CONFLICT (id) DO UPDATE SET status = ?2',
      id,
      JSON.stringify(status),
    );
    this.saveMeta();
    this.broadcast({ t: 'upsert', seq: this.meta.seq, agent: status });
    return { ok: true, seq: this.meta.seq };
  }

  async remove(keyHash: string, agentId: string): Promise<Result<{ seq: number }>> {
    if (!this.meta) return { ok: false, error: 'not_found' };
    if (!this.authorized(keyHash)) return { ok: false, error: 'unauthorized' };
    if (!this.agents.delete(agentId)) return { ok: false, error: 'unknown_agent' };
    this.meta.seq += 1;
    this.touch(Date.now());
    this.ctx.storage.sql.exec('DELETE FROM agents WHERE id = ?1', agentId);
    this.ctx.storage.sql.exec('DELETE FROM actions WHERE agent_id = ?1', agentId);
    this.saveMeta();
    this.broadcast({ t: 'remove', seq: this.meta.seq, id: agentId });
    return { ok: true, seq: this.meta.seq };
  }

  /**
   * The person decides something from the vitrina. The interface never invents actions:
   * only an action the agent declared in its current status is accepted, and a sensitive
   * one needs explicit confirmation.
   */
  async act(
    keyHash: string,
    input: { agentId: string; actionId: string; note?: string; confirm?: boolean },
  ): Promise<Result<{ action: GlimActionRequest; label: string; sensitive: boolean }>> {
    if (!this.meta) return { ok: false, error: 'not_found' };
    if (!this.authorized(keyHash)) return { ok: false, error: 'unauthorized' };
    const status = this.agents.get(input.agentId);
    if (!status) return { ok: false, error: 'unknown_agent' };
    const declared = status.actions?.find((a) => a.id === input.actionId);
    if (!declared) return { ok: false, error: 'unknown_action' };
    if (declared.sensitive && input.confirm !== true) {
      return { ok: false, error: 'confirmation_required' };
    }
    const sql = this.ctx.storage.sql;
    const pending = sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM actions').one().n;
    if (pending >= MAX_PENDING_ACTIONS) return { ok: false, error: 'too_many_actions' };

    const at = new Date().toISOString();
    const row = sql
      .exec<{ id: number }>(
        'INSERT INTO actions (agent_id, action_id, note, at) VALUES (?1, ?2, ?3, ?4) RETURNING id',
        input.agentId,
        input.actionId,
        input.note ?? null,
        at,
      )
      .one();
    const action: GlimActionRequest = {
      id: String(row.id),
      agentId: input.agentId,
      actionId: input.actionId,
      at,
      ...(input.note ? { note: input.note } : {}),
    };
    this.meta.seq += 1;
    this.touch(Date.now());
    this.saveMeta();
    // Screens learn that a decision was made, never the free text that came with it.
    const { note: _note, ...publicAction } = action;
    this.broadcast({ t: 'action', seq: this.meta.seq, action: publicAction });
    for (const wake of this.waiters.get(input.agentId) ?? []) wake();
    return { ok: true, action, label: declared.label, sensitive: declared.sensitive === true };
  }

  /** The agent collects the decisions addressed to it. Each one is delivered once. */
  async pull(
    keyHash: string,
    agentId: string,
    waitMs = 0,
  ): Promise<Result<{ actions: GlimActionRequest[] }>> {
    if (!this.meta) return { ok: false, error: 'not_found' };
    if (!this.authorized(keyHash)) return { ok: false, error: 'unauthorized' };

    let actions = this.takeActions(agentId);
    const wait = Math.min(Math.max(0, waitMs), MAX_WAIT_MS);
    if (actions.length === 0 && wait > 0) {
      await new Promise<void>((resolve) => {
        const waiters = this.waiters.get(agentId) ?? new Set();
        this.waiters.set(agentId, waiters);
        const done = () => {
          clearTimeout(timer);
          waiters.delete(done);
          resolve();
        };
        const timer = setTimeout(done, wait);
        waiters.add(done);
      });
      actions = this.takeActions(agentId);
    }
    return { ok: true, actions };
  }

  private takeActions(agentId: string): GlimActionRequest[] {
    const rows = this.ctx.storage.sql
      .exec<{ id: number; action_id: string; note: string | null; at: string }>(
        'DELETE FROM actions WHERE agent_id = ?1 RETURNING id, action_id, note, at',
        agentId,
      )
      .toArray();
    return rows
      .sort((a, b) => a.id - b.id)
      .map((row) => ({
        id: String(row.id),
        agentId,
        actionId: row.action_id,
        at: row.at,
        ...(row.note ? { note: row.note } : {}),
      }));
  }

  /** Live channel: the only thing that reaches this object through fetch(). */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade.', { status: 426 });
    }
    if (!this.meta) return new Response('Not found.', { status: 404 });
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) {
      return new Response('Too many screens are watching this vitrina.', { status: 429 });
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    const snapshot: LiveEvent = {
      t: 'snapshot',
      seq: this.meta.seq,
      agents: [...this.agents.values()],
    };
    pair[1].send(JSON.stringify(snapshot));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  /** The channel is one-way. Anything a screen sends (other than "ping") closes it. */
  override async webSocketMessage(socket: WebSocket): Promise<void> {
    socket.close(1008, 'This channel is read-only.');
  }

  override async webSocketClose(socket: WebSocket, code: number): Promise<void> {
    try {
      socket.close(code === 1005 || code === 1006 ? 1000 : code);
    } catch {
      // Already closed.
    }
  }

  /** Expiry: a vitrina nobody wrote to for the whole TTL disappears completely. */
  override async alarm(): Promise<void> {
    if (!this.meta) return;
    const expiresAt = this.meta.lastActive + this.ttl;
    if (Date.now() < expiresAt) {
      await this.ctx.storage.setAlarm(expiresAt);
      return;
    }
    const id = this.meta.id;
    for (const socket of this.ctx.getWebSockets()) socket.close(1001, 'This vitrina expired.');
    this.meta = null;
    this.agents.clear();
    await this.ctx.storage.deleteAll();
    try {
      await drizzle(this.env.DB).delete(vitrinas).where(eq(vitrinas.id, id));
    } catch {
      // The index is only bookkeeping; the object itself is already gone.
    }
  }
}
