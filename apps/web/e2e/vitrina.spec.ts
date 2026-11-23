import { expect, test } from '@playwright/test';

async function createVitrina(request: import('@playwright/test').APIRequestContext) {
  const response = await request.post('/api/vitrinas');
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string; key: string };
}

test.describe('live vitrina', () => {
  test('a status sent to the API shows up on every screen, without reloading', async ({
    page,
    request,
  }) => {
    const vitrina = await createVitrina(request);
    await page.goto(`/v/${vitrina.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your vitrina is empty');
    await expect(page.locator('.live-dot')).toHaveText('Live');

    const push = (data: object) =>
      request.post(`/api/vitrinas/${vitrina.id}/status`, {
        headers: { authorization: `Bearer ${vitrina.key}` },
        data,
      });
    await push({
      agent: { id: 'support', name: 'Support' },
      state: 'working',
      say: 'On ticket 18 of 40',
    });
    await push({
      agent: { id: 'sales', name: 'Sales' },
      state: 'waiting',
      say: 'Wants to send 12 emails',
      actions: [{ id: 'approve', label: 'Approve sending', kind: 'primary', sensitive: true }],
    });

    await expect(page.locator('.vitrina__cell')).toHaveCount(2);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('1 agent is waiting for you');
    await expect(page).toHaveTitle('1 agent is waiting for you · Glimo');
    // The panel opens on whoever needs you most.
    await expect(page.locator('.sheet h2').first()).toHaveText('Sales is waiting for you.');

    // Without the key the view is read-only.
    await expect(page.getByRole('button', { name: 'Approve sending' })).toBeDisabled();
    await expect(page.locator('.sheet').first()).toContainText('Read-only view');

    await push({ agent: { id: 'sales', name: 'Sales' }, state: 'done', say: '12 emails sent' });
    await expect(page.locator('.vitrina__cell', { hasText: 'Sales' })).toContainText('Done');
  });

  test('with the key you can decide, and the agent collects it once', async ({ page, request }) => {
    const vitrina = await createVitrina(request);
    const auth = { authorization: `Bearer ${vitrina.key}` };
    await request.post(`/api/vitrinas/${vitrina.id}/status`, {
      headers: auth,
      data: {
        agent: { id: 'sales', name: 'Sales' },
        state: 'waiting',
        say: 'Wants to send 12 emails',
        actions: [{ id: 'approve', label: 'Approve sending', kind: 'primary', sensitive: true }],
      },
    });

    await page.goto(`/v/${vitrina.id}#k=${vitrina.key}`);
    await expect(page.locator('.vitrina__cell')).toHaveCount(1);
    // The key leaves the address bar immediately.
    await expect(page).toHaveURL(new RegExp(`/v/${vitrina.id}$`));

    await page.getByRole('button', { name: 'Approve sending' }).click();
    await page.getByRole('button', { name: /Confirm: Approve sending/ }).click();
    await expect(page.locator('.sheet').first()).toContainText('sent to Sales');

    const collect = async () =>
      (await (
        await request.get(`/api/vitrinas/${vitrina.id}/actions?agent=sales`, { headers: auth })
      ).json()) as {
        actions: { actionId: string }[];
      };
    expect((await collect()).actions.map((action) => action.actionId)).toEqual(['approve']);
    expect((await collect()).actions).toEqual([]);
  });

  test('worlds change how it looks, not who is there', async ({ page, request }) => {
    const vitrina = await createVitrina(request);
    await request.post(`/api/vitrinas/${vitrina.id}/status`, {
      headers: { authorization: `Bearer ${vitrina.key}` },
      data: { agent: { id: 'legal', name: 'Legal' }, state: 'sleeping' },
    });
    await page.goto(`/v/${vitrina.id}`);
    await expect(page.locator('.vitrina__cell')).toHaveCount(1);
    await page.getByRole('button', { name: 'Orbit' }).click();
    await expect(page.locator('.vitrina')).toHaveAttribute('data-world', 'orbit');
    await expect(page.locator('.vitrina__cell')).toHaveCount(1);
    await page.reload();
    await expect(page.locator('.vitrina')).toHaveAttribute('data-world', 'orbit');
  });

  test('an address without a vitrina says so and offers a way out', async ({ page }) => {
    await page.goto(`/v/v${'0'.repeat(24)}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'This vitrina does not exist or has expired.',
    );
    await expect(
      page.getByRole('link', { name: 'Create a new one in the playground' }),
    ).toBeVisible();
  });
});
