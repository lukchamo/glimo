// Live vitrina: paints instantly from the last snapshot this browser saw, then follows
// one WebSocket with incremental messages. Falls back to polling when sockets are blocked.

import {
  applyLiveEvent,
  EMPTY_VITRINA,
  type GlimoStatus,
  isLiveEvent,
  type LiveEvent,
  type VitrinaState,
} from '@glimo/spec';
import { useEffect, useMemo, useRef, useState } from 'react';
import { readJson, writeJson } from './api';

export type Connection = 'connecting' | 'live' | 'offline' | 'missing';

const cacheName = (id: string) => `glimo:v:${id}`;

export function useLiveVitrina(
  id: string | null,
  onEvent?: (event: LiveEvent) => void,
): { agents: GlimoStatus[]; connection: Connection; seq: number } {
  const [state, setState] = useState<VitrinaState>(EMPTY_VITRINA);
  const [connection, setConnection] = useState<Connection>('connecting');
  const listener = useRef(onEvent);
  listener.current = onEvent;

  useEffect(() => {
    if (!id) return;
    // 1. Instant paint from the cache (stale-while-revalidate, in the browser).
    setState(readJson<VitrinaState>(cacheName(id)) ?? EMPTY_VITRINA);
    setConnection('connecting');

    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    let attempts = 0;
    let stopped = false;

    const apply = (event: LiveEvent) => {
      setState((previous) => applyLiveEvent(previous, event));
      listener.current?.(event);
    };

    // 3. When the socket cannot open: is the vitrina gone, or is it just the network?
    const probe = async () => {
      try {
        const response = await fetch(`/api/vitrinas/${id}`);
        if (stopped) return;
        if (response.status === 404) {
          setConnection('missing');
          writeJson(cacheName(id), null);
          return;
        }
        if (response.ok) {
          const snapshot = (await response.json()) as { seq: number; agents: GlimoStatus[] };
          apply({ t: 'snapshot', seq: snapshot.seq, agents: snapshot.agents });
        }
      } catch {
        // Offline: keep showing what we have.
      }
      if (stopped) return;
      attempts += 1;
      // Exponential backoff with jitter, capped at 20 s.
      const delay = Math.min(20_000, 600 * 2 ** attempts) * (0.6 + Math.random() * 0.4);
      retry = setTimeout(connect, delay);
    };

    // 2. One WebSocket, incremental messages.
    const connect = () => {
      if (stopped) return;
      clearTimeout(retry);
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${scheme}://${location.host}/api/vitrinas/${id}/live`);
      socket.onopen = () => {
        attempts = 0;
        setConnection('live');
        // The server answers "pong" without waking the vitrina.
        ping = setInterval(() => socket?.readyState === 1 && socket.send('ping'), 30_000);
      };
      socket.onmessage = (message) => {
        if (message.data === 'pong') return;
        try {
          const event: unknown = JSON.parse(String(message.data));
          if (isLiveEvent(event)) apply(event);
        } catch {
          // Ignore anything that is not ours.
        }
      };
      socket.onclose = () => {
        clearInterval(ping);
        if (stopped) return;
        setConnection((current) => (current === 'missing' ? current : 'offline'));
        void probe();
      };
    };

    const onVisible = () => {
      if (!document.hidden && socket?.readyState !== 1 && socket?.readyState !== 0) {
        attempts = 0;
        connect();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    connect();

    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(ping);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      socket?.close(1000);
    };
  }, [id]);

  // Remember the last snapshot for the next visit.
  useEffect(() => {
    if (!id || state === EMPTY_VITRINA) return;
    const timer = setTimeout(() => writeJson(cacheName(id), state), 250);
    return () => clearTimeout(timer);
  }, [id, state]);

  const agents = useMemo(() => Object.values(state.agents), [state.agents]);
  return { agents, connection, seq: state.seq };
}
