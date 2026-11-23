import { expect, test } from '@playwright/test';

test.describe('home', () => {
  test('paints the vitrina before JavaScript and hydrates without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    const response = await page.goto('/');
    expect(await response?.text()).toContain('data-prerender="full"');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'All your agents, at a glance.',
    );
    await expect(page.locator('.vitrina--hero .vitrina__cell')).toHaveCount(9);
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });

  test('glims only animate composited properties and follow the pointer', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    const properties = await page.evaluate(() => {
      const found = new Set<string>();
      for (const animation of document.getAnimations()) {
        const effect = animation.effect as KeyframeEffect;
        for (const keyframe of effect.getKeyframes()) {
          for (const name of Object.keys(keyframe)) {
            if (!['offset', 'easing', 'composite', 'computedOffset'].includes(name))
              found.add(name);
          }
        }
      }
      return [...found].sort();
    });
    expect(properties.length).toBeGreaterThan(0);
    for (const property of properties) {
      expect(['opacity', 'rotate', 'scale', 'translate']).toContain(property);
    }

    const face = page.locator('.vitrina--hero .glim__face').first();
    await page.mouse.move(40, 40);
    await page.waitForTimeout(400);
    const before = await face.evaluate((element) => (element as HTMLElement).style.translate);
    await page.mouse.move(1200, 700, { steps: 8 });
    await page.waitForTimeout(400);
    const after = await face.evaluate((element) => (element as HTMLElement).style.translate);
    expect(after).not.toBe(before);
  });

  test('a sensitive action asks for confirmation, then the agent gets on with it', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    const sales = page.locator('.vitrina--hero .vitrina__cell').first();
    await expect(sales).toContainText('Waiting for you');
    await page.getByRole('button', { name: 'Approve sending' }).click();
    await expect(page.locator('.ask__status')).toContainText('sensitive');
    await expect(sales).toContainText('Waiting for you');
    await page.getByRole('button', { name: /Confirm: Approve sending/ }).click();
    await expect(sales).toContainText('Working');
    await expect(sales).toContainText('Done', { timeout: 6000 });
  });

  test('"Pause motion" stops every glim, and the choice is remembered', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    const running = () =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation.playState === 'running' &&
                ((animation.effect as KeyframeEffect).target as Element | null)?.closest('.glim'),
            ).length,
      );
    expect(await running()).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Pause motion' }).click();
    expect(await running()).toBe(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Play motion' })).toBeVisible();
    expect(await running()).toBe(0);
  });

  test('reduced motion: states stay readable, nothing moves', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(
      page.locator('.vitrina--hero .glim[data-state="waiting"] .glim__badge--bang').first(),
    ).toBeVisible();
    const moving = await page.evaluate(
      () =>
        document.getAnimations().filter((animation) => animation.playState === 'running').length,
    );
    expect(moving).toBe(0);
    await context.close();
  });

  test('Spanish lives under /es/ and navigation stays in the language', async ({ page }) => {
    await page.goto('/es/', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Todos tus agentes, de un vistazo.',
    );
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await page.getByRole('link', { name: 'Abrir el playground' }).first().click();
    await expect(page).toHaveURL(/\/es\/playground/);
    await expect(page.getByRole('heading', { name: 'Vitrina en vivo' })).toBeVisible();
  });

  test('unknown pages are a real 404', async ({ page }) => {
    const response = await page.goto('/definitely-not-here');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'There is nothing at this address.',
    );
  });
});
