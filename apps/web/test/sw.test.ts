import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

// The service worker is plain JavaScript served as it is. Here it runs against a small
// stand-in for the worker scope, so what it shows and where it leads can be checked.
const SOURCE = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://glimo.test';

interface Shown {
  title: string;
  options: {
    body: string;
    tag: string;
    renotify: boolean;
    icon: string;
    badge: string;
    data: { url: string | null };
  };
}

function boot(options: { windows?: string[]; language?: string; focusFails?: boolean } = {}) {
  const listeners = new Map<string, (event: never) => void>();
  const shown: Shown[] = [];
  const opened: string[] = [];
  const focused: string[] = [];
  const calls: string[] = [];
  const self = {
    location: { origin: ORIGIN },
    navigator: { language: options.language ?? 'en-US' },
    addEventListener: (type: string, listener: (event: never) => void) => {
      listeners.set(type, listener);
    },
    skipWaiting: () => {
      calls.push('skipWaiting');
      return Promise.resolve();
    },
    registration: {
      showNotification: (title: string, opts: Shown['options']) => {
        shown.push({ title, options: opts });
        return Promise.resolve();
      },
    },
    clients: {
      claim: () => {
        calls.push('claim');
        return Promise.resolve();
      },
      matchAll: (query: unknown) => {
        calls.push(`matchAll ${JSON.stringify(query)}`);
        return Promise.resolve(
          (options.windows ?? []).map((url) => ({
            url,
            focus: () => {
              if (options.focusFails) return Promise.reject(new Error('not allowed'));
              focused.push(url);
              return Promise.resolve();
            },
          })),
        );
      },
      openWindow: (url: string) => {
        opened.push(url);
        return Promise.resolve(null);
      },
    },
  };
  runInNewContext(SOURCE, { self, URL });

  /** Dispatches an event and waits for everything it handed to waitUntil. */
  const dispatch = async (type: string, event: object = {}) => {
    const pending: Promise<unknown>[] = [];
    const listener = listeners.get(type);
    if (!listener) throw new Error(`no listener for ${type}`);
    listener({
      ...event,
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    } as never);
    await Promise.all(pending);
    return pending.length;
  };
  const push = (data: unknown) =>
    dispatch('push', {
      data: data === undefined ? null : { json: () => JSON.parse(data as string) },
    });
  const click = async (url: unknown) => {
    let closed = false;
    await dispatch('notificationclick', {
      notification: {
        data: url === undefined ? undefined : { url },
        close: () => {
          closed = true;
        },
      },
    });
    return closed;
  };
  return { listeners, shown, opened, focused, calls, dispatch, push, click };
}

const PAYLOAD = {
  title: 'Sales is waiting for you',
  body: 'Wants to send 12 emails',
  url: '/v/v0123456789abcdefghjkmnpq',
  tag: 'sales',
  state: 'waiting',
};

describe('service worker', () => {
  it('listens to four things, and the network is not one of them', () => {
    const worker = boot();
    expect([...worker.listeners.keys()].sort()).toEqual([
      'activate',
      'install',
      'notificationclick',
      'push',
    ]);
    // No fetch handler and no cache, in any spelling: it can never serve a stale page.
    expect(SOURCE).not.toMatch(/['"`]fetch['"`]|onfetch|caches\b|\bCache\b|importScripts/);
  });

  it('takes over at once: there is nothing to keep an old version around for', async () => {
    const worker = boot();
    await worker.dispatch('install');
    expect(await worker.dispatch('activate')).toBe(1);
    expect(worker.calls).toEqual(['skipWaiting', 'claim']);
  });

  it('shows what the server sent: first the agent, then what is going on', async () => {
    const worker = boot();
    expect(await worker.push(JSON.stringify(PAYLOAD))).toBe(1);
    expect(worker.shown).toEqual([
      {
        title: 'Sales is waiting for you',
        options: {
          body: 'Wants to send 12 emails',
          tag: 'sales',
          renotify: true,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          data: { url: '/v/v0123456789abcdefghjkmnpq' },
        },
      },
    ]);
  });

  it.each([
    ['nothing at all', undefined],
    ['something that is not JSON', 'Sales is waiting'],
    ['JSON that is not an object', '"hello"'],
    ['null', 'null'],
    ['an empty object', '{}'],
    ['the wrong types', '{"title":12,"body":{"a":1},"tag":["x"],"url":7}'],
    ['only spaces', '{"title":"   ","body":""}'],
  ])('always shows something, even with %s', async (_name, data) => {
    const worker = boot();
    expect(await worker.push(data)).toBe(1);
    expect(worker.shown).toHaveLength(1);
    const [{ title, options }] = worker.shown as [Shown];
    expect(title).toBe('Glimo');
    expect(options.body).toBe('A glim needs you.');
    // `renotify` is only allowed together with a tag.
    expect(options.tag).toBe('glimo');
    expect(options.renotify).toBe(true);
    expect(options.data).toEqual({ url: null });
  });

  it('the generic text follows the language of the device', async () => {
    const worker = boot({ language: 'es-CO' });
    await worker.push(undefined);
    expect(worker.shown[0]).toMatchObject({
      title: 'Glimo',
      options: { body: 'Un glim te necesita.' },
    });
  });

  it('keeps a title without a body, and a body without a title', async () => {
    const worker = boot();
    await worker.push(JSON.stringify({ title: 'Data is blocked' }));
    await worker.push(JSON.stringify({ body: 'Its credential expired' }));
    expect(worker.shown.map(({ title, options }) => [title, options.body])).toEqual([
      ['Data is blocked', ''],
      ['Glimo', 'Its credential expired'],
    ]);
  });

  it.each([
    ['https://evil.example/v/v0123456789abcdefghjkmnpq'],
    ['//evil.example/v/v0123456789abcdefghjkmnpq'],
    [`${ORIGIN}/v/v0123456789abcdefghjkmnpq`],
    ['/playground'],
    ['/'],
    ['/v/'],
    ['/v/../playground'],
    ['/v/%2e%2e/playground'],
    ['v/v0123456789abcdefghjkmnpq'],
    ['javascript:alert(1)'],
    [''],
    [42],
    [null],
  ])('ignores an address that is not a vitrina on this origin: %j', async (url) => {
    const worker = boot();
    await worker.push(JSON.stringify({ ...PAYLOAD, url }));
    expect(worker.shown[0]?.options.data).toEqual({ url: null });
    // And again on the way out: what a notification carries is not trusted either.
    expect(await worker.click(url)).toBe(true);
    expect(worker.opened).toEqual(['/']);
  });

  it('drops the query and the fragment: a notification never carries a key', async () => {
    const worker = boot();
    await worker.push(JSON.stringify({ ...PAYLOAD, url: `${PAYLOAD.url}/?x=1#k=gk_secret` }));
    expect(worker.shown[0]?.options.data).toEqual({ url: PAYLOAD.url });
  });

  it('a tap closes the notification and opens the vitrina', async () => {
    const worker = boot({ windows: [`${ORIGIN}/playground`] });
    expect(await worker.click(PAYLOAD.url)).toBe(true);
    expect(worker.calls).toContain('matchAll {"type":"window","includeUncontrolled":true}');
    expect(worker.focused).toEqual([]);
    expect(worker.opened).toEqual([PAYLOAD.url]);
  });

  it('a tap goes to the window that already has that vitrina open', async () => {
    const worker = boot({
      windows: [
        `${ORIGIN}/`,
        `${ORIGIN}/v/vzzzzzzzzzzzzzzzzzzzzzzzz`,
        `${ORIGIN}${PAYLOAD.url}#k=gk_secret`,
      ],
    });
    await worker.click(PAYLOAD.url);
    expect(worker.focused).toEqual([`${ORIGIN}${PAYLOAD.url}#k=gk_secret`]);
    expect(worker.opened).toEqual([]);
  });

  it('opens the vitrina when the open window cannot be brought forward', async () => {
    const worker = boot({ windows: [`${ORIGIN}${PAYLOAD.url}`], focusFails: true });
    await worker.click(PAYLOAD.url);
    expect(worker.opened).toEqual([PAYLOAD.url]);
  });

  it('without an address it brings Glimo forward, or opens the home page', async () => {
    const open = boot({ windows: [`${ORIGIN}/playground`] });
    await open.click(undefined);
    expect(open.focused).toEqual([`${ORIGIN}/playground`]);
    expect(open.opened).toEqual([]);

    const closed = boot();
    await closed.click(undefined);
    expect(closed.opened).toEqual(['/']);
  });
});
