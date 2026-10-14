import { test, expect, signIn, addRice, mealFixture } from './fixtures';
import { todaySingapore } from '../../src/domain/meals';

const pixel =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';

test('AI suggestions: images start together, retry once independently and keep manual retry', async ({
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
  const meals = ['Chicken, Fishball, and Vegetable Rice Soup', 'Prawn laksa', 'Chicken rice'].map(
    (name, index) => ({
      ...mealFixture(kitchen, rice),
      name,
      summary: [
        'A one-pot rice soup with chicken breast, fishballs, cabbage, carrots and ginger in chicken stock.',
        'Rice noodles in a fragrant coconut broth.',
        'Ginger rice with tender chicken and a light broth on the side.',
      ][index],
      score: (100 * [21, 14, 8][index]) / 29,
      points: [21, 14, 8][index],
      totalPoints: 29,
      trackedItems: [{ ...rice, expiry_date: index === 0 ? todaySingapore() : rice.expiry_date }],
    }),
  );
  await page.route('**/api/meals', (route) =>
    route.fulfill({
      contentType: 'application/x-ndjson',
      body:
        [
          { type: 'stage', stage: 'generating' },
          { type: 'stage', stage: 'validating' },
          { type: 'stage', stage: 'ranking' },
          { type: 'result', result: { meals, message: '' } },
        ]
          .map((event) => JSON.stringify(event))
          .join('\n') + '\n',
    }),
  );
  let started = 0;
  let pending = 0;
  let peak = 0;
  const attempts = new Map<string, number>();
  const releases: (() => void)[] = [];
  await page.route('**/api/meals/image', async (route) => {
    started++;
    const token = route.request().postDataJSON().token as string;
    const attempt = (attempts.get(token) ?? 0) + 1;
    attempts.set(token, attempt);
    const fails =
      (token === meals[1].token && attempt === 1) || (token === meals[2].token && attempt <= 2);
    peak = Math.max(peak, ++pending);
    await new Promise<void>((resolve) => releases.push(resolve));
    pending--;
    await route.fulfill(
      fails ? { status: 502, json: { error: 'Image failed.' } } : { json: { image: pixel } },
    );
  });
  await page.reload();
  await page.getByRole('button', { name: 'Cook', exact: true }).click();
  await page.getByRole('button', { name: 'Find meals', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cook this', exact: true })).toHaveCount(3);
  await expect(page.getByText('AI-created for your inventory', { exact: true })).toHaveCount(0);
  await expect(page.getByText('AI illustration', { exact: true })).toHaveCount(0);
  await expect.poll(() => started).toBe(3);
  releases[0]();
  releases[1]();
  releases[2]();
  await expect.poll(() => started).toBe(5);
  await expect(page.getByRole('img', { name: /^AI illustration/ })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Retry image', exact: true })).toHaveCount(0);
  releases[3]();
  releases[4]();
  await expect(page.getByRole('img', { name: /^AI illustration/ })).toHaveCount(2);
  await expect(page.getByText('Image unavailable', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retry image', exact: true }).click();
  await expect.poll(() => started).toBe(6);
  releases[5]();
  await expect(page.getByRole('img', { name: /^AI illustration/ })).toHaveCount(3);
  const cards = page.getByRole('article');
  await expect(cards.first()).toContainText('Expiry coverage 72%');
  const scoreTrigger = cards
    .first()
    .getByRole('button', { name: `Why ${meals[0].name}?`, exact: true });
  await scoreTrigger.focus();
  await page.keyboard.press('Enter');
  const scoreHelp = page.getByRole('dialog', { name: `Why ${meals[0].name}?`, exact: true });
  await expect(scoreHelp).toContainText('21 ÷ 29 × 100 ≈ 72%');
  await expect(scoreHelp).toContainText('using stock at generation');
  await expect(scoreHelp).toContainText(
    'Within 3 days: 3 points. Within 4 to 7 days: 2. Later: 1.',
  );
  await page.screenshot({ path: testInfo.outputPath('expiry-score.png'), animations: 'disabled' });
  await scoreHelp.getByRole('button', { name: 'Close help', exact: true }).click();
  await expect(scoreHelp).toBeHidden();
  const badge = await page.getByText('Use first', { exact: true }).boundingBox();
  const picture = await cards.first().locator('[data-meal-image]').boundingBox();
  expect(badge!.y).toBeGreaterThan(picture!.y);
  expect(badge!.y + badge!.height).toBeLessThan(picture!.y + picture!.height);
  if (!testInfo.project.name.includes('Mobile')) {
    for (const selector of [
      'h2',
      ':scope > p',
      '[data-meal-meta]',
      '[data-meal-context]',
      '[data-meal-actions]',
    ]) {
      const tops = await cards
        .locator(selector)
        .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top));
      expect(tops).toHaveLength(3);
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(2);
    }
  }
  expect(started).toBe(6);
  expect(meals.map((meal) => attempts.get(meal.token))).toEqual([1, 2, 3]);
  expect(peak).toBe(3);
  await page.screenshot({
    path: testInfo.outputPath('ai-suggestions.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'See recipe', exact: true }).first().click();
  await expect(page.getByRole('checkbox', { name: /^Step / })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cook this', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /^Step / })).toHaveCount(4);
  await page.getByText('Rinse the rice.', { exact: true }).click();
  await expect(page.getByText('1 of 4 complete', { exact: true })).toBeVisible();
  expect(started).toBe(6);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width,
  );
  await page.screenshot({
    path: testInfo.outputPath('cooking.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'I’ve finished cooking', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Record meal', exact: true })).toContainText(
    'Left 400 g',
  );
  await page.screenshot({
    path: testInfo.outputPath('record-meal.png'),
    fullPage: false,
    animations: 'disabled',
  });
});

test('image retries stop when cooking ends and skip account or usage errors', async ({
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
  const meals = [0, 1, 2].map(() => mealFixture(kitchen, rice));
  await page.route('**/api/meals', (route) => route.fulfill({ json: { meals, message: '' } }));
  let started = 0;
  const releases: (() => void)[] = [];
  await page.route('**/api/meals/image', async (route) => {
    const index = started++;
    await new Promise<void>((resolve) => releases.push(resolve));
    await route.fulfill({
      status: [401, 429, 502][index] ?? 502,
      json: { error: 'Image failed.' },
    });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Cook', exact: true }).click();
  await page.getByRole('button', { name: 'Find meals', exact: true }).click();
  const start = new Date();
  await page.clock.install({ time: start });
  await page.clock.pauseAt(new Date(start.getTime() + 60_000));
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect.poll(() => started).toBe(3);
  releases[0]();
  releases[1]();
  await expect(page.getByRole('button', { name: 'Retry image', exact: true })).toHaveCount(2);
  await page.clock.runFor(2_000);
  expect(started).toBe(3);
  releases[2]();
  await expect(page.getByText('Retrying image', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cook this', exact: true }).first().click();
  await page.getByRole('button', { name: 'End session', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'End this cooking session?', exact: true })
    .getByRole('button', { name: 'End session', exact: true })
    .click();
  await page.clock.runFor(5_000);
  expect(started).toBe(3);
  await expect(page.getByText('Retrying image', { exact: true })).toHaveCount(0);
});

test('generation cancel preserves stock and permits another request', async ({
  page,
  kitchen,
}, testInfo) => {
  await page.setViewportSize(
    testInfo.project.name.includes('Mobile')
      ? { width: 412, height: 915 }
      : { width: 1440, height: 900 },
  );
  await signIn(page, kitchen.owner);
  await addRice(page);
  let release: (() => void) | undefined;
  await page.route('**/api/meals', async (route) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route
      .fulfill({ json: { meals: [], message: 'No feasible meals.' } })
      .catch(() => undefined);
  });
  await page.reload();
  await page.getByRole('button', { name: 'Cook', exact: true }).click();
  await page.getByRole('button', { name: 'Find meals', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  const planning = page.getByRole('region', { name: 'Meal planning', exact: true });
  await expect(planning).toBeVisible();
  await expect.poll(() => Boolean(release)).toBe(true);
  await planning.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(planning).toBeHidden();
  await expect(
    page.getByText('Generation cancelled. Your inventory is unchanged.', { exact: true }),
  ).toBeVisible();
  release!();
  await page.getByRole('button', { name: 'Find meals', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Find meals', exact: true })).toBeVisible();
});
