import { expect, test } from '@playwright/test';

test.describe('playground', () => {
  test('glim lab: the state changes the eyes and the signal', async ({ page }) => {
    await page.goto('/playground');
    const glim = page.locator('#lab .stage .glim');
    await expect(glim).toHaveAttribute('data-state', 'waiting');
    await page.locator('#lab').getByRole('button', { name: 'Blocked' }).click();
    await expect(glim).toHaveAttribute('data-state', 'blocked');
    await expect(glim.locator('.glim__face')).toHaveAttribute('data-eyes', 'x');
    await expect(glim).toHaveAccessibleName('Glim: Blocked');
  });

  test('spec editor: says exactly what is wrong', async ({ page }) => {
    await page.goto('/playground');
    await expect(page.locator('#spec .verdict--ok')).toHaveText('Valid Glimo Spec v0.1');
    await page
      .locator('#spec-json')
      .fill('{"agent":{"id":"Sales!","name":"Sales"},"state":"dancing"}');
    const verdict = page.locator('#spec .verdict--bad');
    await expect(verdict).toContainText('agent.id');
    await expect(verdict).toContainText('state');
    await page.locator('#spec-json').fill('{"agent":');
    await expect(verdict).toHaveText('This is not valid JSON.');
    await page.locator('#spec').getByRole('button', { name: 'minimal' }).click();
    await expect(page.locator('#spec .verdict--ok')).toBeVisible();
  });

  test('live vitrina: create it, simulate a team, decide', async ({ page }) => {
    await page.goto('/playground#live');
    await page.getByRole('button', { name: 'Create a vitrina' }).click();
    await expect(page.locator('#live .live-dot')).toHaveText('Live');
    await expect(page.locator('#live .snippet').first()).toContainText('Authorization: Bearer gk_');

    await page.getByRole('button', { name: 'Simulate a team' }).click();
    await expect(page.locator('#live .vitrina__cell')).toHaveCount(9, { timeout: 15_000 });
    await expect(page.locator('#live .meter strong')).toContainText('ms');

    const sales = page.locator('#live .vitrina__cell', { hasText: 'Sales' });
    await sales.getByRole('button').click();
    await page.locator('#live').getByRole('button', { name: 'Approve sending' }).click();
    await page
      .locator('#live')
      .getByRole('button', { name: /Confirm/ })
      .click();
    await expect(sales).toContainText('Working', { timeout: 8000 });
    await expect(sales).toContainText('Done', { timeout: 8000 });

    // The vitrina survives a reload: it is remembered in this browser.
    await page.reload();
    await expect(page.locator('#live .vitrina__cell')).toHaveCount(9);
  });
});
