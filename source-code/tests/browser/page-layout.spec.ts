import { test, expect, signIn } from './fixtures';

test('page titles align with section edges across all five views', async ({
  page,
  kitchen,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page, kitchen.owner);
  for (const [tab, title] of [
    ['Inventory', 'Inventory'],
    ['Cook', 'Meal suggestions'],
    ['Insights', 'Insights'],
    ['Household', 'Household'],
    ['Account', 'Account'],
  ]) {
    await page
      .getByRole('button', { name: tab === 'Account' ? /^Account(?: for .+)?$/ : tab, exact: true })
      .click();
    const heading = page.getByRole('heading', { name: title, exact: true });
    await expect(heading).toBeVisible();
    const view = page.locator('.view-panel:not([hidden])');
    const headingBox = (await heading.boundingBox())!;
    const viewBox = (await view.boundingBox())!;
    expect(Math.abs(headingBox.x - viewBox.x)).toBeLessThan(1);
    if (page.viewportSize()!.width < 640) {
      expect(headingBox.x).toBe(8);
      const section = view.locator('.panel').first();
      await expect(section).toBeVisible();
      expect(Math.abs((await section.boundingBox())!.x - headingBox.x)).toBeLessThan(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
      page.viewportSize()!.width,
    );
  }
  await page.screenshot({
    path: testInfo.outputPath('account-layout.png'),
    animations: 'disabled',
  });
});
