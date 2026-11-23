// Thin client for the Glimo REST API (same origin).

import type { GlimoStatus, Locale } from '@glimo/spec';

export interface CreatedVitrina {
  id: string;
  key: string;
  url: string;
  api: string;
  mcp: string;
  expiresAt: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit & { key?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.key) headers.set('authorization', `Bearer ${init.key}`);
  if (init.body) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(
      response.status,
      body?.error?.code ?? 'error',
      body?.error?.message ?? `Request failed (${response.status})`,
    );
  }
  return (await response.json()) as T;
}

export const createVitrina = () => request<CreatedVitrina>('/api/vitrinas', { method: 'POST' });

export const pushStatus = (
  id: string,
  key: string,
  status: Partial<GlimoStatus> & Pick<GlimoStatus, 'agent' | 'state'>,
) =>
  request<{ ok: true; seq: number }>(`/api/vitrinas/${id}/status`, {
    method: 'POST',
    key,
    body: JSON.stringify(status),
  });

export const removeAgent = (id: string, key: string, agentId: string) =>
  request<{ ok: true }>(`/api/vitrinas/${id}/agents/${agentId}`, { method: 'DELETE', key });

export const sendAction = (
  id: string,
  key: string,
  action: { agentId: string; actionId: string; confirm?: boolean; note?: string },
) =>
  request<{ ok: true }>(`/api/vitrinas/${id}/actions`, {
    method: 'POST',
    key,
    body: JSON.stringify(action),
  });

// ---------- notifications ----------
// Watching is a read capability, and so is being told: these calls carry no key.

/** The key this deployment signs push messages with, or why there is none to use. */
export type PushKey =
  | { publicKey: string }
  | { publicKey: null; reason: 'not-configured' | 'unreachable' };

export async function pushKey(): Promise<PushKey> {
  try {
    const { publicKey } = await request<{ publicKey?: unknown }>('/api/push/key');
    if (typeof publicKey === 'string' && publicKey) return { publicKey };
    return { publicKey: null, reason: 'not-configured' };
  } catch (cause) {
    const off = cause instanceof ApiError && cause.code === 'push_not_configured';
    return { publicKey: null, reason: off ? 'not-configured' : 'unreachable' };
  }
}

export const subscribePush = (id: string, subscription: PushSubscriptionJSON, locale: Locale) =>
  request<{ ok: true }>(`/api/vitrinas/${id}/push`, {
    method: 'POST',
    body: JSON.stringify({ ...subscription, locale }),
  });

export const unsubscribePush = (id: string, endpoint: string) =>
  request<{ ok: true }>(`/api/vitrinas/${id}/push`, {
    method: 'DELETE',
    body: JSON.stringify({ endpoint }),
  });

// ---------- what this browser remembers ----------

const read = (name: string): string | null => {
  try {
    return localStorage.getItem(name);
  } catch {
    return null;
  }
};
const write = (name: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(name);
    else localStorage.setItem(name, value);
  } catch {
    // Private mode or storage disabled: the page simply does not remember.
  }
};

export const keyFor = (id: string) => read(`glimo:key:${id}`);
export const rememberKey = (id: string, key: string) => write(`glimo:key:${id}`, key);

/** The push endpoint this device subscribed to a vitrina with, if it did. */
export const PUSH_PREFIX = 'glimo:push:';
export const pushFor = (id: string) => read(`${PUSH_PREFIX}${id}`);
export const rememberPush = (id: string, endpoint: string | null) =>
  write(`${PUSH_PREFIX}${id}`, endpoint);

export function playgroundVitrina(): CreatedVitrina | null {
  try {
    const raw = read('glimo:playground');
    return raw ? (JSON.parse(raw) as CreatedVitrina) : null;
  } catch {
    return null;
  }
}
export const rememberPlayground = (vitrina: CreatedVitrina | null) =>
  write('glimo:playground', vitrina ? JSON.stringify(vitrina) : null);

export const readJson = <T>(name: string): T | null => {
  try {
    const raw = read(name);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
export const writeJson = (name: string, value: unknown) => write(name, JSON.stringify(value));
