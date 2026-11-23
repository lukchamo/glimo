// Glimo service worker. One job: when a glim needs you, show a notification, and take you
// to its vitrina when you tap it.
//
// It does not answer network requests and it stores nothing, so it can never serve a
// stale page. It is registered only when a person asks for notifications.

const ICON = '/icon-192.png';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/** What to say when a push arrives empty or unreadable: browsers require a notification. */
function generic() {
  const language = String(self.navigator?.language ?? '').toLowerCase();
  return {
    title: 'Glimo',
    body: language.startsWith('es') ? 'Un glim te necesita.' : 'A glim needs you.',
  };
}

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * The only place a notification may lead to: a path on this origin that starts with /v/.
 * Anything else (another site, another page, not a string) is ignored.
 */
function vitrinaPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/v/')) return null;
  try {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin || !url.pathname.startsWith('/v/')) return null;
    const path = url.pathname.replace(/\/+$/, '');
    return path.length > '/v'.length ? path : null;
  } catch {
    return null;
  }
}

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    const parsed = event.data ? event.data.json() : null;
    if (parsed && typeof parsed === 'object') payload = parsed;
  } catch {
    // Not JSON: the generic text below.
  }
  const fallback = generic();
  const title = text(payload.title, 120);
  const body = text(payload.body, 300);
  event.waitUntil(
    self.registration.showNotification(title || fallback.title, {
      body: body || (title ? '' : fallback.body),
      // One notification per agent: a newer one replaces it and alerts again.
      tag: text(payload.tag, 64) || 'glimo',
      renotify: true,
      icon: ICON,
      badge: ICON,
      data: { url: vitrinaPath(payload.url) },
    }),
  );
});

async function show(path) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  // Already open on that vitrina (with or without a key in its address): go there.
  // Without an address we trust: bring Glimo forward if it is open, or open its home page.
  const open = path
    ? windows.find((client) => vitrinaPath(new URL(client.url).pathname) === path)
    : windows[0];
  const target = path ?? '/';
  if (!open) return self.clients.openWindow(target);
  return open.focus().catch(() => self.clients.openWindow(target));
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(show(vitrinaPath(event.notification.data?.url)));
});
