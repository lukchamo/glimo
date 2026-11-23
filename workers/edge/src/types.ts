import type { Vitrina } from './vitrina';

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  VITRINA: DurableObjectNamespace<Vitrina>;
  /** Rate limiters (optional so the Worker also runs where they are not configured). */
  RL_CREATE?: RateLimit;
  RL_WRITE?: RateLimit;
  RL_READ?: RateLimit;
  /** Secret used to sign vitrina ids. Set with `wrangler secret put ID_SECRET`. */
  ID_SECRET?: string;
  /** Hours without activity before a vitrina is deleted. */
  VITRINA_TTL_HOURS?: string;
  /** Extra origins allowed to open the live channel, comma separated. */
  ALLOWED_ORIGINS?: string;
}
