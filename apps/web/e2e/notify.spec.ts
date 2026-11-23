import { expect, type Page, type Request, test } from '@playwright/test';

// Notifications and "it has been waiting for you", in the browser.
//
// Everything the page talks to is mocked here (the API, the live channel, and the parts of
// Web Push a headless browser does not have), so these tests say the same thing against
// the local Worker, a deployment or a static build.

const ID = 'v0123456789abcdefghjkmnpq';
const OTHER = 'vzyxwvtsrqpnmkjhgfedcba98';
// The example key of the Web Push codelabs: a real uncompressed P-256 point, base64url.
const PUBLIC_KEY =
  'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
const ENDPOINT = 'https://push.example.test/send/device-1';
const KEYS = {
  p256dh: 'BLc4xRzKlKORKWlbdgFaBrrPK3ydWAHo4M0gs0i1oEKg',
  auth: '5I2Bu2oKdyy9CwL8QVF0NQ',
};

const MINUTE = 60_000;
const agent = (
  id: string,
  name: string,
  state: string,
  say: string,
  minutesAgo: number,
  actions?: object[],
) => ({
  spec: 'glimo/0.1',
  agent: { id, name },
  state,
  say,
  ...(actions ? { actions } : {}),
  // A few seconds past the minute, so the words do not change while a test looks at them.
  updatedAt: new Date(Date.now() - minutesAgo * MINUTE - 5000).toISOString(),
});
const sales = (minutesAgo = 12) =>
  agent('sales', 'Sales', 'waiting', 'Wants to send 12 emails', minutesAgo, [
    { id: 'approve', label: 'Approve sending', kind: 'primary', sensitive: true },
  ]);
const support = () => agent('support', 'Support', 'working', 'On ticket 18 of 40', 3);
const data = (minutesAgo = 125) =>
  agent('data', 'Data', 'blocked', 'Its credential expired', minutesAgo);

interface Mock {
  /** Calls to POST and DELETE /api/vitrinas/:id/push, in order. */
  push: Request[];
  /** How many times the page asked for the server key. */
  keyRequests: () => number;
}

/** A vitrina that only exists in this test: snapshot, live channel and the push endpoints. */
async function mockApi(
  page: Page,
  agents: object[],
  options: { key?: 'ok' | 'not-configured'; subscribe?: number } = {},
): Promise<Mock> {
  const push: Request[] = [];
  let keyRequests = 0;
  const snapshot = (id: string) => ({
    id,
    seq: 3,
    agents,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * MINUTE).toISOString(),
  });

  // The live channel answers at once with what is there, like the real one.
  await page.routeWebSocket(/\/api\/vitrinas\/[^/]+\/live$/, (socket) => {
    socket.onMessage((message) => {
      if (message === 'ping') socket.send('pong');
    });
    socket.send(JSON.stringify({ t: 'snapshot', seq: 3, agents }));
  });

  // Routes added later win: anything not described below does not exist.
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'Not found' } } }),
  );
  await page.route(/\/api\/vitrinas\/v[0-9a-z]{24}$/, (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop() as string;
    return route.fulfill({ json: snapshot(id) });
  });
  await page.route('**/api/vitrinas', (route) =>
    route.fulfill({
      status: 201,
      json: {
        id: ID,
        key: `gk_${'k'.repeat(43)}`,
        url: `/v/${ID}`,
        api: `/api/vitrinas/${ID}`,
        mcp: `/mcp/${ID}`,
        expiresAt: snapshot(ID).expiresAt,
      },
    }),
  );
  await page.route('**/api/push/key', (route) => {
    keyRequests += 1;
    return options.key === 'not-configured'
      ? route.fulfill({
          status: 503,
          json: { error: { code: 'push_not_configured', message: 'Push is not configured' } },
        })
      : route.fulfill({ json: { publicKey: PUBLIC_KEY } });
  });
  await page.route(/\/api\/vitrinas\/v[0-9a-z]{24}\/push$/, (route) => {
    const request = route.request();
    push.push(request);
    const created = request.method() === 'POST';
    const status = created ? (options.subscribe ?? 201) : 200;
    return route.fulfill({
      status,
      json: status < 400 ? { ok: true } : { error: { code: 'error', message: 'Failed' } },
    });
  });
  return { push, keyRequests: () => keyRequests };
}

interface PushLog {
  /** [script, scope] of every service worker registration the page asked for. */
  registered: [string, string | undefined][];
  /** `userVisibleOnly` and the server key (as bytes) of every subscription asked for. */
  subscribed: { userVisibleOnly: boolean | undefined; key: number[] }[];
  unsubscribed: number;
  asked: number;
}
declare global {
  interface Window {
    __push: PushLog;
  }
}

/**
 * Headless Chromium cannot ask for permission or reach a push service. This stands in
 * for `Notification`, `navigator.serviceWorker` and `PushManager`, records what the page
 * asks of them, and remembers the result across reloads like a browser would.
 */
async function stubPush(
  page: Page,
  options: { permission?: NotificationPermission; answer?: NotificationPermission } = {},
) {
  await page.addInitScript(
    ({ permission, answer, endpoint, keys }) => {
      const STORE = 'stub:push';
      const saved = JSON.parse(sessionStorage.getItem(STORE) ?? 'null') as {
        permission: NotificationPermission;
        registered: boolean;
        key: number[] | null;
      } | null;
      const state = saved ?? { permission, registered: false, key: null };
      const save = () => sessionStorage.setItem(STORE, JSON.stringify(state));
      const log: PushLog = { registered: [], subscribed: [], unsubscribed: 0, asked: 0 };
      window.__push = log;

      const subscription = () =>
        state.key && {
          endpoint,
          expirationTime: null,
          options: {
            userVisibleOnly: true,
            applicationServerKey: new Uint8Array(state.key).buffer,
          },
          toJSON: () => ({ endpoint, expirationTime: null, keys }),
          unsubscribe: async () => {
            state.key = null;
            save();
            log.unsubscribed += 1;
            return true;
          },
        };
      const registration = {
        scope: `${location.origin}/`,
        pushManager: {
          getSubscription: async () => subscription() || null,
          subscribe: async (asked: {
            userVisibleOnly?: boolean;
            applicationServerKey: Uint8Array;
          }) => {
            log.subscribed.push({
              userVisibleOnly: asked.userVisibleOnly,
              key: [...asked.applicationServerKey],
            });
            state.key = [...asked.applicationServerKey];
            save();
            return subscription();
          },
        },
      };

      const notification = {
        get permission() {
          return state.permission;
        },
        requestPermission: async () => {
          log.asked += 1;
          if (state.permission === 'default') state.permission = answer;
          save();
          return state.permission;
        },
      };
      Object.defineProperty(window, 'Notification', { configurable: true, value: notification });
      Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} });
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
          register: async (script: string, registerOptions?: { scope?: string }) => {
            log.registered.push([script, registerOptions?.scope]);
            state.registered = true;
            save();
            return registration;
          },
          getRegistration: async () => (state.registered ? registration : undefined),
          get ready() {
            return state.registered ? Promise.resolve(registration) : new Promise(() => {});
          },
        },
      });
    },
    {
      permission: options.permission ?? 'default',
      answer: options.answer ?? 'granted',
      endpoint: ENDPOINT,
      keys: KEYS,
    },
  );
}

const control = (page: Page) => page.locator('.notify');
const turnOn = (page: Page) => page.getByRole('button', { name: 'Notify me when a glim needs me' });
const turnOff = (page: Page) => page.getByRole('button', { name: 'Turn off notifications' });
const log = (page: Page) => page.evaluate(() => window.__push);

test.describe('notifications', () => {
  test('stay out of the way when this deployment has no push', async ({ page }) => {
    const api = await mockApi(page, [sales()], { key: 'not-configured' });
    await stubPush(page);
    await page.goto(`/v/${ID}`);
    await expect(page.locator('.vitrina__cell')).toHaveCount(1);
    await expect.poll(api.keyRequests).toBe(1);
    await expect(control(page)).toHaveCount(0);
    await expect(page.getByText(/notif/i)).toHaveCount(0);
    expect((await log(page)).registered).toEqual([]);
  });

  test('nothing is registered until the person asks, then this device is subscribed', async ({
    page,
  }) => {
    const api = await mockApi(page, [sales(), support()]);
    await stubPush(page);
    await page.goto(`/v/${ID}`);

    await expect(page.locator('.live-dot')).toHaveText('Live');
    await expect(turnOn(page)).toBeVisible();
    await expect(page.locator('.notify__status')).toBeEmpty();
    // Opening the page asked for nothing: no permission prompt, no service worker.
    expect(await log(page)).toEqual({ registered: [], subscribed: [], unsubscribed: 0, asked: 0 });
    expect(api.push).toEqual([]);

    await turnOn(page).click();
    await expect(page.locator('.notify__status')).toHaveText(
      'Notifications are on for this device.',
    );
    await expect(page.locator('.notify__status')).toHaveAttribute('aria-live', 'polite');
    await expect(turnOn(page)).toHaveCount(0);
    await expect(turnOff(page)).toHaveText('Turn off');
    // The same button all the way: whoever uses a keyboard is still on it.
    await expect(turnOff(page)).toBeFocused();

    // The service worker at the root, and a subscription made for the server's key.
    const asked = await log(page);
    expect(asked.registered).toEqual([['/sw.js', '/']]);
    expect(asked.asked).toBe(1);
    expect(asked.subscribed).toHaveLength(1);
    expect(asked.subscribed[0]?.userVisibleOnly).toBe(true);
    expect(asked.subscribed[0]?.key).toHaveLength(65);
    expect(Buffer.from(asked.subscribed[0]?.key ?? []).toString('base64url')).toBe(PUBLIC_KEY);

    // What the server gets: the subscription as the browser gives it, and the language.
    expect(api.push).toHaveLength(1);
    const request = api.push[0] as Request;
    expect(request.method()).toBe('POST');
    expect(new URL(request.url()).pathname).toBe(`/api/vitrinas/${ID}/push`);
    expect(request.postDataJSON()).toEqual({
      endpoint: ENDPOINT,
      expirationTime: null,
      keys: KEYS,
      locale: 'en',
    });
    expect(request.headers()['content-type']).toContain('application/json');
    // Watching is a read capability: no key travels with it.
    expect(request.headers().authorization).toBeUndefined();

    // Remembered: the next visit says so at once and asks for nothing again.
    await page.reload();
    await expect(page.locator('.notify__status')).toHaveText(
      'Notifications are on for this device.',
    );
    await expect(turnOff(page)).toBeVisible();
    expect((await log(page)).registered).toEqual([]);
    expect(api.push).toHaveLength(1);
  });

  test('"Turn off" unsubscribes this device, here and on the server', async ({ page }) => {
    const api = await mockApi(page, [sales()]);
    await stubPush(page);
    await page.goto(`/v/${ID}`);
    await turnOn(page).click();
    await expect(turnOff(page)).toBeVisible();

    await turnOff(page).click();
    await expect(turnOn(page)).toBeVisible();
    await expect(turnOn(page)).toBeFocused();
    await expect(page.locator('.notify__status')).toBeEmpty();

    expect(api.push.map((request) => request.method())).toEqual(['POST', 'DELETE']);
    const request = api.push[1] as Request;
    expect(new URL(request.url()).pathname).toBe(`/api/vitrinas/${ID}/push`);
    expect(request.postDataJSON()).toEqual({ endpoint: ENDPOINT });
    expect(request.headers().authorization).toBeUndefined();
    expect((await log(page)).unsubscribed).toBe(1);

    await page.reload();
    await expect(turnOn(page)).toBeVisible();
  });

  test('a subscription shared with another vitrina survives turning one off', async ({ page }) => {
    const api = await mockApi(page, [sales()]);
    await stubPush(page);
    await page.goto(`/v/${OTHER}`);
    await turnOn(page).click();
    await expect(turnOff(page)).toBeVisible();

    await page.goto(`/v/${ID}`);
    // The browser is subscribed, but nobody asked for this vitrina: it is off here.
    await expect(turnOn(page)).toBeVisible();
    await turnOn(page).click();
    await expect(turnOff(page)).toBeVisible();
    // One device, one subscription: the second vitrina reuses it.
    expect((await log(page)).subscribed).toEqual([]);

    await turnOff(page).click();
    await expect(turnOn(page)).toBeVisible();
    expect(api.push.map((r) => `${r.method()} ${new URL(r.url()).pathname}`)).toEqual([
      `POST /api/vitrinas/${OTHER}/push`,
      `POST /api/vitrinas/${ID}/push`,
      `DELETE /api/vitrinas/${ID}/push`,
    ]);
    expect((await log(page)).unsubscribed).toBe(0);

    await page.goto(`/v/${OTHER}`);
    await expect(turnOff(page)).toBeVisible();
  });

  test('the browser is the truth: a subscription that is gone reads as off', async ({ page }) => {
    await mockApi(page, [sales()]);
    await stubPush(page, { permission: 'granted' });
    // This device remembers subscribing, but the browser holds nothing.
    await page.addInitScript(
      ([id, endpoint]) => localStorage.setItem(`glimo:push:${id}`, endpoint as string),
      [ID, ENDPOINT],
    );
    await page.goto(`/v/${ID}`);
    await expect(turnOn(page)).toBeVisible();
    await expect(page.locator('.notify__status')).toBeEmpty();
  });

  test('says how to allow them when the browser blocks this site', async ({ page }) => {
    const api = await mockApi(page, [sales()]);
    await stubPush(page, { answer: 'denied' });
    await page.goto(`/v/${ID}`);
    await turnOn(page).click();

    const status = page.locator('.notify__status');
    await expect(status).toContainText('Notifications are blocked for this site.');
    await expect(status).toContainText('browser settings');
    // No button that cannot work, and the explanation is where the focus went.
    await expect(control(page).getByRole('button')).toHaveCount(0);
    await expect(status).toBeFocused();
    expect((await log(page)).registered).toEqual([]);
    expect(api.push).toEqual([]);

    // Blocked from the start: the same explanation, without asking.
    await page.reload();
    await expect(status).toContainText('Notifications are blocked for this site.');
    await expect(control(page).getByRole('button')).toHaveCount(0);
    expect((await log(page)).asked).toBe(0);
  });

  test('closing the prompt without answering leaves it off', async ({ page }) => {
    const api = await mockApi(page, [sales()]);
    await stubPush(page, { answer: 'default' });
    await page.goto(`/v/${ID}`);
    await turnOn(page).click();
    await expect.poll(async () => (await log(page)).asked).toBe(1);
    await expect(turnOn(page)).toBeVisible();
    await expect(turnOn(page)).not.toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('.notify__status')).toBeEmpty();
    expect(api.push).toEqual([]);
  });

  test('says so when the server could not save it, and can be tried again', async ({ page }) => {
    const api = await mockApi(page, [sales()], { subscribe: 500 });
    await stubPush(page);
    await page.goto(`/v/${ID}`);
    await turnOn(page).click();
    await expect(page.locator('.notify__status')).toHaveText(
      'Could not turn notifications on. Try again.',
    );
    await expect(turnOn(page)).toBeVisible();
    expect(api.push).toHaveLength(1);
    // Not remembered as on.
    await page.reload();
    await expect(turnOn(page)).toBeVisible();
    await expect(page.locator('.notify__status')).toBeEmpty();
  });

  test('while it works the button is disabled, and the row keeps its place', async ({ page }) => {
    await mockApi(page, [sales()]);
    await stubPush(page);
    // The server takes its time: long enough to look at the button meanwhile.
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(/\/api\/vitrinas\/v[0-9a-z]{24}\/push$/, async (route) => {
      await held;
      await route.fulfill({ status: 201, json: { ok: true } });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/v/${ID}`);

    const vitrina = page.locator('.vitrina');
    const top = async () => (await vitrina.boundingBox())?.y;
    await expect(turnOn(page)).toBeVisible();
    const before = await top();

    await turnOn(page).click();
    const working = control(page).getByRole('button', { name: 'Turning notifications on' });
    await expect(working).toBeDisabled();
    await expect(working).toBeFocused();
    expect(await top()).toBe(before);

    release();
    await expect(turnOff(page)).toBeVisible();
    expect(await top()).toBe(before);
    // A real button, big enough for a thumb, and nothing sticks out of a phone.
    expect((await turnOff(page).boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
  });

  test('a browser that cannot notify is not offered anything', async ({ page }) => {
    const api = await mockApi(page, [sales()]);
    await page.addInitScript(() => Reflect.deleteProperty(window, 'PushManager'));
    await page.goto(`/v/${ID}`);
    await expect(page.locator('.sheet .since')).toHaveText('for 12 min');
    await expect(control(page)).toHaveCount(0);
    // It does not even ask the server.
    expect(api.keyRequests()).toBe(0);
  });

  test('the playground offers it for its live vitrina', async ({ page }) => {
    const api = await mockApi(page, [sales(), support()]);
    await stubPush(page);
    await page.goto('/playground#live');
    await expect(control(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Create a vitrina' }).click();
    await expect(page.locator('#live .vitrina__cell')).toHaveCount(2);
    await expect(page.locator('#live .ask .since')).toHaveText('for 12 min');

    await page
      .locator('#live')
      .getByRole('button', { name: 'Notify me when a glim needs me' })
      .click();
    await expect(page.locator('#live .notify__status')).toHaveText(
      'Notifications are on for this device.',
    );
    expect(new URL((api.push[0] as Request).url()).pathname).toBe(`/api/vitrinas/${ID}/push`);
  });
});

test.describe('notifications in Spanish', () => {
  test.use({ locale: 'es-ES' });

  test('speak Spanish to whoever reads in Spanish, and tell the server', async ({ page }) => {
    const api = await mockApi(page, [sales()]);
    await stubPush(page);
    await page.goto(`/v/${ID}`);

    await expect(page.locator('.sheet .since')).toHaveText('desde hace 12 min');
    await page.getByRole('button', { name: 'Avísame cuando un glim me necesite' }).click();
    await expect(page.locator('.notify__status')).toHaveText(
      'Los avisos están activados en este dispositivo.',
    );
    await expect(page.getByRole('button', { name: 'Desactivar los avisos' })).toHaveText(
      'Desactivar',
    );
    expect((api.push[0] as Request).postDataJSON()).toMatchObject({
      endpoint: ENDPOINT,
      keys: KEYS,
      locale: 'es',
    });
  });
});

test.describe('notifications on an iPhone', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844 },
  });

  // Safari on iOS has no Push API in a browser tab: it appears once the site is installed.
  const asSafari = (page: Page, standalone: boolean) =>
    page.addInitScript((installed) => {
      Object.defineProperty(navigator, 'standalone', { configurable: true, value: installed });
      if (installed) return;
      Reflect.deleteProperty(window, 'PushManager');
      Reflect.deleteProperty(window, 'Notification');
    }, standalone);

  test('in a browser tab it is told to add Glimo to the Home Screen', async ({ page }) => {
    await mockApi(page, [sales()]);
    await asSafari(page, false);
    await page.goto(`/v/${ID}`);
    await expect(page.locator('.notify__status')).toContainText('add Glimo to your Home Screen');
    await expect(control(page).getByRole('button')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
  });

  test('not even that when this deployment has no push', async ({ page }) => {
    const api = await mockApi(page, [sales()], { key: 'not-configured' });
    await asSafari(page, false);
    await page.goto(`/v/${ID}`);
    await expect(page.locator('.vitrina__cell')).toHaveCount(1);
    await expect.poll(api.keyRequests).toBe(1);
    await expect(control(page)).toHaveCount(0);
  });

  test('from the Home Screen it is offered like anywhere else', async ({ page }) => {
    await mockApi(page, [sales()]);
    await stubPush(page);
    await asSafari(page, true);
    await page.goto(`/v/${ID}`);
    await expect(turnOn(page)).toBeVisible();
  });
});

test.describe('how long it has been waiting', () => {
  test('shows it for a glim that waits or is blocked, and for nobody else', async ({ page }) => {
    await mockApi(page, [sales(12), support(), data(125)]);
    await page.goto(`/v/${ID}`);
    const sheet = page.locator('.sheet').first();

    // The panel opens on whoever needs you most.
    await expect(sheet.locator('h2')).toHaveText('Sales is waiting for you.');
    await expect(sheet.locator('.since')).toHaveText('for 12 min');
    // Not announced every minute: only the sentence is.
    await expect(sheet.locator('.since')).toHaveAttribute('aria-live', 'off');
    await expect(sheet.locator('time.since')).toHaveAttribute('datetime', /^\d{4}-\d\d-\d\dT/);

    await page.locator('.vitrina__cell', { hasText: 'Data' }).getByRole('button').click();
    await expect(sheet.locator('h2')).toHaveText('Data is blocked.');
    await expect(sheet.locator('.since')).toHaveText('for 2 h');

    await page.locator('.vitrina__cell', { hasText: 'Support' }).getByRole('button').click();
    await expect(sheet.locator('h2')).toHaveText('Support is working.');
    await expect(sheet.locator('.since')).toHaveCount(0);
  });

  test('"since yesterday", and "just now" for what has just arrived', async ({ page }) => {
    await mockApi(page, [sales(0), data(24 * 60 + 1)]);
    await page.goto(`/v/${ID}`);
    const sheet = page.locator('.sheet').first();
    await expect(sheet.locator('h2')).toHaveText('Sales is waiting for you.');
    await expect(sheet.locator('.since')).toHaveText('just now');
    await page.locator('.vitrina__cell', { hasText: 'Data' }).getByRole('button').click();
    await expect(sheet.locator('.since')).toHaveText('since yesterday');
  });

  test('moves on by itself, on a slow timer that stops when the tab is hidden', async ({
    page,
  }) => {
    await page.clock.install();
    await mockApi(page, [sales(12)]);
    await page.goto(`/v/${ID}`);
    const since = page.locator('.sheet .since');
    await expect(since).toHaveText('for 12 min');

    await page.clock.runFor(61_000);
    await expect(since).toHaveText('for 13 min');

    // Hidden: nothing ticks. Back in view: it catches up at once.
    const setHidden = (hidden: boolean) =>
      page.evaluate((value) => {
        Object.defineProperty(document, 'hidden', { configurable: true, value });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
    await setHidden(true);
    await page.clock.runFor(5 * MINUTE);
    await expect(since).toHaveText('for 13 min');
    await setHidden(false);
    await expect(since).toHaveText('for 18 min');
  });

  test('the examples of the spec editor are recent, whenever the page is opened', async ({
    page,
  }) => {
    await page.goto('/playground');
    const since = page.locator('#spec .ask .since');
    await expect(since).toHaveText('for 12 min');
    await page.locator('#spec').getByRole('button', { name: 'blocked' }).click();
    await expect(page.locator('#spec .ask')).toContainText('Data is blocked.');
    await expect(since).toHaveText('for 12 min');
    // Like the server, a status without a time is stamped when it arrives.
    await page
      .locator('#spec-json')
      .fill('{"agent":{"id":"sales","name":"Sales"},"state":"waiting","say":"Wants to send"}');
    await expect(since).toHaveText('just now');
    await page.locator('#spec').getByRole('button', { name: 'minimal' }).click();
    await expect(since).toHaveCount(0);
  });

  test('the tab title counts who needs you', async ({ page }) => {
    await mockApi(page, [sales(), support(), data()]);
    await page.goto(`/v/${ID}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('1 agent is waiting for you');
    // One waits and one is blocked: two cannot go on without you.
    await expect(page).toHaveTitle('(2) 1 agent is waiting for you · Glimo');
  });

  test('the tab title has no number when nobody needs you', async ({ page }) => {
    await mockApi(page, [support()]);
    await page.goto(`/v/${ID}`);
    await expect(page).toHaveTitle('Nobody needs you right now · Glimo');
  });
});

test.describe('service worker', () => {
  test('/sw.js is served from the root and does not handle fetch', async ({ page, request }) => {
    const response = await request.get('/sw.js');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/javascript/);
    const source = await response.text();
    for (const event of ['install', 'activate', 'push', 'notificationclick']) {
      expect(source).toContain(`addEventListener('${event}'`);
    }
    // No fetch listener and no cache: it can never serve a stale page.
    expect(source).not.toMatch(/['"`]fetch['"`]|onfetch|caches\b|importScripts/);
    const listened = [...source.matchAll(/addEventListener\(\s*['"`]([\w-]+)['"`]/g)].map(
      (match) => match[1],
    );
    expect(listened.sort()).toEqual(['activate', 'install', 'notificationclick', 'push']);

    // Reading a page, the landing included, never installs it.
    for (const path of ['/', '/playground']) {
      await page.goto(path, { waitUntil: 'networkidle' });
      expect(
        await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
      ).toBe(0);
    }
  });

  test('a vitrina added to the Home Screen opens on that vitrina', async ({ request }) => {
    // Its manifest has no start_url, so the installed app starts where it was added from.
    const shell = await (await request.get('/v/')).text();
    expect(shell).toContain('rel="manifest" href="/vitrina.webmanifest"');
    const manifest = await (await request.get('/vitrina.webmanifest')).json();
    expect(manifest).not.toHaveProperty('start_url');
    expect(manifest).toMatchObject({ display: 'standalone', scope: '/' });
  });

  test('a real browser accepts it, for the whole site', async ({ page }) => {
    await page.goto('/playground');
    const registered = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const worker = registration.active ?? registration.waiting ?? registration.installing;
      const result = { scope: registration.scope, script: worker?.scriptURL, state: worker?.state };
      await registration.unregister();
      return result;
    });
    const origin = new URL(page.url()).origin;
    expect(registered.scope).toBe(`${origin}/`);
    expect(registered.script).toBe(`${origin}/sw.js`);
    expect(['activating', 'activated']).toContain(registered.state);
  });
});
