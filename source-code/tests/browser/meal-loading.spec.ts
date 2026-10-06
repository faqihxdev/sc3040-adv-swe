import { test, expect, signIn, addRice, mealFixture } from './fixtures';

test('meal loading runs its opening once, loops waiting phrases and restarts on retry', async ({
  page,
  kitchen,
}, testInfo) => {
  await page.setViewportSize(
    testInfo.project.name.includes('Mobile')
      ? { width: 412, height: 915 }
      : { width: 1440, height: 900 },
  );
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
  const loading = page.getByRole('region', { name: 'Meal planning', exact: true });
  await expect(loading).toContainText('Looking through your pantry');
  await expect.poll(() => attempt).toBe(1);
  const initialHeight = (await loading.boundingBox())!.height;
  expect(
    await loading
      .locator('svg > g > path')
      .first()
      .evaluate((element) => getComputedStyle(element).animationName),
  ).not.toBe('none');
  for (const phrase of [
    'Pairing up your ingredients',
    'Dreaming up a few dishes',
    'A little pantry magic',
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
  await expect(loading).not.toContainText('Looking through your pantry');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width,
  );
  await page.clock.runFor(4_000);
  await expect(loading).toContainText('A pinch of inspiration');
  release!();
  await expect(loading).toHaveCount(0);
  await expect(page.getByRole('alert').filter({ hasText: 'Please try again.' })).toBeVisible();

  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(loading).toContainText('Looking through your pantry');
  await expect.poll(() => attempt).toBe(2);
  release!();
  await expect(loading).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cook this', exact: true })).toBeVisible();
  await page.clock.runFor(30_000);
  await expect(loading).toHaveCount(0);
});

test('meal loading animation is static with reduced motion', async ({
  page,
  kitchen,
}, testInfo) => {
  await page.setViewportSize(
    testInfo.project.name.includes('Mobile')
      ? { width: 412, height: 915 }
      : { width: 1440, height: 900 },
  );
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
  const loading = page.getByRole('region', { name: 'Meal planning', exact: true });
  await expect(loading).toBeVisible();
  await expect.poll(() => release !== undefined).toBe(true);
  const animations = await loading
    .locator('svg *')
    .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).animationName));
  expect(animations.length).toBeGreaterThan(0);
  expect(animations.every((name) => name === 'none')).toBe(true);
  release!();
  await expect(loading).toHaveCount(0);
  await expect(page.getByText('Try different ingredients.', { exact: true })).toBeVisible();
});
