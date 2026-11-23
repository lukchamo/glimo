// Drives the example vitrina of the home page: a scripted team that keeps working,
// reacts to what the visitor decides, and stops when nobody is looking.

import { motionPaused } from '@glimo/glim';
import type { GlimoStatus, Locale } from '@glimo/spec';
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEMO_AFTER,
  DEMO_AGENTS,
  DEMO_EPOCH,
  DEMO_SCRIPT,
  type DemoStatus,
  toStatus,
} from './demo';

type Team = Record<string, DemoStatus>;

const initialTeam = (): Team =>
  Object.fromEntries(DEMO_AGENTS.map((agent) => [agent.id, agent.initial]));

export function useDemoVitrina(locale: Locale): {
  agents: GlimoStatus[];
  playing: boolean;
  setPlaying: (playing: boolean) => void;
  decide: (agentId: string, actionId: string) => boolean;
  stage: RefObject<HTMLDivElement | null>;
} {
  const [team, setTeam] = useState<Team>(initialTeam);
  const [playing, setPlaying] = useState(true);
  const stage = useRef<HTMLDivElement>(null);
  const visible = useRef(true);
  // Agents the visitor just directed are left alone by the script for a while.
  const busyUntil = useRef<Record<string, number>>({});
  const stamps = useRef<Record<string, string>>({});
  const cache = useRef(new WeakMap<DemoStatus, Partial<Record<Locale, GlimoStatus>>>());

  const update = useCallback((agentId: string, status: DemoStatus) => {
    stamps.current[agentId] = new Date().toISOString();
    setTeam((previous) => ({ ...previous, [agentId]: status }));
  }, []);

  useEffect(() => {
    const element = stage.current;
    if (!element || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      visible.current = entry?.isIntersecting ?? true;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    let step = 0;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      const [seconds, agentId, status] = DEMO_SCRIPT[step % DEMO_SCRIPT.length] as [
        number,
        string,
        DemoStatus,
      ];
      timer = setTimeout(() => {
        const idle = document.hidden || !visible.current || motionPaused();
        if (!idle) {
          if ((busyUntil.current[agentId] ?? 0) < Date.now()) update(agentId, status);
          step += 1;
        }
        next();
      }, seconds * 1000);
    };
    next();
    return () => clearTimeout(timer);
  }, [playing, update]);

  const decide = useCallback(
    (agentId: string, actionId: string) => {
      const after = DEMO_AFTER[`${agentId}:${actionId}`];
      if (!after) return false;
      busyUntil.current[agentId] = Date.now() + 16_000;
      update(agentId, after[0]);
      setTimeout(() => update(agentId, after[1]), 2800);
      return true;
    },
    [update],
  );

  const agents = useMemo(
    () =>
      DEMO_AGENTS.map((agent) => {
        const status = team[agent.id] as DemoStatus;
        let byLocale = cache.current.get(status);
        if (!byLocale) {
          byLocale = {};
          cache.current.set(status, byLocale);
        }
        byLocale[locale] ??= toStatus(
          agent,
          status,
          locale,
          stamps.current[agent.id] ?? DEMO_EPOCH,
        );
        return byLocale[locale] as GlimoStatus;
      }),
    [team, locale],
  );

  return { agents, playing, setPlaying, decide, stage };
}
