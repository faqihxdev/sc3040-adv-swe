import { test, expect, signIn } from './fixtures';

test('FR-04: manual/photo tabs preserve the manual draft and support keyboard switching', async ({
  page,
  kitchen,
}) => {
  await signIn(page, kitchen.owner);
  await page.getByRole('button', { name: 'Add ingredient', exact: true }).click();
  const manual = page.getByRole('tab', { name: 'Manual', exact: true });
  const photo = page.getByRole('tab', { name: 'Photo', exact: true });
  await expect(manual).toHaveAttribute('aria-selected', 'true');
  await page.getByLabel('Ingredient name', { exact: true }).fill('Rice');
  await manual.press('ArrowRight');
  await expect(photo).toBeFocused();
  await expect(page.getByRole('button', { name: 'Choose ingredient photo' })).toBeVisible();
  await photo.press('ArrowLeft');
  await expect(page.getByLabel('Ingredient name', { exact: true })).toHaveValue('Rice');
  await expect(page.getByRole('button', { name: 'Review details' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use photo', exact: true })).toHaveCount(0);
});
