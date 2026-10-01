import { test, expect, signIn, addRice, mealFixture } from './fixtures';

test('meal loading cycles eight phrases and restarts after a failed request', async ({
  page,
  kitchen,
}, testInfo) => {
  await signIn(page, kitchen.owner);
  const rice = await addRice(page);
  const meal = mealFixture(kitchen, rice);
  await page.reload();
  await page.getByRole('button', { name: 'Cook', exact: true }).click();
  await page.getByRole('button', { name: 'Find meals', exact: true }).click();
  const clockStart = new Date();
  await page.clock.install({ time: clockStart });
  await page.clock.pauseAt(new Date(clockStart.getTime() + 60_000));

  let release: (() => void) | undefined;
  let attempt = 0;
  await page.route('**/api/meals', async (route) => {
    const current = ++attempt;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.fulfill(
      current === 1
        ? { status: 502, json: { error: 'Please try again.' } }
        : { json: { meals: [meal], message: '' } },
    );
  });
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  const loading = page.getByRole('status', { name: 'Finding meals', exact: true });
  await expect(loading).toContainText('A little pantry magic');
  await expect.poll(() => attempt).toBe(1);
  const initialHeight = (await loading.boundingBox())!.height;
  expect(
    await loading
      .locator('[aria-hidden] span')
      .first()
      .evaluate((element) => getComputedStyle(element).animationName),
  ).not.toBe('none');
  for (const phrase of [
    'A pinch of inspiration',
    'Good things take thyme',
    'Rice to the occasion',
    'Leftovers deserve a second act',
    'Small ingredients. Big possibilities.',
    'From odds and ends to dinner',
    'Less waste. More taste.',
  ]) {
    await page.clock.runFor(4_000);
    await expect(loading).toContainText(phrase);
    expect((await loading.boundingBox())!.height).toBe(initialHeight);
  }
  await testInfo.attach('meal-waiting', {
    body: await page.screenshot({
      path: testInfo.outputPath('meal-waiting.png'),
      animations: 'disabled',
    }),
    contentType: 'image/png',
  });
  await page.clock.runFor(4_000);
  await expect(loading).toContainText('A little pantry magic');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width,
  );
  await page.clock.runFor(4_000);
  await expect(loading).toContainText('A pinch of inspiration');
  release!();
  await expect(loading).toHaveCount(0);
  await expect(page.getByRole('alert').filter({ hasText: 'Please try again.' })).toBeVisible();

  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(loading).toContainText('A little pantry magic');
  await expect.poll(() => attempt).toBe(2);
  release!();
  await expect(loading).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cook this', exact: true })).toBeVisible();
  await page.clock.runFor(30_000);
  await expect(loading).toHaveCount(0);
});

test('meal loading steam is static with reduced motion', async ({ page, kitchen }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page, kitchen.owner);
  await addRice(page);
  await page.reload();
  let release: (() => void) | undefined;
  await page.route('**/api/meals', async (route) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.fulfill({ json: { meals: [], message: 'Try different ingredients.' } });
  });
  await page.getByRole('button', { name: 'Cook', exact: true }).click();
  await page.getByRole('button', { name: 'Find meals', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  const loading = page.getByRole('status', { name: 'Finding meals', exact: true });
  await expect(loading).toBeVisible();
  await expect.poll(() => release !== undefined).toBe(true);
  expect(
    await loading
      .locator('[aria-hidden] span')
      .evaluateAll((elements) =>
        elements.map((element) => getComputedStyle(element).animationName),
      ),
  ).toEqual(['none', 'none', 'none']);
  release!();
  await expect(loading).toHaveCount(0);
  await expect(page.getByText('Try different ingredients.', { exact: true })).toBeVisible();
});
