// Web Push for the edge Worker, with nothing but WebCrypto.
//
//   · VAPID (RFC 8292): an ES256 token that tells the push service who is sending
//   · Message encryption (RFC 8291) in the aes128gcm content encoding (RFC 8188)
//   · An allowlist of browser push services: the server posts to those hosts and to
//     nothing else, because the address comes from whoever subscribes
//
// An endpoint and its keys are a capability over somebody's browser: they are never
// logged and never returned by any read.

import type { GlimoStatus } from '@glimo/spec';
import { base64url, fromBase64url } from './security';
import type { Env } from './types';

const encoder = new TextEncoder();

/** How long a push service keeps a notification for a device that is offline. */
const PUSH_TTL_SECONDS = 12 * 3600;
/** Lifetime of a VAPID token. Push services refuse anything over 24 hours. */
const VAPID_TTL_SECONDS = 12 * 3600;
const SEND_TIMEOUT_MS = 10_000;
const MAX_ENDPOINT_LENGTH = 1536;
/** Record size of the aes128gcm encoding, and what is left of it for the text. */
const RECORD_SIZE = 4096;
const MAX_PLAINTEXT_BYTES = RECORD_SIZE - 86 - 17;

export type PushLocale = 'en' | 'es';
export type CallingState = 'waiting' | 'blocked';

/** One subscribed device, as the vitrina stores it. */
export type PushSubscriber = {
  endpoint: string;
  /** base64url of the browser's P-256 public key (65 bytes, uncompressed). */
  p256dh: string;
  /** base64url of the browser's 16-byte authentication secret. */
  auth: string;
  locale: PushLocale;
  /** Origin of the deployment the device subscribed on: the default VAPID contact. */
  site: string;
};

/** What the browser receives once it has decrypted the message. */
export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
  state: CallingState;
}

// ---------- which addresses may be notified ----------

/** Browser push services (Chrome and friends, Firefox, Safari, Edge). */
const PUSH_HOSTS: readonly string[] = ['fcm.googleapis.com', 'updates.push.services.mozilla.com'];
const PUSH_HOST_SUFFIXES: readonly string[] = ['.push.apple.com', '.notify.windows.com'];
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

type Refused<S extends number> = { ok: false; status: S; code: string; message: string };

/**
 * The server will POST to this address, so it must be a browser push service over https
 * and nothing else: no other host, no IP literal, no port, no credentials.
 */
export function checkPushEndpoint(
  raw: string,
): { ok: true; endpoint: string } | Refused<400 | 403> {
  const invalid = (message: string): Refused<400> => ({
    ok: false,
    status: 400,
    code: 'invalid_endpoint',
    message,
  });
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return invalid('"endpoint" is not a URL.');
  }
  if (url.protocol !== 'https:') return invalid('"endpoint" must be an https URL.');
  if (url.username || url.password) return invalid('"endpoint" cannot carry credentials.');
  // The parser drops the default port, so anything left here is not 443.
  if (url.port) return invalid('"endpoint" cannot name a port.');
  const host = url.hostname;
  if (host.startsWith('[') || /^[0-9.]+$/.test(host)) {
    return invalid('"endpoint" cannot be an IP address.');
  }
  const known =
    HOSTNAME.test(host) &&
    (PUSH_HOSTS.includes(host) || PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix)));
  if (!known) {
    return {
      ok: false,
      status: 403,
      code: 'endpoint_not_allowed',
      message: 'Notifications can only be sent to a browser push service.',
    };
  }
  url.hash = '';
  // Stored and fetched exactly as the parser understood it.
  return { ok: true, endpoint: url.href };
}

/** Validates what `PushSubscription.toJSON()` gives, plus an optional locale. */
export async function parseSubscription(
  value: unknown,
): Promise<{ ok: true; subscription: Omit<PushSubscriber, 'site'> } | Refused<400 | 403 | 422>> {
  const invalid = (message: string): Refused<422> => ({
    ok: false,
    status: 422,
    code: 'invalid_subscription',
    message,
  });
  const input = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  const keys = (typeof input.keys === 'object' && input.keys !== null ? input.keys : {}) as Record<
    string,
    unknown
  >;
  const { endpoint, locale = 'en' } = input;
  const { p256dh, auth } = keys;
  if (typeof endpoint !== 'string' || endpoint.length > MAX_ENDPOINT_LENGTH) {
    return invalid('Send "endpoint": the address the browser gave when it subscribed.');
  }
  if (typeof p256dh !== 'string' || typeof auth !== 'string') {
    return invalid('Send "keys": { "p256dh", "auth" } as the browser gave them.');
  }
  if (locale !== 'en' && locale !== 'es') return invalid('"locale" must be "en" or "es".');

  const checked = checkPushEndpoint(endpoint);
  if (!checked.ok) return checked;

  const point = p256dh.length <= 128 ? fromBase64url(p256dh) : null;
  if (!point || !(await isP256Point(point))) {
    return invalid('"keys.p256dh" must be a P-256 public key (65 bytes, base64url).');
  }
  const secret = auth.length <= 32 ? fromBase64url(auth) : null;
  if (secret?.byteLength !== 16) {
    return invalid('"keys.auth" must be 16 bytes in base64url.');
  }
  return { ok: true, subscription: { endpoint: checked.endpoint, p256dh, auth, locale } };
}

async function isP256Point(bytes: Uint8Array): Promise<boolean> {
  if (bytes.byteLength !== 65 || bytes[0] !== 4) return false;
  try {
    // Importing checks that the point really is on the curve.
    await crypto.subtle.importKey('raw', bytes, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    return true;
  } catch {
    return false;
  }
}

// ---------- VAPID (RFC 8292) ----------

export interface Vapid {
  /** base64url of the 65-byte uncompressed point: what browsers take as `applicationServerKey`. */
  publicKey: string;
  privateKey: CryptoKey;
}

type VapidEnv = Pick<Env, 'VAPID_PUBLIC_KEY' | 'VAPID_PRIVATE_KEY'>;

let loaded: { source: string; vapid: Promise<Vapid | null> } | undefined;

/** The deployment's key pair, or null when notifications are not configured. Imported once. */
export function loadVapid(env: VapidEnv): Promise<Vapid | null> {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return Promise.resolve(null);
  const source = `${publicKey}.${privateKey}`;
  if (loaded?.source !== source) {
    loaded = {
      source,
      vapid: importVapid(publicKey, privateKey).then((vapid) => {
        // Says what is wrong without ever printing a key.
        if (!vapid)
          console.error('push: the VAPID keys are not a valid pair, notifications are off');
        return vapid;
      }),
    };
  }
  return loaded.vapid;
}

async function importVapid(publicKey: string, privateKey: string): Promise<Vapid | null> {
  const point = fromBase64url(publicKey);
  const scalar = fromBase64url(privateKey);
  if (point?.byteLength !== 65 || point[0] !== 4 || scalar?.byteLength !== 32) return null;
  const curve = { name: 'ECDSA', namedCurve: 'P-256' };
  const signing = { name: 'ECDSA', hash: 'SHA-256' };
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      {
        kty: 'EC',
        crv: 'P-256',
        x: base64url(point.subarray(1, 33)),
        y: base64url(point.subarray(33)),
        d: base64url(scalar),
      },
      curve,
      false,
      ['sign'],
    );
    // A public key that does not belong to the private one would make every push
    // service answer 403: find out here, once, instead of on every notification.
    const verifier = await crypto.subtle.importKey('raw', point, curve, false, ['verify']);
    const sample = encoder.encode('glimo');
    const signature = await crypto.subtle.sign(signing, key, sample);
    if (!(await crypto.subtle.verify(signing, verifier, signature, sample))) return null;
    return { publicKey: base64url(point), privateKey: key };
  } catch {
    return null;
  }
}

/** Who a push service can contact about this sender: an https URL or a mailto address. */
export function vapidSubject(configured: string | undefined, site: string): string | undefined {
  return [configured?.trim(), site].find(
    (candidate) => candidate !== undefined && /^(?:https:\/\/|mailto:)\S+$/.test(candidate),
  );
}

/** The `Authorization` header a push service expects: a signed token plus the public key. */
export async function vapidAuthorization(
  vapid: Vapid,
  audience: string,
  subject?: string,
  now = Date.now(),
): Promise<string> {
  const part = (value: object) => base64url(encoder.encode(JSON.stringify(value)));
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({
    aud: audience,
    exp: Math.floor(now / 1000) + VAPID_TTL_SECONDS,
    ...(subject ? { sub: subject } : {}),
  })}`;
  // WebCrypto signs ES256 as r || s, which is exactly what a JWT carries.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    vapid.privateKey,
    encoder.encode(unsigned),
  );
  return `vapid t=${unsigned}.${base64url(new Uint8Array(signature))}, k=${vapid.publicKey}`;
}

// ---------- message encryption (RFC 8291 over RFC 8188) ----------

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

async function hkdf(
  salt: Uint8Array,
  secret: Uint8Array,
  info: Uint8Array,
  bytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8),
  );
}

/**
 * Encrypts one message for one browser. The sender key pair and the salt are new for
 * every message; they can be passed in only so the RFC 8291 test vector can be checked.
 */
export async function encryptPayload(
  plaintext: Uint8Array,
  p256dh: Uint8Array,
  auth: Uint8Array,
  fixed: { salt?: Uint8Array; keyPair?: CryptoKeyPair } = {},
): Promise<Uint8Array<ArrayBuffer>> {
  if (plaintext.byteLength > MAX_PLAINTEXT_BYTES) throw new Error('push message too large');
  const ecdh = { name: 'ECDH', namedCurve: 'P-256' };
  const salt = fixed.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const sender =
    fixed.keyPair ??
    ((await crypto.subtle.generateKey(ecdh, true, ['deriveBits'])) as CryptoKeyPair);
  const senderPublic = new Uint8Array(
    (await crypto.subtle.exportKey('raw', sender.publicKey)) as ArrayBuffer,
  );
  const receiver = await crypto.subtle.importKey('raw', p256dh, ecdh, false, []);
  // Workers types call this field `$public`; the runtime reads `public`, like every WebCrypto.
  const agreement = { name: 'ECDH', public: receiver };
  const shared = new Uint8Array(await crypto.subtle.deriveBits(agreement, sender.privateKey, 256));

  // RFC 8291, 3.4: both public keys and the browser's secret are mixed into the key.
  const keyInfo = concat(encoder.encode('WebPush: info\0'), p256dh, senderPublic);
  const ikm = await hkdf(auth, shared, keyInfo, 32);
  // RFC 8188, 2.2 and 2.3.
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // A single record: the text, then the delimiter that marks the last record (0x02).
  const record = concat(plaintext, Uint8Array.of(2));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, key, record),
  );

  // Header: salt (16) · record size (4) · key id length (1) · key id (the sender's public key).
  const header = new Uint8Array(21);
  header.set(salt);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = senderPublic.byteLength;
  return concat(header, senderPublic, sealed);
}

// ---------- sending ----------

const TITLES: Record<PushLocale, Record<CallingState, (name: string) => string>> = {
  en: {
    waiting: (name) => `${name} is waiting for you`,
    blocked: (name) => `${name} is blocked`,
  },
  es: {
    waiting: (name) => `${name} te espera`,
    blocked: (name) => `${name} está bloqueado`,
  },
};

/** The notification for one agent that now needs the person, in the device's language. */
export function pushMessage(
  vitrinaId: string,
  status: GlimoStatus,
  state: CallingState,
  locale: PushLocale,
): PushMessage {
  return {
    title: TITLES[locale][state](status.agent.name),
    body: status.say ?? '',
    url: `/v/${vitrinaId}`,
    tag: status.agent.id,
    state,
  };
}

type Outcome = 'sent' | 'gone' | 'failed';

async function send(
  subscriber: PushSubscriber,
  message: PushMessage,
  authorize: (audience: string, site: string) => Promise<string>,
): Promise<Outcome> {
  // Checked again on the way out: nothing leaves towards a host that is not on the list.
  const checked = checkPushEndpoint(subscriber.endpoint);
  const p256dh = fromBase64url(subscriber.p256dh);
  const auth = fromBase64url(subscriber.auth);
  if (!checked.ok || !p256dh || !auth) return 'gone';

  const body = await encryptPayload(encoder.encode(JSON.stringify(message)), p256dh, auth);
  const response = await fetch(checked.endpoint, {
    method: 'POST',
    // A push service has no reason to send us anywhere else.
    redirect: 'manual',
    headers: {
      authorization: await authorize(new URL(checked.endpoint).origin, subscriber.site),
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: String(PUSH_TTL_SECONDS),
      urgency: 'high',
    },
    body,
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  await response.body?.cancel();
  // The browser dropped the subscription: stop sending to it.
  if (response.status === 404 || response.status === 410) return 'gone';
  if (response.ok) return 'sent';
  console.warn('push: a push service answered', response.status);
  return 'failed';
}

/**
 * Tells every subscribed device that an agent needs the person. Never throws: a
 * notification that cannot be delivered must not disturb the write that caused it.
 * Resolves with the endpoints that no longer exist, so the caller can forget them.
 */
export async function notifySubscribers(
  env: VapidEnv & Pick<Env, 'VAPID_SUBJECT'>,
  subscribers: readonly PushSubscriber[],
  message: (locale: PushLocale) => PushMessage,
): Promise<string[]> {
  try {
    const vapid = await loadVapid(env);
    if (!vapid) return [];
    // One signature per push service, not per device.
    const tokens = new Map<string, Promise<string>>();
    const authorize = (audience: string, site: string) => {
      const subject = vapidSubject(env.VAPID_SUBJECT, site);
      const cacheKey = `${audience} ${subject ?? ''}`;
      const token = tokens.get(cacheKey) ?? vapidAuthorization(vapid, audience, subject);
      tokens.set(cacheKey, token);
      return token;
    };
    const outcomes = await Promise.all(
      subscribers.map((subscriber) =>
        send(subscriber, message(subscriber.locale), authorize).catch((error: unknown): Outcome => {
          // Only the kind of failure: an error text could carry the address.
          console.warn('push: not delivered', error instanceof Error ? error.name : 'error');
          return 'failed';
        }),
      ),
    );
    return subscribers
      .filter((_, index) => outcomes[index] === 'gone')
      .map((subscriber) => subscriber.endpoint);
  } catch {
    return [];
  }
}
