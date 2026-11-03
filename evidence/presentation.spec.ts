import { writeFileSync } from 'node:fs';
import { test, expect, addRice, mealFixture, signIn, state } from '../tests/browser/fixtures';
import type { Locator } from '@playwright/test';

test('TC-RES-02 visible reservation lifecycle, reload and release', async ({
  page,
  kitchen,
}, info) => {
  await page.addInitScript(() => {
    localStorage.setItem('theme', 'dark');
    const install = () => {
      const pointer = document.createElement('div');
      pointer.setAttribute('aria-hidden', 'true');
      pointer.style.cssText =
        'position:fixed;width:22px;height:22px;border:2px solid #ff8a1f;border-radius:50%;' +
        'pointer-events:none;z-index:2147483647;transform:translate(-50%,-50%);' +
        'box-shadow:0 0 0 4px #ff8a1f22;display:none;transition:background-color 100ms;';
      document.body.append(pointer);
      document.addEventListener('pointermove', (event) => {
        pointer.style.display = 'block';
        pointer.style.left = `${event.clientX}px`;
        pointer.style.top = `${event.clientY}px`;
      });
      document.addEventListener('pointerdown', () => {
        pointer.style.background = '#ff8a1f99';
      });
      document.addEventListener('pointerup', () => {
        pointer.style.background = 'transparent';
      });
    };
    if (document.body) install();
    else document.addEventListener('DOMContentLoaded', install, { once: true });
  });
  await signIn(page, kitchen.owner);
  const rice = await addRice(page);
  await page.reload();
  await expect(page.getByText('Rice', { exact: true }).filter({ visible: true })).toBeVisible();
  const meal = mealFixture(kitchen, rice);
  await page.route('**/api/meals', (route) =>
    route.fulfill({ json: { meals: [meal], message: '' } }),
  );
  const started = Date.now();
  const marks: { action: string; milliseconds: number }[] = [];
  const mark = (action: string) => marks.push({ action, milliseconds: Date.now() - started });
  const click = async (target: Locator, label: string) => {
    await target.hover();
    await page.waitForTimeout(450);
    await target.click();
    mark(label);
    await page.waitForTimeout(850);
  };
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  await test.step('Open Cook and request the controlled test recipe', async () => {
    await click(button('Cook'), 'Open Cook');
    await click(button('Find meals'), 'Find meals');
    await click(button('Next'), 'Submit request');
    await expect(button('Cook this')).toBeVisible();
    await page.screenshot({ path: info.outputPath('recipe.png') });
  });
  await test.step('Reserve 100 g without deducting recorded stock', async () => {
    await click(button('Cook this'), 'Reserve portions');
    await expect(
      page.getByText('Portions reserved for your cooking session.', { exact: true }),
    ).toBeVisible();
    const current = await state(page);
    expect(current.reservations).toHaveLength(1);
    expect(current.items.find((item) => item.id === rice.id)?.quantity).toBe(500);
    expect(current.outcomes).toHaveLength(0);
    await click(button('Inventory'), 'Inspect reserved stock');
    const row = page.locator(`[data-inventory-item="${rice.id}"]:visible`);
    await expect(row.locator('[data-reservation]')).toHaveText(
      '100 g reserved by Test owner. 400 g available.',
    );
    await page.screenshot({ path: info.outputPath('reserved-stock.png') });
    await page.waitForTimeout(1600);
  });
  await test.step('Reload and resume the persisted session', async () => {
    mark('Reload');
    await page.reload();
    await click(button('Cook'), 'Resume cooking');
    await expect(button('I’ve finished cooking')).toBeVisible();
    await page.screenshot({ path: info.outputPath('resumed-cooking.png') });
    await page.waitForTimeout(1000);
  });
  await test.step('End the session and verify that the hold is released', async () => {
    await click(button('End session'), 'End session');
    await click(
      page.getByRole('dialog').getByRole('button', { name: 'End session', exact: true }),
      'Confirm release',
    );
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await click(button('Inventory'), 'Inspect released stock');
    const current = await state(page);
    expect(current.reservations).toEqual([]);
    expect(current.cookingSession).toBeNull();
    expect(current.items.find((item) => item.id === rice.id)?.quantity).toBe(500);
    await expect(page.locator(`[data-inventory-item="${rice.id}"] [data-reservation]`)).toHaveCount(
      0,
    );
    await page.screenshot({ path: info.outputPath('released-stock.png') });
    await page.waitForTimeout(1600);
  });
  writeFileSync(
    info.outputPath('recording.json'),
    JSON.stringify(
      {
        case: 'TC-RES-02',
        result: 'passed',
        scope:
          'Local Chromium, real Supabase, controlled recipe response, disposable test household.',
        cursor:
          'Pointer ring marks actual automated pointer events. It does not alter application state.',
        marks,
        durationMilliseconds: Date.now() - started,
      },
      null,
      2,
    ),
  );
});
