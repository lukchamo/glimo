// A tiny router: real links first (they work without JavaScript), client navigation on top.

import { type MouseEvent, useEffect, useState } from 'react';

const EVENT = 'glimo:navigate';

export function navigate(to: string): void {
  if (to === location.pathname + location.search + location.hash) return;
  history.pushState(null, '', to);
  window.dispatchEvent(new Event(EVENT));
  const { hash } = new URL(to, location.origin);
  if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  else window.scrollTo(0, 0);
}

/** Current pathname, starting from the one the page was rendered for. */
export function usePath(initial: string): string {
  const [path, setPath] = useState(initial);
  useEffect(() => {
    const sync = () => setPath(location.pathname);
    window.addEventListener('popstate', sync);
    window.addEventListener(EVENT, sync);
    sync();
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener(EVENT, sync);
    };
  }, []);
  return path;
}

/** onClick for internal links: plain left clicks navigate in place, everything else is the browser's. */
export function onLinkClick(event: MouseEvent<HTMLAnchorElement>): void {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  const anchor = event.currentTarget;
  if (anchor.target && anchor.target !== '_self') return;
  const url = new URL(anchor.href, location.href);
  if (url.origin !== location.origin) return;
  // Same page, only the hash differs: let the browser scroll.
  if (url.pathname === location.pathname && url.hash) return;
  event.preventDefault();
  navigate(url.pathname + url.search + url.hash);
}
