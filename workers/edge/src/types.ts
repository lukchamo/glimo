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
  /**
   * Web Push (VAPID) key pair, from `node scripts/gen-vapid.mjs`. Without both, notifications are off.
   * Public: base64url of the 65-byte uncompressed P-256 point. Private: base64url of the 32-byte scalar.
   */
  VAPID_PUBLIC_KEY?: string;
  /** Secret. Set with `wrangler secret put VAPID_PRIVATE_KEY`. */
  VAPID_PRIVATE_KEY?: string;
  /** Who push services can contact about this sender: an https URL or a mailto address. */
  VAPID_SUBJECT?: string;
}
