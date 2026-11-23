// The wall clock, for "waiting for 12 min". It is null until the component is mounted, so
// prerendered HTML and the first client render agree. After that it moves on one slow
// timer, and only while somebody needs it and the tab is visible.

import { useLayoutEffect, useState } from 'react';

const EVERY = 30_000;

export function useNow(active: boolean): number | null {
  const [now, setNow] = useState<number | null>(null);

  // A layout effect: the time is in place before the browser paints what needs it.
  useLayoutEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      clearInterval(timer);
      timer = undefined;
      if (document.hidden) return;
      setNow(Date.now());
      timer = setInterval(() => setNow(Date.now()), EVERY);
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [active]);

  return active ? now : null;
}
