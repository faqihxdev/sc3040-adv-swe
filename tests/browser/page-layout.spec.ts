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
    const view = page.locator('.view-panel:not([hidden])');
    const heading = view.getByRole('heading', { name: title, exact: true });
    await expect(heading).toBeVisible();
    // A loading heading can be replaced during navigation. Measure the mounted view together.
    await expect(async () => {
      const headingBox = await heading.boundingBox();
      const viewBox = await view.boundingBox();
      expect(headingBox, `${tab} heading is mounted`).not.toBeNull();
      expect(viewBox, `${tab} view is mounted`).not.toBeNull();
      expect(Math.abs(headingBox!.x - viewBox!.x)).toBeLessThan(1);
      if (page.viewportSize()!.width < 640) {
        expect(headingBox!.x).toBe(8);
        const section = view.locator('.panel').first();
        await expect(section).toBeVisible();
        const sectionBox = await section.boundingBox();
        expect(sectionBox, `${tab} section is mounted`).not.toBeNull();
        expect(Math.abs(sectionBox!.x - headingBox!.x)).toBeLessThan(1);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
        page.viewportSize()!.width,
      );
    }).toPass({ timeout: 10_000 });
  }
  await page.screenshot({
    path: testInfo.outputPath('account-layout.png'),
    animations: 'disabled',
  });
});
