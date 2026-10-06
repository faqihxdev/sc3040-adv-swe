import {
  test,
  expect,
  action,
  addRice,
  mealFixture,
  selectOption,
  signIn,
  state,
} from './fixtures';
import { todaySingapore } from '../../src/domain/meals';

async function setViewportForProject(page: Parameters<typeof signIn>[0], projectName: string) {
  await page.setViewportSize(
    projectName.includes('Mobile') ? { width: 412, height: 915 } : { width: 1440, height: 900 },
  );
}

async function openConfirmation(
  page: Parameters<typeof signIn>[0],
  kitchen: Parameters<typeof mealFixture>[0],
  projectName: string,
  includeTomatoes = false,
  nearExpiry = false,
) {
  await setViewportForProject(page, projectName);
  await signIn(page, kitchen.owner);
  let rice = await addRice(page);
  if (nearExpiry) {
    const expiry = new Date(Date.parse(todaySingapore()) + 2 * 86400000).toISOString().slice(0, 10);
    const edited = await action(page, { ...rice, command: 'edit_item', expiry_date: expiry });
    expect(edited.status()).toBe(200);
    rice = (await state(page)).items.find((item) => item.id === rice.id)!;
  }
  if (includeTomatoes) {
    const added = await action(page, {
      command: 'add_item',
      name: 'Tomatoes',
      quantity: 300,
      unit: 'g',
      expiry_date: '2099-12-31',
      category: 'Vegetables',
      location: 'Fridge',
    });
    expect(added.status()).toBe(200);
  }
  const extras = includeTomatoes
    ? (await state(page)).items.filter((item) => item.name === 'Tomatoes')
    : [];
  const meal = mealFixture(kitchen, rice, extras);
  await page.route('**/api/meals', (route) =>
    route.fulfill({ json: { meals: [meal], message: '' } }),
  );
  await page.reload();
  await page.getByRole('button', { name: 'Cook', exact: true }).click();
  await page.getByRole('button', { name: 'Find meals', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'See recipe', exact: true }).click();
  await page.getByRole('button', { name: 'Cook this', exact: true }).click();
  await page.getByRole('button', { name: 'I’ve finished cooking', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Record meal', exact: true })).toBeVisible();
  return { rice, meal };
}

test.describe('combined cooking confirmation', () => {
  test('saves one direct confirmation and keeps Left live @quantity', async ({
    page,
    kitchen,
  }, testInfo) => {
    const { rice } = await openConfirmation(page, kitchen, testInfo.project.name, false, true);
    const confirmation = page.getByRole('dialog', { name: 'Record meal', exact: true });
    const used = page.getByLabel('Used amount for Rice', { exact: true });

    await expect(confirmation).toContainText('Left 400 g');
    await used.fill('125');
    await expect(confirmation).toContainText('Left 375 g');

    const request = page.waitForRequest('**/api/confirm');
    await page.getByRole('button', { name: 'Confirm meal', exact: true }).click();
    expect((await request).postDataJSON().changes).toEqual([
      expect.objectContaining({ usedAmount: 125, discardedAmount: 0, discardReason: null }),
    ]);
    await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible();
    const savedState = await state(page);
    expect(savedState.outcomes[0].ingredients[0].expiry_date).toBe(rice.expiry_date);
    const remaining = savedState.items.find((item) => item.id === rice.id)!;
    expect(
      (
        await action(page, { ...remaining, command: 'edit_item', expiry_date: '2099-12-31' })
      ).status(),
    ).toBe(200);
    await page.goto('/?view=analytics');
    const panel = page.getByRole('region', { name: 'Used near expiry', exact: true });
    await expect(panel.locator('[data-near-expiry-count]')).toHaveText('1');
    await panel.getByRole('button', { name: 'View ingredients', exact: true }).click();
    const details = page.getByRole('dialog', { name: 'Used near expiry', exact: true });
    await expect(details).toContainText('125 g');
    await expect(details).toContainText('2 days before expiry');
    await expect(details).toContainText(rice.expiry_date);
  });

  test('keeps blank and overdraw amounts as inline errors', async ({ page, kitchen }, testInfo) => {
    await openConfirmation(page, kitchen, testInfo.project.name);
    const confirmation = page.getByRole('dialog', { name: 'Record meal', exact: true });
    const used = page.getByLabel('Used amount for Rice', { exact: true });

    await used.fill('');
    await page.getByRole('button', { name: 'Confirm meal', exact: true }).click();
    await expect(confirmation).toContainText('Enter a used amount of 0 or more.');
    await expect(page.getByRole('dialog', { name: 'Record meal', exact: true })).toBeVisible();

    await used.fill('501');
    await page.getByRole('button', { name: 'Confirm meal', exact: true }).click();
    await expect(confirmation).toContainText('Used and waste cannot exceed the available amount.');
  });

  test('expands waste per ingredient and preserves collapsed amounts when confirming', async ({
    page,
    kitchen,
  }, testInfo) => {
    await openConfirmation(page, kitchen, testInfo.project.name, true);
    const confirmation = page.getByRole('dialog', { name: 'Record meal', exact: true });
    await confirmation.getByRole('button', { name: 'Waste details for Rice', exact: true }).click();
    await confirmation.getByLabel('Waste amount for Rice (optional)', { exact: true }).fill('25');
    await selectOption(page, 'Waste reason for Rice', 'prep');
    await expect(
      confirmation.getByLabel('Waste amount for Tomatoes (optional)', { exact: true }),
    ).toHaveCount(0);
    await confirmation.getByRole('button', { name: 'Waste details for Rice', exact: true }).click();
    await expect(
      confirmation.getByRole('button', { name: 'Waste details for Rice', exact: true }),
    ).toContainText('Waste: 25 g');
    await confirmation
      .getByRole('button', { name: 'Waste details for Tomatoes', exact: true })
      .click();
    await expect(
      confirmation.getByLabel('Waste amount for Rice (optional)', { exact: true }),
    ).toHaveCount(0);
    await expect(
      confirmation.getByLabel('Waste amount for Tomatoes (optional)', { exact: true }),
    ).toHaveValue('0');
    await confirmation.getByRole('button', { name: 'Waste details for Rice', exact: true }).click();
    await expect(
      confirmation.getByLabel('Waste amount for Rice (optional)', { exact: true }),
    ).toHaveValue('25');
    await expect(confirmation.getByRole('region', { name: 'Rice', exact: true })).toContainText(
      'Left 375 g',
    );
    await page.screenshot({
      path: testInfo.outputPath('ingredient-waste.png'),
      animations: 'disabled',
    });

    const request = page.waitForRequest('**/api/confirm');
    await confirmation.getByRole('button', { name: 'Confirm meal', exact: true }).click();
    expect((await request).postDataJSON().changes).toEqual([
      expect.objectContaining({ usedAmount: 100, discardedAmount: 25, discardReason: 'prep' }),
      expect.objectContaining({ usedAmount: 100, discardedAmount: 0, discardReason: null }),
    ]);
    await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible();
  });

  test('reloads latest stock after a stale-version response', async ({
    page,
    kitchen,
  }, testInfo) => {
    await openConfirmation(page, kitchen, testInfo.project.name);
    let attempts = 0;
    await page.route('**/api/confirm', async (route) => {
      attempts++;
      if (attempts === 1)
        return route.fulfill({
          status: 409,
          json: { error: 'Stock changed. Load the latest stock.' },
        });
      return route.continue();
    });

    const confirmation = page.getByRole('dialog', { name: 'Record meal', exact: true });
    await confirmation.getByRole('button', { name: 'Confirm meal', exact: true }).click();
    await expect(confirmation).toContainText('older stock version');
    await confirmation.getByRole('button', { name: 'Load latest stock', exact: true }).click();
    await expect(confirmation.getByLabel('Used amount for Rice', { exact: true })).toHaveValue(
      '100',
    );
    await confirmation.getByRole('button', { name: 'Confirm meal', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible();
    expect(attempts).toBe(2);
  });

  test('locks the saved form when refresh fails, then retries refresh only', async ({
    page,
    kitchen,
  }, testInfo) => {
    await openConfirmation(page, kitchen, testInfo.project.name);
    let failRefresh = false;
    await page.route('**/api/state', async (route) => {
      if (failRefresh)
        return route.fulfill({ status: 503, json: { error: 'State temporarily unavailable.' } });
      return route.continue();
    });
    const confirmation = page.getByRole('dialog', { name: 'Record meal', exact: true });
    const used = confirmation.getByLabel('Used amount for Rice', { exact: true });
    failRefresh = true;
    await confirmation.getByRole('button', { name: 'Confirm meal', exact: true }).click();
    await expect(confirmation).toContainText(
      'Meal saved, but the latest stock could not be loaded.',
    );
    await expect(used).toBeDisabled();
    await expect(
      confirmation.getByRole('button', { name: 'Retry refresh', exact: true }),
    ).toBeVisible();

    failRefresh = false;
    await confirmation.getByRole('button', { name: 'Retry refresh', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible();
  });

  test('uses Done after a saved refresh failure instead of reopening the meal', async ({
    page,
    kitchen,
  }, testInfo) => {
    await openConfirmation(page, kitchen, testInfo.project.name);
    await page.route('**/api/state', (route) =>
      route.fulfill({ status: 503, json: { error: 'State temporarily unavailable.' } }),
    );
    const confirmation = page.getByRole('dialog', { name: 'Record meal', exact: true });
    await confirmation.getByRole('button', { name: 'Confirm meal', exact: true }).click();
    await expect(confirmation.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
    await confirmation.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Record meal', exact: true })).toHaveCount(0);
  });
});
