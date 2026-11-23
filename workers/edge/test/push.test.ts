import {
  createExecutionContext,
  runDurableObjectAlarm,
  runInDurableObject,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import {
  checkPushEndpoint,
  encryptPayload,
  loadVapid,
  notifySubscribers,
  vapidAuthorization,
  vapidSubject,
} from '../src/push';
import { base64url, fromBase64url } from '../src/security';
import type { Env } from '../src/types';
import { MAX_NOTIFICATIONS_PER_MINUTE } from '../src/vitrina';
import { call, createVitrina, type Json, ORIGIN, push, status } from './helpers';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ECDH = { name: 'ECDH', namedCurve: 'P-256' };
const bytes = (text: string) => fromBase64url(text) as Uint8Array<ArrayBuffer>;

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

async function hkdf(salt: Uint8Array, secret: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits']);
  const algorithm = { name: 'HKDF', hash: 'SHA-256', salt, info };
  return new Uint8Array(await crypto.subtle.deriveBits(algorithm, key, length * 8));
}

/** A browser that subscribed: it holds the private key, so only it can read its messages. */
async function device(host = 'fcm.googleapis.com') {
  const keys = (await crypto.subtle.generateKey(ECDH, true, ['deriveBits'])) as CryptoKeyPair;
  const publicKey = new Uint8Array(
    (await crypto.subtle.exportKey('raw', keys.publicKey)) as ArrayBuffer,
  );
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const endpoint = `https://${host}/send/${crypto.randomUUID()}`;

  /** The receiving half of RFC 8291, written apart from the code under test. */
  async function read(body: Uint8Array): Promise<Json> {
    const salt = body.subarray(0, 16);
    const keyIdLength = body[20] as number;
    const senderPublic = body.subarray(21, 21 + keyIdLength);
    const sender = await crypto.subtle.importKey('raw', senderPublic, ECDH, false, []);
    const agreement = { name: 'ECDH', public: sender };
    const shared = new Uint8Array(await crypto.subtle.deriveBits(agreement, keys.privateKey, 256));
    const info = concat(encoder.encode('WebPush: info\0'), publicKey, senderPublic);
    const ikm = await hkdf(auth, shared, info, 32);
    const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
    const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);
    const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
    const record = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: nonce },
        key,
        body.subarray(21 + keyIdLength),
      ),
    );
    // The text ends at the delimiter of a last record.
    expect(record.at(-1)).toBe(2);
    return JSON.parse(decoder.decode(record.subarray(0, -1))) as Json;
  }

  return {
    endpoint,
    publicKey,
    auth,
    read,
    /** What `PushSubscription.toJSON()` gives, plus the optional locale. */
    json: (locale?: string) => ({
      endpoint,
      expirationTime: null,
      keys: { p256dh: base64url(publicKey), auth: base64url(auth) },
      ...(locale ? { locale } : {}),
    }),
  };
}

/** Checks the signature of a VAPID header with the key it names, and returns its claims. */
async function vapidClaims(header: string | null) {
  const match = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header ?? '');
  if (!match) throw new Error(`not a VAPID header: ${header}`);
  const [, head, claims, signature, key] = match as unknown as [
    string,
    string,
    string,
    string,
    string,
  ];
  const curve = { name: 'ECDSA', namedCurve: 'P-256' };
  const verifier = await crypto.subtle.importKey('raw', bytes(key), curve, false, ['verify']);
  const signed = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    verifier,
    bytes(signature),
    encoder.encode(`${head}.${claims}`),
  );
  return {
    signed,
    key,
    signatureBytes: bytes(signature).byteLength,
    header: JSON.parse(decoder.decode(bytes(head))) as Json,
    claims: JSON.parse(decoder.decode(bytes(claims))) as { aud: string; exp: number; sub?: string },
  };
}

const subscribe = (id: string, json: unknown, headers: Record<string, string> = {}) =>
  call(`/api/vitrinas/${id}/push`, { method: 'POST', json, headers });
const unsubscribe = (id: string, endpoint: unknown) =>
  call(`/api/vitrinas/${id}/push`, { method: 'DELETE', json: { endpoint } });
const stubOf = (id: string) => env.VITRINA.get(env.VITRINA.idFromName(id));
const stored = (id: string) =>
  runInDurableObject(stubOf(id), (_instance, state) => {
    const sql = state.storage.sql;
    const table = "SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'subscriptions'";
    if (sql.exec<{ n: number }>(table).one().n === 0) return 0;
    return sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM subscriptions').one().n;
  });
const errorCode = async (response: Response) =>
  ((await response.json()) as { error?: { code?: string } }).error?.code;

describe('Web Push building blocks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('encrypts exactly like the example in RFC 8291', async () => {
    // Section 5 and appendix A of the RFC.
    const vector = {
      plaintext: 'When I grow up, I want to be a watermelon',
      senderPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
      senderPublic:
        'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
      receiverPublic:
        'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
      auth: 'BTBZMqHH6r4Tts7J_aSIgg',
      salt: 'DGv6ra1nlYgDCS1FRnbzlw',
      body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    };
    const point = bytes(vector.senderPublic);
    const keyPair = {
      publicKey: await crypto.subtle.importKey('raw', point, ECDH, true, []),
      privateKey: await crypto.subtle.importKey(
        'jwk',
        {
          kty: 'EC',
          crv: 'P-256',
          x: base64url(point.subarray(1, 33)),
          y: base64url(point.subarray(33)),
          d: vector.senderPrivate,
        },
        ECDH,
        false,
        ['deriveBits'],
      ),
    };
    const body = await encryptPayload(
      encoder.encode(vector.plaintext),
      bytes(vector.receiverPublic),
      bytes(vector.auth),
      { salt: bytes(vector.salt), keyPair },
    );
    expect(base64url(body)).toBe(vector.body);
  });

  it('uses a new key and salt for every message, and only the device can read it', async () => {
    const phone = await device();
    const other = await device();
    const text = encoder.encode(JSON.stringify({ title: 'Sales te espera: ¿envío 12 correos?' }));
    const first = await encryptPayload(text, phone.publicKey, phone.auth);
    const second = await encryptPayload(text, phone.publicKey, phone.auth);
    expect(base64url(first)).not.toBe(base64url(second));
    expect(first.byteLength).toBe(16 + 4 + 1 + 65 + text.byteLength + 1 + 16);
    expect(await phone.read(first)).toEqual({ title: 'Sales te espera: ¿envío 12 correos?' });
    await expect(other.read(first)).rejects.toThrow();
    await expect(
      encryptPayload(new Uint8Array(5000), phone.publicKey, phone.auth),
    ).rejects.toThrow();
  });

  it('signs a VAPID token that the public key verifies', async () => {
    const vapid = await loadVapid(env);
    if (!vapid) throw new Error('the test keys were not loaded');
    const now = Date.UTC(2026, 10, 23, 12);
    const header = await vapidAuthorization(
      vapid,
      'https://fcm.googleapis.com',
      'mailto:hello@glimo.test',
      now,
    );
    const token = await vapidClaims(header);
    expect(token.key).toBe(env.VAPID_PUBLIC_KEY);
    expect(token.header).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(token.claims).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: now / 1000 + 12 * 3600,
      sub: 'mailto:hello@glimo.test',
    });
    // ES256 in a JWT is r || s, not the DER form.
    expect(token.signatureBytes).toBe(64);
    expect(token.signed).toBe(true);

    // The same token is worthless once a single claim changes.
    const [head, , signature] = header.slice('vapid t='.length).split(', k=')[0]?.split('.') ?? [];
    const forged = base64url(encoder.encode(JSON.stringify({ aud: 'https://evil.example' })));
    const tampered = await vapidClaims(`vapid t=${head}.${forged}.${signature}, k=${token.key}`);
    expect(tampered.signed).toBe(false);
  });

  it('names a contact only when it is an https URL or a mailto address', () => {
    expect(vapidSubject('mailto:ops@example.org', ORIGIN)).toBe('mailto:ops@example.org');
    expect(vapidSubject(' https://example.org/contact ', ORIGIN)).toBe(
      'https://example.org/contact',
    );
    // Nothing usable configured: the deployment itself is the contact.
    expect(vapidSubject(undefined, ORIGIN)).toBe(ORIGIN);
    expect(vapidSubject('ops@example.org', ORIGIN)).toBe(ORIGIN);
    expect(vapidSubject(undefined, 'http://127.0.0.1:8787')).toBeUndefined();
  });

  it('is off unless both keys are set and belong together, and never prints them', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const stranger = await device();
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = env;
    expect(await loadVapid({})).toBeNull();
    expect(await loadVapid({ VAPID_PUBLIC_KEY })).toBeNull();
    expect(await loadVapid({ VAPID_PRIVATE_KEY })).toBeNull();
    expect(await loadVapid({ VAPID_PUBLIC_KEY: 'not-a-key', VAPID_PRIVATE_KEY })).toBeNull();
    expect(await loadVapid({ VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: 'AAAA' })).toBeNull();
    expect(
      await loadVapid({ VAPID_PUBLIC_KEY: base64url(stranger.publicKey), VAPID_PRIVATE_KEY }),
    ).toBeNull();
    expect(JSON.stringify(errors.mock.calls)).not.toContain(VAPID_PRIVATE_KEY);
    expect(errors.mock.calls.length).toBeGreaterThan(0);

    const vapid = await loadVapid({
      VAPID_PUBLIC_KEY: ` ${VAPID_PUBLIC_KEY}\n`,
      VAPID_PRIVATE_KEY,
    });
    expect(vapid?.publicKey).toBe(VAPID_PUBLIC_KEY);
    expect(vapid?.privateKey.extractable).toBe(false);
  });

  it('only accepts the address of a browser push service', () => {
    const allowed = [
      'https://fcm.googleapis.com/fcm/send/abc:def',
      'https://fcm.googleapis.com:443/wp/abc',
      'https://FCM.GoogleAPIs.com/wp/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://web.push.apple.com/abc',
      'https://wns2-by3p.notify.windows.com/w/?token=abc%3d',
      // A backslash is a slash to the parser: this still goes to the push service.
      'https://fcm.googleapis.com\\@evil.example/',
    ];
    const hosts =
      /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|wns2-by3p\.notify\.windows\.com)\//;
    for (const address of allowed) {
      const result = checkPushEndpoint(address);
      expect(result, address).toMatchObject({ ok: true });
      // What is stored and fetched is what the parser understood, never the raw text.
      if (result.ok) expect(result.endpoint, address).toMatch(hosts);
    }

    const malformed = [
      '',
      'not a url',
      '//fcm.googleapis.com/x',
      'http://fcm.googleapis.com/fcm/send/abc',
      'ftp://fcm.googleapis.com/x',
      'wss://fcm.googleapis.com/x',
      'javascript:alert(1)',
      'file:///etc/passwd',
      'https://127.0.0.1/x',
      'https://169.254.169.254/latest/meta-data/',
      'https://2130706433/',
      'https://0x7f.1/',
      'https://[::1]/x',
      'https://[::ffff:127.0.0.1]/x',
      'https://fcm.googleapis.com:8443/x',
      'https://fcm.googleapis.com:80/x',
      'https://user:secret@fcm.googleapis.com/x',
      'https://user@fcm.googleapis.com/x',
      'https://fcm.googleapis.com@evil.example/',
      'https://fcm.googleapis.com:443@evil.example/',
    ];
    for (const address of malformed) {
      expect(checkPushEndpoint(address), address).toMatchObject({ ok: false, status: 400 });
    }

    const elsewhere = [
      'https://evil.example/x',
      'https://fcm.googleapis.com.evil.example/x',
      'https://web.push.apple.com.evil.example/x',
      'https://evil.example/?x=fcm.googleapis.com',
      'https://evil.example/fcm.googleapis.com/',
      'https://evil.example#@fcm.googleapis.com/',
      'https://evil.example\\.fcm.googleapis.com/',
      'https://notfcm.googleapis.com/x',
      'https://storage.googleapis.com/x',
      'https://googleapis.com/x',
      'https://push.apple.com/x',
      'https://evilpush.apple.com/x',
      'https://notify.windows.com/x',
      'https://fcm.googleapis.com./x',
      'https://fcm.googleapis.com。evil.example/x',
      // Names the parser lets through but no push service has.
      'https://.push.apple.com/x',
      'https://a..push.apple.com/x',
      'https://-.notify.windows.com/x',
      'https://localhost/x',
      'https://glimo.test/api/vitrinas',
    ];
    for (const address of elsewhere) {
      expect(checkPushEndpoint(address), address).toMatchObject({
        ok: false,
        status: 403,
        code: 'endpoint_not_allowed',
      });
    }
  });
});

describe('notifications: subscribing', () => {
  it('gives browsers the public key, and nothing else', async () => {
    const response = await call('/api/push/key');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { publicKey: string };
    expect(Object.keys(body)).toEqual(['publicKey']);
    expect(body.publicKey).toBe(env.VAPID_PUBLIC_KEY);
    const point = bytes(body.publicKey);
    expect(point.byteLength).toBe(65);
    expect(point[0]).toBe(4);
  });

  it('without keys the feature is off and everything else works', async () => {
    const off: Env = { ...env, VAPID_PUBLIC_KEY: undefined, VAPID_PRIVATE_KEY: undefined };
    const direct = async (
      path: string,
      init: RequestInit & { key?: string; json?: unknown } = {},
    ) => {
      const context = createExecutionContext();
      const request = new Request(`${ORIGIN}${path}`, {
        ...init,
        headers: {
          ...(init.json !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(init.key ? { authorization: `Bearer ${init.key}` } : {}),
        },
        body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
      });
      const response = await worker.fetch(
        request as Parameters<typeof worker.fetch>[0],
        off,
        context,
      );
      await waitOnExecutionContext(context);
      return response;
    };
    const v = await createVitrina();
    const phone = await device();

    const key = await direct('/api/push/key');
    expect(key.status).toBe(503);
    expect(await errorCode(key)).toBe('push_not_configured');

    const refused = await direct(`/api/vitrinas/${v.id}/push`, {
      method: 'POST',
      json: phone.json(),
    });
    expect(refused.status).toBe(503);
    expect(await errorCode(refused)).toBe('push_not_configured');
    expect(await stored(v.id)).toBe(0);
    // An address that is not allowed is refused for what it is, configured or not.
    const hostile = await direct(`/api/vitrinas/${v.id}/push`, {
      method: 'POST',
      json: { ...phone.json(), endpoint: 'https://evil.example/x' },
    });
    expect(hostile.status).toBe(403);

    const write = await direct(`/api/vitrinas/${v.id}/status`, {
      method: 'POST',
      key: v.key,
      json: status('sales', 'waiting'),
    });
    expect(write.status).toBe(200);
    expect(await write.json()).toEqual({ ok: true, seq: 1 });
  });

  it('accepts what the browser gives and refuses everything else', async () => {
    const v = await createVitrina();
    const phone = await device();
    const good = phone.json();
    const accepted = await subscribe(v.id, good);
    expect(accepted.status).toBe(201);
    expect(await accepted.json()).toEqual({ ok: true });

    const withKeys = (keys: Json) => ({ ...good, keys: { ...good.keys, ...keys } });
    const at = (endpoint: unknown) => ({ ...good, endpoint });
    const x = phone.publicKey.subarray(1, 33);
    const cases: [string, unknown, number, string][] = [
      ['plain http', at('http://fcm.googleapis.com/fcm/send/x'), 400, 'invalid_endpoint'],
      ['an IP literal', at('https://127.0.0.1/x'), 400, 'invalid_endpoint'],
      ['a metadata address', at('https://169.254.169.254/latest/'), 400, 'invalid_endpoint'],
      ['an IPv6 literal', at('https://[::1]/x'), 400, 'invalid_endpoint'],
      ['another port', at('https://fcm.googleapis.com:8443/x'), 400, 'invalid_endpoint'],
      ['credentials', at('https://fcm.googleapis.com@evil.example/'), 400, 'invalid_endpoint'],
      ['another scheme', at('file:///etc/passwd'), 400, 'invalid_endpoint'],
      ['another host', at('https://evil.example/x'), 403, 'endpoint_not_allowed'],
      [
        'a look-alike host',
        at('https://fcm.googleapis.com.evil.example/x'),
        403,
        'endpoint_not_allowed',
      ],
      [
        'the host in the query',
        at('https://evil.example/?x=fcm.googleapis.com'),
        403,
        'endpoint_not_allowed',
      ],
      ['this very server', at(`${ORIGIN}/api/vitrinas`), 403, 'endpoint_not_allowed'],
      ['no endpoint', { keys: good.keys }, 422, 'invalid_subscription'],
      [
        'an endpoint that is not text',
        at(['https://fcm.googleapis.com/x']),
        422,
        'invalid_subscription',
      ],
      [
        'an endless endpoint',
        at(`https://fcm.googleapis.com/${'a'.repeat(1600)}`),
        422,
        'invalid_subscription',
      ],
      ['no keys', { endpoint: good.endpoint }, 422, 'invalid_subscription'],
      [
        'a short p256dh',
        withKeys({ p256dh: base64url(phone.publicKey.subarray(0, 64)) }),
        422,
        'invalid_subscription',
      ],
      [
        'a compressed point',
        withKeys({ p256dh: base64url(Uint8Array.of(2, ...x)) }),
        422,
        'invalid_subscription',
      ],
      [
        'a point off the curve',
        withKeys({ p256dh: base64url(Uint8Array.of(4, ...new Uint8Array(64))) }),
        422,
        'invalid_subscription',
      ],
      [
        'a p256dh that is not base64url',
        withKeys({ p256dh: `${good.keys.p256dh.slice(0, -2)}+/` }),
        422,
        'invalid_subscription',
      ],
      [
        'a short auth',
        withKeys({ auth: base64url(phone.auth.subarray(0, 15)) }),
        422,
        'invalid_subscription',
      ],
      [
        'a long auth',
        withKeys({ auth: base64url(new Uint8Array(17)) }),
        422,
        'invalid_subscription',
      ],
      ['an auth that is not text', withKeys({ auth: 16 }), 422, 'invalid_subscription'],
      ['an unknown locale', { ...good, locale: 'fr' }, 422, 'invalid_subscription'],
      ['text instead of an object', 'https://fcm.googleapis.com/x', 422, 'invalid_subscription'],
      ['a list', [good], 422, 'invalid_subscription'],
      ['null', null, 422, 'invalid_subscription'],
    ];
    for (const [name, body, expected, code] of cases) {
      const response = await subscribe(v.id, body);
      expect(response.status, name).toBe(expected);
      expect(await errorCode(response), name).toBe(code);
    }
    expect(await stored(v.id)).toBe(1);

    const elsewhere = await subscribe(v.id, good, { origin: 'https://evil.example' });
    expect(elsewhere.status).toBe(403);
    expect(await errorCode(elsewhere)).toBe('forbidden_origin');
    expect((await subscribe(v.id, good, { origin: ORIGIN })).status).toBe(201);
    expect((await subscribe('v0000000000000000000000000', good)).status).toBe(404);

    const big = await subscribe(v.id, { ...good, padding: 'x'.repeat(2100) });
    expect(big.status).toBe(413);
    const form = await call(`/api/vitrinas/${v.id}/push`, {
      method: 'POST',
      body: `endpoint=${encodeURIComponent(good.endpoint)}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(form.status).toBe(415);
  });

  it('notifies at most 20 devices per vitrina; subscribing again updates', async () => {
    const v = await createVitrina();
    const phone = await device();
    const at = (n: number, locale?: string) => ({
      ...phone.json(locale),
      endpoint: `https://fcm.googleapis.com/send/device-${n}`,
    });
    for (let n = 0; n < 20; n++) expect((await subscribe(v.id, at(n))).status).toBe(201);
    const full = await subscribe(v.id, at(20));
    expect(full.status).toBe(409);
    expect(await errorCode(full)).toBe('too_many_subscriptions');

    // The same device again is an update, not one more.
    expect((await subscribe(v.id, at(3, 'es'))).status).toBe(201);
    expect(await stored(v.id)).toBe(20);
    const locale = await runInDurableObject(
      stubOf(v.id),
      (_instance, state) =>
        state.storage.sql
          .exec<{ locale: string }>(
            'SELECT locale FROM subscriptions WHERE endpoint = ?1',
            at(3).endpoint,
          )
          .one().locale,
    );
    expect(locale).toBe('es');

    const removed = await unsubscribe(v.id, at(0).endpoint);
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ ok: true });
    expect((await subscribe(v.id, at(20))).status).toBe(201);
    expect(await stored(v.id)).toBe(20);
  });

  it('unsubscribing needs the exact address and can be repeated', async () => {
    const v = await createVitrina();
    const phone = await device();
    await subscribe(v.id, phone.json());
    expect((await unsubscribe(v.id, 'https://fcm.googleapis.com/send/somebody-else')).status).toBe(
      200,
    );
    expect(await stored(v.id)).toBe(1);
    expect((await unsubscribe(v.id, 42)).status).toBe(422);
    expect((await unsubscribe(v.id, 'https://evil.example/x')).status).toBe(403);
    expect(
      (
        await call(`/api/vitrinas/${v.id}/push`, {
          method: 'DELETE',
          json: { endpoint: phone.endpoint },
          headers: { origin: 'https://evil.example' },
        })
      ).status,
    ).toBe(403);
    expect(await stored(v.id)).toBe(1);
    expect((await unsubscribe(v.id, phone.endpoint)).status).toBe(200);
    expect(await stored(v.id)).toBe(0);
    expect((await unsubscribe(v.id, phone.endpoint)).status).toBe(200);
    expect((await unsubscribe('v0000000000000000000000000', phone.endpoint)).status).toBe(404);
  });

  it('never gives a subscription back, to anyone', async () => {
    const v = await createVitrina();
    const phone = await device();
    const sent = phone.json();
    await subscribe(v.id, sent);
    await push(v, status('sales', 'working'));

    const live = await call(`/api/vitrinas/${v.id}/live`, { headers: { upgrade: 'websocket' } });
    const socket = live.webSocket as WebSocket;
    const first = new Promise<string>((resolve) =>
      socket.addEventListener('message', (event) => resolve(String(event.data))),
    );
    socket.accept();
    const answers = [
      await (await call(`/api/vitrinas/${v.id}`)).text(),
      await (await call(`/api/vitrinas/${v.id}/log`, { key: v.key })).text(),
      await (await call(`/api/vitrinas/${v.id}/actions?agent=sales`, { key: v.key })).text(),
      await (await call(`/api/vitrinas/${v.id}/push`)).text(),
      await (await subscribe(v.id, sent)).text(),
      await first,
    ];
    socket.close(1000);
    for (const text of answers) {
      expect(text).not.toContain(phone.endpoint);
      expect(text).not.toContain(sent.keys.p256dh);
      expect(text).not.toContain(sent.keys.auth);
      expect(text).not.toMatch(/endpoint|p256dh|subscription/);
    }
  });
});

describe('notifications: calling the person back', () => {
  interface Sent {
    url: string;
    method: string;
    redirect: string | undefined;
    headers: Headers;
    body: Uint8Array;
  }
  let sent: Sent[] = [];
  let answer: (url: string) => Response = () => new Response(null, { status: 201 });

  beforeEach(() => {
    sent = [];
    answer = () => new Response(null, { status: 201 });
    // The Worker, its Durable Objects and the tests share one isolate: this is the
    // only door to the outside, and nothing real is ever contacted.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = new Request(input as RequestInfo, init);
      sent.push({
        url: request.url,
        method: request.method,
        redirect: init?.redirect,
        headers: request.headers,
        body: new Uint8Array(await request.arrayBuffer()),
      });
      return answer(request.url);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Lets anything still on its way out arrive, so "nothing more was sent" means it. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

  it('a change to waiting reaches every subscribed device once, encrypted for it', async () => {
    const v = await createVitrina();
    const phone = await device('fcm.googleapis.com');
    const laptop = await device('updates.push.services.mozilla.com');
    expect((await subscribe(v.id, phone.json())).status).toBe(201);
    expect((await subscribe(v.id, laptop.json('es'))).status).toBe(201);

    await push(v, status('sales', 'working'));
    const write = await push(v, status('sales', 'waiting', { say: 'Wants to send 12 emails' }));
    expect(write.status).toBe(200);
    expect(await write.json()).toEqual({ ok: true, seq: 2 });

    await expect.poll(() => sent.length).toBe(2);
    await settle();
    expect(sent.map((request) => request.url).sort()).toEqual(
      [phone.endpoint, laptop.endpoint].sort(),
    );
    for (const request of sent) {
      expect(request.method).toBe('POST');
      expect(request.redirect).toBe('manual');
      expect(request.headers.get('content-encoding')).toBe('aes128gcm');
      expect(request.headers.get('urgency')).toBe('high');
      expect(Number(request.headers.get('ttl'))).toBeGreaterThan(0);
      // Nothing readable travels next to the encrypted message.
      expect(decoder.decode(request.body)).not.toContain('Sales');
    }

    const toPhone = sent.find((request) => request.url === phone.endpoint) as Sent;
    const toLaptop = sent.find((request) => request.url === laptop.endpoint) as Sent;
    expect(await phone.read(toPhone.body)).toEqual({
      title: 'Sales is waiting for you',
      body: 'Wants to send 12 emails',
      url: `/v/${v.id}`,
      tag: 'sales',
      state: 'waiting',
    });
    expect(await laptop.read(toLaptop.body)).toMatchObject({
      title: 'Sales te espera',
      body: 'Wants to send 12 emails',
      state: 'waiting',
    });
    await expect(laptop.read(toPhone.body)).rejects.toThrow();

    // Each push service gets a token signed for it, with the key browsers subscribed with.
    const { publicKey } = (await (await call('/api/push/key')).json()) as { publicKey: string };
    for (const [request, audience] of [
      [toPhone, 'https://fcm.googleapis.com'],
      [toLaptop, 'https://updates.push.services.mozilla.com'],
    ] as const) {
      const token = await vapidClaims(request.headers.get('authorization'));
      expect(token.signed).toBe(true);
      expect(token.key).toBe(publicKey);
      expect(token.claims.aud).toBe(audience);
      expect(token.claims.sub).toBe(ORIGIN);
      const lifetime = token.claims.exp - Date.now() / 1000;
      expect(lifetime).toBeGreaterThan(0);
      expect(lifetime).toBeLessThanOrEqual(24 * 3600);
    }
  });

  it('says who is blocked, with an empty body when the agent says nothing', async () => {
    const v = await createVitrina();
    const english = await device('web.push.apple.com');
    const spanish = await device('wns2-by3p.notify.windows.com');
    await subscribe(v.id, english.json('en'));
    await subscribe(v.id, spanish.json('es'));
    await push(v, { agent: { id: 'data', name: 'Datos' }, state: 'blocked' });

    await expect.poll(() => sent.length).toBe(2);
    const read = (who: typeof english) =>
      who.read((sent.find((request) => request.url === who.endpoint) as Sent).body);
    expect(await read(english)).toEqual({
      title: 'Datos is blocked',
      body: '',
      url: `/v/${v.id}`,
      tag: 'data',
      state: 'blocked',
    });
    expect(await read(spanish)).toMatchObject({ title: 'Datos está bloqueado', body: '' });
  });

  it('only a change calls the person back, not the same state written again', async () => {
    const v = await createVitrina();
    const phone = await device();
    await subscribe(v.id, phone.json());
    const steps: [id: string, state: string, total: number][] = [
      ['sales', 'working', 0],
      ['sales', 'waiting', 1],
      ['sales', 'waiting', 1],
      ['sales', 'waiting', 1],
      ['sales', 'working', 1],
      ['sales', 'waiting', 2],
      // From waiting to blocked is a change into a state that needs the person.
      ['sales', 'blocked', 3],
      ['sales', 'blocked', 3],
      ['sales', 'done', 3],
      ['support', 'thinking', 3],
      // An agent that arrives already blocked.
      ['data', 'blocked', 4],
    ];
    for (const [id, state, total] of steps) {
      expect((await push(v, status(id, state, { say: `step ${sent.length}` }))).status).toBe(200);
      await expect.poll(() => sent.length).toBe(total);
    }
    await settle();
    expect(sent).toHaveLength(4);
    const messages = await Promise.all(sent.map((request) => phone.read(request.body)));
    expect(messages.map((message) => [message.tag, message.state])).toEqual([
      ['sales', 'waiting'],
      ['sales', 'waiting'],
      ['sales', 'blocked'],
      ['data', 'blocked'],
    ]);
  });

  it('calls the person back a few times a minute at most, whatever the agent does', async () => {
    const v = await createVitrina();
    const phone = await device();
    await subscribe(v.id, phone.json());
    const flip = async () => {
      expect((await push(v, status('sales', 'working'))).status).toBe(200);
      expect((await push(v, status('sales', 'waiting'))).status).toBe(200);
    };
    for (let n = 0; n < MAX_NOTIFICATIONS_PER_MINUTE + 3; n += 1) await flip();
    await settle();
    expect(sent).toHaveLength(MAX_NOTIFICATIONS_PER_MINUTE);

    // A minute later the vitrina can call again.
    const clock = Date.now;
    vi.spyOn(Date, 'now').mockImplementation(() => clock() + 61_000);
    await flip();
    await expect.poll(() => sent.length).toBe(MAX_NOTIFICATIONS_PER_MINUTE + 1);
  });

  it('forgets a device when its push service says it is gone', async () => {
    for (const gone of [410, 404]) {
      sent = [];
      const v = await createVitrina();
      const lost = await device();
      const busy = await device('updates.push.services.mozilla.com');
      const alive = await device('web.push.apple.com');
      for (const each of [lost, busy, alive]) await subscribe(v.id, each.json());
      answer = (url) =>
        new Response(null, {
          status: url === lost.endpoint ? gone : url === busy.endpoint ? 429 : 201,
        });

      await push(v, status('sales', 'waiting'));
      await expect.poll(() => sent.length).toBe(3);
      await expect.poll(() => stored(v.id)).toBe(2);

      await push(v, status('sales', 'working'));
      await push(v, status('sales', 'waiting'));
      await expect.poll(() => sent.length).toBe(5);
      await settle();
      // A push service that is busy or failing is not a reason to forget a device.
      expect(
        sent
          .slice(3)
          .map((request) => request.url)
          .sort(),
      ).toEqual([busy.endpoint, alive.endpoint].sort());
      expect(await stored(v.id)).toBe(2);
    }
  });

  it('a push service that fails or redirects never fails the write', async () => {
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const v = await createVitrina();
    const phone = await device();
    const laptop = await device('web.push.apple.com');
    await subscribe(v.id, phone.json());
    await subscribe(v.id, laptop.json());
    answer = (url) => {
      if (url === phone.endpoint) throw new TypeError(`could not reach ${url}`);
      return new Response(null, { status: 302, headers: { location: 'https://evil.example/' } });
    };

    const write = await push(v, status('sales', 'waiting', { say: 'Wants your OK' }));
    expect(write.status).toBe(200);
    expect(await write.json()).toEqual({ ok: true, seq: 1 });
    await expect.poll(() => sent.length).toBe(2);
    await settle();
    // Nobody followed the redirect, both devices are kept, and the vitrina is intact.
    expect(sent.map((request) => new URL(request.url).hostname).sort()).toEqual([
      'fcm.googleapis.com',
      'web.push.apple.com',
    ]);
    expect(await stored(v.id)).toBe(2);
    const snapshot = (await (await call(`/api/vitrinas/${v.id}`)).json()) as { agents: Json[] };
    expect(snapshot.agents).toMatchObject([{ state: 'waiting', say: 'Wants your OK' }]);
    // What is logged never carries an address.
    const logged = JSON.stringify(warnings.mock.calls);
    expect(warnings.mock.calls.length).toBe(2);
    expect(logged).not.toContain('googleapis');
    expect(logged).not.toContain(phone.endpoint);
  });

  it('stops when the device unsubscribes', async () => {
    const v = await createVitrina();
    const phone = await device();
    const laptop = await device('updates.push.services.mozilla.com');
    await subscribe(v.id, phone.json());
    await subscribe(v.id, laptop.json());
    expect((await unsubscribe(v.id, phone.endpoint)).status).toBe(200);
    await push(v, status('sales', 'waiting'));
    await expect.poll(() => sent.length).toBe(1);
    await settle();
    expect(sent.map((request) => request.url)).toEqual([laptop.endpoint]);
  });

  it('an agent that reports over MCP calls the person back too', async () => {
    const v = await createVitrina();
    const phone = await device();
    await subscribe(v.id, phone.json());
    const response = await call(`/mcp/${v.id}`, {
      method: 'POST',
      key: v.key,
      json: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'glimo_status',
          arguments: { agent: 'claude-code', name: 'Claude Code', state: 'waiting' },
        },
      },
    });
    expect(response.status).toBe(200);
    await expect.poll(() => sent.length).toBe(1);
    expect(await phone.read((sent[0] as Sent).body)).toMatchObject({
      title: 'Claude Code is waiting for you',
      tag: 'claude-code',
    });
  });

  it('without keys nothing is sent and the write is the same as ever', async () => {
    const v = await createVitrina();
    const phone = await device();
    await subscribe(v.id, phone.json());
    const subscribers = [
      { ...phone.json(), ...phone.json().keys, locale: 'en' as const, site: ORIGIN },
    ];
    const message = () => ({
      title: 't',
      body: '',
      url: '/v/x',
      tag: 'a',
      state: 'waiting' as const,
    });
    expect(await notifySubscribers({}, subscribers, message)).toEqual([]);
    expect(
      await notifySubscribers({ VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY }, subscribers, message),
    ).toEqual([]);

    // The same inside the vitrina: its keys are taken away, then given back.
    const setKeys = (keys: Pick<Env, 'VAPID_PRIVATE_KEY'>) =>
      runInDurableObject(stubOf(v.id), (instance) => {
        const object = instance as unknown as { env: Env };
        object.env = { ...object.env, ...keys };
      });
    await setKeys({ VAPID_PRIVATE_KEY: undefined });
    const write = await push(v, status('sales', 'waiting'));
    expect(write.status).toBe(200);
    expect(await write.json()).toEqual({ ok: true, seq: 1 });
    await settle();
    expect(sent).toHaveLength(0);
    expect(await stored(v.id)).toBe(1);

    await setKeys({ VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY });
    await push(v, status('data', 'blocked'));
    await expect.poll(() => sent.length).toBe(1);
    expect(await phone.read((sent[0] as Sent).body)).toMatchObject({ tag: 'data' });
  });

  it('subscriptions disappear with the vitrina when it expires', async () => {
    const v = await createVitrina();
    const phone = await device();
    await subscribe(v.id, phone.json());
    await subscribe(v.id, (await device('web.push.apple.com')).json());
    expect(await stored(v.id)).toBe(2);

    const stub = stubOf(v.id);
    await runInDurableObject(stub, async (instance, state) => {
      (instance as unknown as { meta: { lastActive: number } }).meta.lastActive = 0;
      await state.storage.setAlarm(Date.now() + 1000);
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);

    expect(await stored(v.id)).toBe(0);
    expect((await subscribe(v.id, phone.json())).status).toBe(404);
    expect((await unsubscribe(v.id, phone.endpoint)).status).toBe(404);
    expect((await push(v, status('sales', 'waiting'))).status).toBe(404);
    await settle();
    expect(sent).toHaveLength(0);
  });
});
