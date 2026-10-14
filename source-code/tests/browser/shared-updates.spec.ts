import { test, expect, signIn, addRice, action, state } from './fixtures';

test('shared stock refresh highlights only the changed value and announces the member once', async ({
  page,
  browser,
  kitchen,
}, testInfo) => {
  await signIn(page, kitchen.owner);
  const rice = await addRice(page);
  const context = await browser.newContext({
    ...testInfo.project.use,
    baseURL: 'http://127.0.0.1:3100',
  });
  try {
    const member = await context.newPage();
    await member.clock.install();
    await signIn(member, kitchen.member);
    const row = member.locator(`[data-inventory-item="${rice.id}"]`);
    await expect(row).not.toHaveAttribute('data-updated');
    await expect(member.locator('[data-sonner-toast]')).toHaveCount(0);
    const before = await row.boundingBox();
    const amount = row.locator('[data-inventory-field="amount"]:visible');
    const normalColor = await amount.evaluate((element) => getComputedStyle(element).color);

    const response = await action(page, { ...rice, command: 'edit_item', quantity: 450 });
    expect(response.status()).toBe(200);
    await member.clock.fastForward(30_001);
    await expect(row).toHaveAttribute('data-updated', 'true');
    await expect(member.getByText('Test owner updated Rice', { exact: true })).toBeVisible();
    await expect(member.getByText('500 g → 450 g', { exact: true })).toBeVisible();
    expect(await row.boundingBox()).toEqual(before);
    await expect(amount).toHaveAttribute('data-updated-field', 'amount');
    await expect(
      row.locator('[data-updated-field]:not([data-updated-field="amount"])'),
    ).toHaveCount(0);
    await expect(row).toHaveCSS('box-shadow', 'none');
    await expect(row).toHaveCSS('border-left-width', '0px');
    await expect(row).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    // Sample the real CSS animation without depending on wall-clock screenshot timing.
    await amount.evaluate((element) => {
      const animation = element.getAnimations()[0];
      animation.pause();
      animation.currentTime = 0;
    });
    await expect(amount).toHaveCSS('color', 'rgb(255, 138, 31)');
    await amount.evaluate((element) => {
      element.getAnimations()[0].currentTime = 4200;
    });
    await expect(amount).not.toHaveCSS('color', 'rgb(255, 138, 31)');
    await expect(amount).not.toHaveCSS('color', normalColor);
    await amount.evaluate((element) => {
      element.getAnimations()[0].currentTime = 6000;
    });
    await expect(amount).toHaveCSS('color', normalColor);
    await amount.evaluate((element) => {
      element.getAnimations()[0].currentTime = 0;
    });
    await member.clock.runFor(500);
    await expect(member.locator('[data-sonner-toast]')).toHaveAttribute('data-mounted', 'true');
    await expect(member.locator('[data-sonner-toast]')).toHaveCSS('opacity', '1');
    expect((await member.locator('[data-sonner-toast]').boundingBox())!.y).toBeGreaterThanOrEqual(
      0,
    );
    await member.screenshot({ path: testInfo.outputPath('shared-update.png') });

    await member.emulateMedia({ reducedMotion: 'reduce' });
    await expect(amount).toHaveCSS('animation-name', 'none');
    await expect(amount).toHaveCSS('color', 'rgb(255, 138, 31)');
    await member.evaluate(() => document.documentElement.classList.remove('dark'));
    await expect(amount).toHaveCSS('color', 'rgb(145, 64, 0)');
    await member.screenshot({ path: testInfo.outputPath('shared-update-light.png') });
    await member.evaluate(() => document.documentElement.classList.add('dark'));
    await member.emulateMedia({ forcedColors: 'active' });
    await expect(amount).toHaveCSS('text-decoration-line', 'underline');
    await expect(row).toHaveCSS('border-left-width', '0px');
    await member.emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' });
    await member.clock.fastForward(7_000);
    await expect(row).not.toHaveAttribute('data-updated');
    await expect(amount).toHaveCSS('color', normalColor);
    await member.clock.fastForward(30_001);
    await expect(member.locator('[data-sonner-toast]')).toHaveCount(0);

    const latestRice = (await state(page)).items.find((item) => item.id === rice.id)!;
    expect(
      (await action(page, { ...latestRice, command: 'edit_item', quantity: 400 })).status(),
    ).toBe(200);
    await member.clock.fastForward(30_001);
    await expect(amount).toHaveText('400 g');
    await expect(amount).toHaveAttribute('data-updated-field', 'amount');
    await expect(amount).toHaveCSS('color', 'rgb(255, 138, 31)');
  } finally {
    await context.close();
  }
});

test('a remote reset clears the open dietary editor', async ({ page, kitchen }) => {
  await page.clock.install();
  await signIn(page, kitchen.member);
  expect((await action(page, { command: 'preferences', exclusions: ['Mushrooms'] })).status()).toBe(
    200,
  );
  await page.goto('/?view=household');
  await expect(page.getByRole('button', { name: 'Remove Mushrooms' })).toBeVisible();
  // Database reset semantics are covered by demo-reset.sql; exercise the polling UI here.
  await page.route('**/api/state', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.exclusions = [];
    data.activity = [
      {
        id: Math.max(0, ...data.activity.map((entry: { id: number }) => entry.id)) + 1,
        actor_id: kitchen.owner.id,
        action: 'demo_reset',
        label: 'Restored demo data',
        created_at: new Date().toISOString(),
      },
    ];
    await route.fulfill({ json: data });
  });
  await page.clock.fastForward(30_001);
  await expect(page.getByRole('button', { name: 'Remove Mushrooms' })).toHaveCount(0);
  await expect(page.getByText('Demo data restored', { exact: true })).toBeVisible();
});
