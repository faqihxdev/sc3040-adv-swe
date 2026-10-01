import { test, expect, signIn, addRice } from './fixtures';

test('Cook is always in navigation; Inventory has one primary add action', async ({
  page,
  kitchen,
}, testInfo) => {
  await signIn(page, kitchen.owner);
  const navigation = page.getByRole('navigation', {
    name: page.viewportSize()!.width < 1024 ? 'Mobile navigation' : 'Main navigation',
    exact: true,
  });
  const cook = navigation.getByRole('button', { name: 'Cook', exact: true });
  await expect(cook).toBeVisible();
  await expect(
    page.locator('#content').getByRole('button', { name: 'Cook', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add ingredient', exact: true })).toHaveCSS(
    'background-color',
    'rgb(255, 138, 31)',
  );
  await addRice(page);
  await page.reload();
  await page.screenshot({
    path: testInfo.outputPath('inventory.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await cook.click();
  await expect(cook).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Meal suggestions', exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('cook-empty.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Find meals', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Find meals', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await navigation.getByRole('button', { name: 'Inventory', exact: true }).click();
  await expect(cook).toBeVisible();
});

test('exclusion remove control stays inside its chip during hover, focus and press', async ({
  page,
  kitchen,
}, testInfo) => {
  await signIn(page, kitchen.owner);
  await page.goto('/?view=household');
  await page.getByRole('textbox', { name: 'Dietary exclusion', exact: true }).fill('Dairy');
  await page.getByRole('button', { name: 'Add exclusion', exact: true }).click();
  const remove = page.getByRole('button', { name: 'Remove Dairy', exact: true });
  const chip = remove.locator('..');
  const resting = await remove.boundingBox();
  expect(resting).not.toBeNull();
  await remove.hover();
  await expect
    .poll(async () => {
      const button = await remove.boundingBox();
      const parent = await chip.boundingBox();
      if (!button || !parent) return false;
      return (
        button.x >= parent.x &&
        button.y >= parent.y &&
        button.x + button.width <= parent.x + parent.width &&
        button.y + button.height <= parent.y + parent.height
      );
    })
    .toBe(true);
  // Interaction feedback must not shift the remove target outside the rounded chip.
  await expect.poll(async () => (await remove.boundingBox())?.y).toBe(resting!.y);
  await page.mouse.move(0, 0);
  await page.getByRole('textbox', { name: 'Dietary exclusion', exact: true }).focus();
  await page.getByRole('textbox', { name: 'Dietary exclusion', exact: true }).press('Shift+Tab');
  await expect(remove).toBeFocused();
  await chip.screenshot({
    path: testInfo.outputPath('exclusion-focus.png'),
    animations: 'disabled',
  });
  await remove.hover();
  await page.mouse.down();
  await chip.screenshot({
    path: testInfo.outputPath('exclusion-pressed.png'),
    animations: 'disabled',
  });
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await remove.press('Enter');
  await expect(remove).toHaveCount(0);
  const longName = 'Ingredient'.repeat(8);
  await page.getByRole('textbox', { name: 'Dietary exclusion', exact: true }).fill(longName);
  await page.getByRole('button', { name: 'Add exclusion', exact: true }).click();
  const longRemove = page.getByRole('button', { name: 'Remove ' + longName, exact: true });
  await expect(longRemove).toBeVisible();
  await page.getByRole('textbox', { name: 'Dietary exclusion', exact: true }).focus();
  await page.getByRole('textbox', { name: 'Dietary exclusion', exact: true }).press('Shift+Tab');
  await expect(longRemove).toBeFocused();
  expect((await longRemove.boundingBox())!.width).toBeGreaterThanOrEqual(44);
  expect((await longRemove.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await longRemove
    .locator('..')
    .screenshot({ path: testInfo.outputPath('exclusion-long.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Save exclusions', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save exclusions', exact: true })).toBeDisabled();
  await page.goto('/?view=account');
  await page.getByRole('button', { name: 'light theme', exact: true }).click();
  await page.goto('/?view=household');
  await page.getByRole('textbox', { name: 'Dietary exclusion', exact: true }).focus();
  await page.getByRole('textbox', { name: 'Dietary exclusion', exact: true }).press('Shift+Tab');
  await expect(longRemove).toBeFocused();
  await longRemove
    .locator('..')
    .screenshot({ path: testInfo.outputPath('exclusion-light.png'), animations: 'disabled' });
});
