// Identifiers, keys, hashing and response hardening for the edge Worker.

const encoder = new TextEncoder();

/** Crockford base32, lowercase: no i, l, o, u. URL-safe and easy to read aloud. */
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

export const VITRINA_ID_PATTERN = /^v[0-9a-hjkmnp-tv-z]{24}$/;
export const KEY_PATTERN = /^gk_[A-Za-z0-9_-]{43}$/;

function base32(bytes: Uint8Array): string {
  let out = '';
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

/**
 * A vitrina id is a capability: whoever has it can watch. It carries its own proof of
 * origin (a truncated HMAC), so made-up ids are rejected at the edge without waking a
 * Durable Object or touching the database.
 *
 *   v + 16 chars (80 random bits) + 8 chars (40 bits of HMAC-SHA256)
 */
export async function createVitrinaId(secret: string): Promise<string> {
  const random = base32(crypto.getRandomValues(new Uint8Array(10)));
  const mac = base32((await hmac(secret, `vitrina:${random}`)).subarray(0, 5));
  return `v${random}${mac}`;
}

export async function isIssuedVitrinaId(secret: string, id: string): Promise<boolean> {
  if (!VITRINA_ID_PATTERN.test(id)) return false;
  const random = id.slice(1, 17);
  const expected = base32((await hmac(secret, `vitrina:${random}`)).subarray(0, 5));
  return timingSafeEqual(id.slice(17), expected);
}

/** The write key of a vitrina: 256 random bits. Shown once, never stored. */
export function createKey(): string {
  return `gk_${base64url(crypto.getRandomValues(new Uint8Array(32)))}`;
}

/** Only the SHA-256 of a key is ever stored. */
export async function hashKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(key));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.byteLength !== right.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < left.byteLength; i++) diff |= (left[i] as number) ^ (right[i] as number);
  return diff === 0;
}

/** Reads `Authorization: Bearer gk_…`. Keys are never accepted in the URL (they would be logged). */
export function bearerKey(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  const key = match?.[1];
  return key && KEY_PATTERN.test(key) ? key : null;
}

/**
 * Reads a JSON body with a hard size limit. The limit is enforced while reading,
 * not trusted from Content-Length.
 */
export async function readJson(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413 | 415; message: string }> {
  const type = request.headers.get('content-type') ?? '';
  if (!/^application\/json\b/i.test(type)) {
    return { ok: false, status: 415, message: 'Send JSON with Content-Type: application/json.' };
  }
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > maxBytes) {
    return { ok: false, status: 413, message: `The body is larger than ${maxBytes} bytes.` };
  }
  if (!request.body) return { ok: false, status: 400, message: 'The body is empty.' };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false, status: 413, message: `The body is larger than ${maxBytes} bytes.` };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, status: 400, message: 'The body is not valid JSON.' };
  }
}

/** Content Security Policy for HTML. Keep in sync with apps/web/public/_headers (tested). */
export const HTML_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

export const BASE_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy':
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=(), browsing-topics=()',
  'cross-origin-opener-policy': 'same-origin',
  'x-frame-options': 'DENY',
};

/** Headers for JSON answers: nothing in them should ever be rendered or framed. */
export const API_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  ...BASE_SECURITY_HEADERS,
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'cross-origin-resource-policy': 'same-origin',
  'referrer-policy': 'no-referrer',
};

/**
 * Browsers always send Origin on cross-site requests and WebSocket handshakes. Agents and
 * CLIs do not send it. We accept "no Origin" and "same origin", and nothing else.
 */
export function isAllowedOrigin(request: Request, extra: readonly string[] = []): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  if (origin === new URL(request.url).origin) return true;
  return extra.includes(origin);
}
