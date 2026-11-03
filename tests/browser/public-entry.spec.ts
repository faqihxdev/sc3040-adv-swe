import { test, expect, signIn } from './fixtures';

test('signed-out entry never streams the private dashboard skeleton @smoke', async ({ page }) => {
  const response = await page.goto('/?view=inventory');
  expect(response).not.toBeNull();
  expect(response!.ok()).toBe(true);
  const html = await response!.text();
  expect(html).not.toContain('Opening your kitchen');
});

test('signing out returns to the public page and protects household data', async ({
  page,
  kitchen,
}) => {
  await signIn(page, kitchen.owner);
  await page.goto('/?view=account');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Cook with what you have.', exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL('http://127.0.0.1:3100/');
  expect((await page.request.get('/api/state')).status()).toBe(401);
});

test('meal gallery pauses on focus and hover and respects reduced motion', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const gallery = page.getByRole('figure', { name: 'Meal ideas', exact: true });
  const running = () =>
    gallery.evaluate((element) =>
      element
        .getAnimations({ subtree: true })
        .some((animation) => animation.playState === 'running'),
    );
  await expect.poll(running).toBe(true);
  await gallery.focus();
  await expect.poll(running).toBe(false);
  await page.getByRole('link', { name: 'Open your kitchen', exact: true }).focus();
  await expect.poll(running).toBe(true);
  if (!testInfo.project.use.isMobile) {
    await gallery.hover();
    await expect.poll(running).toBe(false);
    await page.mouse.move(1, 1);
    await expect.poll(running).toBe(true);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(running).toBe(false);
});

test('visitors can browse the landing page before choosing to sign in', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Cook with what you have.', exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL('http://127.0.0.1:3100/');
  await expect(page.getByLabel('Email', { exact: true })).toHaveCount(0);
  const gallery = page.getByRole('figure', { name: 'Meal ideas', exact: true });
  const imageColumns = await gallery
    .getByRole('img')
    .evaluateAll(
      (images) =>
        new Set(images.map((image) => Math.round(image.getBoundingClientRect().left))).size,
    );
  expect(imageColumns).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
  ).toBe(true);
  await expect(page.getByRole('link', { name: 'Open your kitchen', exact: true })).toBeInViewport({
    ratio: 1,
  });
  await expect(page.getByRole('group', { name: 'Colour theme', exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('landing.png'), fullPage: true });
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('landing-light.png'), fullPage: true });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  const home = page.getByRole('link', { name: 'UseEatNow home', exact: true });
  expect((await home.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(
    page.getByRole('heading', { name: 'Cook with what you have.', exact: true }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('sign-in.png'), fullPage: true });
  await page.getByRole('button', { name: 'light theme', exact: true }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.screenshot({ path: testInfo.outputPath('sign-in-light.png'), fullPage: true });
  await page.getByRole('link', { name: 'Back to home', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Cook with what you have.', exact: true }),
  ).toBeVisible();
});
