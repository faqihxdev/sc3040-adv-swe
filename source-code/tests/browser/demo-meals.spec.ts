import { createHmac, randomUUID } from 'node:crypto';
import { test, expect, signIn, state, action, selectOption } from './fixtures';
import { makeDemoSeed } from '../../src/domain/demo-data';
import { todaySingapore, validateAndRank } from '../../src/domain/meals';
import { commonStaples } from '../../src/domain/staples';
import type { AppState, RankedMeal } from '../../src/domain/model';
import saved from '../../src/server/demo-recipes.json';

// Mock only the saved-result transport. Confirmation and the disposable database are real.
function savedResult(current: AppState): RankedMeal[] {
  const staples = commonStaples.map((name, i) => ({ name, id: `staple-${i}` }));
  const candidates = saved.map((m) => ({
    ...m,
    ingredients: m.ingredients.map((i) => ({
      ingredientId: [...current.items, ...staples].find((item) => item.name === i.name)!.id,
      amount: i.amount,
      unit: i.unit,
    })),
  }));
  const sessionId = randomUUID();
  return validateAndRank(
    candidates,
    current.items,
    staples,
    { servings: 2, mealType: 'Dinner', preferences: '', staples: commonStaples, excludedIds: [] },
    current.exclusions,
    todaySingapore(),
  ).map((meal) => {
    const payload = Buffer.from(
      JSON.stringify({
        format: 2,
        id: sessionId,
        userId: current.user.id,
        householdId: current.household!.id,
        expires: Date.now() + 86400000,
        recipe: meal,
        trackedIds: meal.trackedItems.map((i) => i.id),
        ingredientNames: meal.ingredientNames,
        source: 'saved-demo',
      }),
    ).toString('base64url');
    return {
      ...meal,
      source: 'saved-demo',
      savedImage: saved.find((m) => m.name === meal.name)!.image,
      token: `${payload}.${createHmac('sha256', 'useeatnow-local-browser-test-signing-key').update(payload).digest('base64url')}`,
    };
  });
}

test('saved demo recovery continues through confirmation and Insights without AI calls @smoke', async ({
  page,
  kitchen,
}, testInfo) => {
  await page.clock.install();
  await signIn(page, kitchen.owner);
  const seed = makeDemoSeed(todaySingapore(), randomUUID);
  for (let i = 0; i < seed.items.length; i += 10) {
    const response = await action(page, {
      command: 'add_items',
      householdId: kitchen.householdId,
      requestId: randomUUID(),
      items: seed.items.slice(i, i + 10),
    });
    expect(response.status()).toBe(200);
  }
  expect((await action(page, { command: 'preferences', exclusions: ['Mushrooms'] })).status()).toBe(
    200,
  );
  await page.route('**/api/state', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...(await response.json()), demoMealsEnabled: true } });
  });
  const before = await state(page);
  const meals = savedResult(before);
  let liveCalls = 0;
  let imageCalls = 0;
  let savedCalls = 0;
  await page.route('**/api/meals', (route) => {
    liveCalls++;
    return route.fulfill({ status: 502, json: { error: 'Meal generation failed. Try again.' } });
  });
  await page.route('**/api/meals/image', (route) => {
    imageCalls++;
    return route.fulfill({ status: 503, json: { error: 'Unavailable' } });
  });
  await page.route('**/api/meals/demo', (route) => {
    savedCalls++;
    return route.fulfill(
      savedCalls === 1
        ? { status: 503, json: { error: 'Temporary connection issue. Try again.' } }
        : { json: { meals, message: '' } },
    );
  });
  await page.reload();
  await page.getByRole('button', { name: 'Cook', exact: true }).click();
  await page.clock.fastForward(31000);
  await expect(
    page.getByRole('button', { name: 'Use saved demo recipes', exact: true }),
  ).toBeVisible();
  const savedLink = page.getByRole('button', { name: 'Use saved demo recipes', exact: true });
  const savedLabel = savedLink.getByText('Use saved', { exact: true });
  await expect(savedLink).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(savedLabel).toHaveCSS('opacity', '0');
  await expect(savedLink.locator('svg')).toBeVisible();
  if (!testInfo.project.use.isMobile) {
    await savedLink.hover();
    await page.clock.runFor(200);
    await expect(savedLabel).toHaveCSS('opacity', '1');
    await page.mouse.move(0, 0);
    await page.clock.runFor(200);
    await expect(savedLabel).toHaveCSS('opacity', '0');
  }
  await page.getByRole('button', { name: 'Find meals', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(savedLink).toBeFocused();
  await expect(savedLink).toHaveCSS('outline-style', 'solid');
  await page.clock.runFor(200);
  await expect(savedLabel).toHaveCSS('opacity', '1');
  const linkBounds = await savedLink.boundingBox();
  const viewBounds = await page.locator('.view-panel:not([hidden])').boundingBox();
  expect(linkBounds!.height).toBeGreaterThanOrEqual(44);
  expect(
    Math.abs(linkBounds!.x + linkBounds!.width - viewBounds!.x - viewBounds!.width),
  ).toBeLessThan(1);
  expect(
    Math.abs(linkBounds!.y + linkBounds!.height - viewBounds!.y - viewBounds!.height),
  ).toBeLessThan(1);
  const mobileNav = page.locator('[data-mobile-nav]');
  if (await mobileNav.isVisible()) {
    expect(linkBounds!.y + linkBounds!.height).toBeLessThan((await mobileNav.boundingBox())!.y);
  }
  await page.screenshot({ path: testInfo.outputPath('saved-demo-link.png'), fullPage: true });
  await page.getByRole('button', { name: 'Find meals', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Meal generation failed' })).toBeVisible();
  const fallback = page.getByRole('button', { name: 'Use saved demo recipes', exact: true });
  await fallback.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Temporary connection' })).toBeVisible();
  await fallback.click();
  await expect(page.getByRole('heading', { name: meals[0].name, exact: true })).toBeVisible();
  await expect(page.getByText('Saved demo recipes', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'See recipe', exact: true })).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width,
  );
  for (const image of await page.locator('article img').all()) await image.scrollIntoViewIfNeeded();
  await expect
    .poll(async () =>
      page
        .locator('article img')
        .evaluateAll((imgs) => imgs.every((img) => (img as HTMLImageElement).naturalWidth > 0)),
    )
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath('saved-demo-recipes.png'), fullPage: true });
  expect((await state(page)).outcomes).toHaveLength(0);
  await page.getByRole('button', { name: 'Cook this', exact: true }).first().click();
  await expect(page.getByText('Saved demo recipes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'I’ve finished cooking' }).click();
  await page.getByRole('button', { name: 'Waste details for Bean sprouts', exact: true }).click();
  await page.getByLabel('Waste amount for Bean sprouts (optional)', { exact: true }).fill('10');
  await selectOption(page, 'Waste reason for Bean sprouts', 'Preparation scraps');
  await page.getByRole('button', { name: 'Confirm meal', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible();
  const after = await state(page);
  expect(after.items.find((i) => i.name === 'Bean sprouts')!.quantity).toBe(70);
  expect(after.outcomes).toHaveLength(1);
  expect(after.outcomes[0].recipe).toMatchObject({ source: 'saved-demo' });
  expect(after.outcomes[0].ingredients.find((i) => i.name === 'Bean sprouts')).toMatchObject({
    used_amount: 100,
    discarded_amount: 10,
    discard_reason: 'prep',
  });
  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  await page.getByRole('button', { name: 'View ingredients', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(meals[0].name);
  expect(liveCalls).toBe(1);
  expect(imageCalls).toBe(0);
});

test('slow live request can be replaced without its late response overriding saved results', async ({
  page,
  kitchen,
}) => {
  await page.clock.install();
  await signIn(page, kitchen.owner);
  const seed = makeDemoSeed(todaySingapore(), randomUUID);
  for (let i = 0; i < seed.items.length; i += 10)
    expect(
      (
        await action(page, {
          command: 'add_items',
          householdId: kitchen.householdId,
          requestId: randomUUID(),
          items: seed.items.slice(i, i + 10),
        })
      ).status(),
    ).toBe(200);
  const meals = savedResult(await state(page));
  await page.route('**/api/state', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...(await response.json()), demoMealsEnabled: true } });
  });
  await page.route('**/api/meals/demo', (route) => route.fulfill({ json: { meals, message: '' } }));
  let release: (() => void) | undefined;
  let calls = 0;
  await page.route('**/api/meals', async (route) => {
    if (++calls === 1)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    await route.fulfill({
      json: {
        meals: [
          { ...meals[0], name: 'Fresh live suggestion', source: undefined, savedImage: undefined },
        ],
        message: '',
      },
    });
  });
  await page.route('**/api/meals/image', (route) =>
    route.fulfill({ status: 403, json: { error: 'Disabled for test' } }),
  );
  await page.reload();
  await page.getByRole('button', { name: 'Cook', exact: true }).click();
  await page.getByRole('button', { name: 'Find meals', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Meal planning' })).toBeVisible();
  await expect.poll(() => calls).toBe(1);
  await page.clock.fastForward(31000);
  await page.getByRole('button', { name: 'Use saved demo recipes', exact: true }).click();
  await expect(page.getByRole('heading', { name: meals[0].name, exact: true })).toBeVisible();
  release!();
  await expect(
    page.getByRole('heading', { name: 'Fresh live suggestion', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Change preferences', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Fresh live suggestion', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Saved demo recipes', { exact: true })).toHaveCount(0);
  expect(calls).toBe(2);
});

test('ordinary households have no saved-demo control or endpoint access', async ({
  page,
  kitchen,
}) => {
  await signIn(page, kitchen.owner);
  await page.getByRole('button', { name: 'Cook', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Use saved demo recipes', exact: true }),
  ).toHaveCount(0);
  const response = await page.request.post('/api/meals/demo', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: {
      servings: 2,
      mealType: 'Dinner',
      preferences: '',
      staples: commonStaples,
      excludedIds: [],
    },
  });
  expect(response.status()).toBe(403);
});
