// Thin client for the Glimo REST API (same origin).

import type { GlimoStatus } from '@glimo/spec';

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
