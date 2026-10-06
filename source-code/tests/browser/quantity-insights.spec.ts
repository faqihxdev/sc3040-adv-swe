import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { Locator } from '@playwright/test';
import { makeDemoSeed } from '../../src/domain/demo-data';
import { todaySingapore } from '../../src/domain/meals';
import { test, expect, signIn, selectOption, state } from './fixtures';

test('graph help: explain waste over time from the keyboard', async ({
  page,
  kitchen,
}, testInfo) => {
  const mobile = testInfo.project.name.includes('Mobile');
  await page.setViewportSize(mobile ? { width: 412, height: 915 } : { width: 1440, height: 900 });
  await signIn(page, kitchen.owner);
  await page.goto('/?view=analytics');

  const emptyNearExpiry = page.getByRole('region', { name: 'Used near expiry', exact: true });
  await expect(emptyNearExpiry).toContainText(
    'Confirm a meal to start tracking expiry at cooking.',
  );
  await expect(emptyNearExpiry.getByRole('button', { name: 'View ingredients' })).toBeDisabled();

  const help = page.getByRole('button', { name: 'About waste over time', exact: true });
  await help.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'About waste over time', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(
    'Each bar counts discard incidents across all units. Amounts stay separate.',
  );
  const dialogBox = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(dialogBox).not.toBeNull();
  expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
  expect(dialogBox!.y).toBeGreaterThanOrEqual(0);
  expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(viewport.height + 1);
  await page.screenshot({
    path: testInfo.outputPath(
      mobile ? 'waste-over-time-help-mobile.png' : 'waste-over-time-help-desktop.png',
    ),
    fullPage: false,
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.waitForFunction(
    (element) => document.activeElement === element,
    await help.elementHandle(),
  );
  for (const title of [
    'About why discarded',
    'About waste hotspots',
    'About next actions',
    'About used near expiry',
  ]) {
    const trigger = page.getByRole('button', { name: title, exact: true });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const helpDialog = page.getByRole('dialog', { name: title, exact: true });
    await expect(helpDialog).toBeVisible();
    await helpDialog.getByRole('button', { name: 'Close help', exact: true }).click();
    await expect(helpDialog).toBeHidden();
  }
});

test('mission-control: expiry outlook filters actions and shows four chart panels', async ({
  page,
  kitchen,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, kitchen.owner);
  await page.goto('/?view=analytics');

  const outlook = page.getByRole('region', { name: 'Expiry outlook', exact: true });
  await expect(outlook).toBeVisible();
  for (const label of ['Past date', 'Next 3 days', '4 to 7 days', 'Later']) {
    await expect(
      outlook.getByRole('button', { name: new RegExp(`^${label}, \\d+ items?$`) }),
    ).toBeVisible();
  }

  const pastDate = outlook.getByRole('button', { name: /^Past date, \d+ items?$/ });
  await pastDate.click();
  await expect(pastDate).toHaveAttribute('aria-pressed', 'true');
  await pastDate.click();
  await expect(pastDate).toHaveAttribute('aria-pressed', 'false');

  const chartNames = ['Used near expiry', 'Waste over time', 'Why discarded', 'Waste hotspots'];
  const chartSections = chartNames.map((name) => page.getByRole('region', { name, exact: true }));
  for (const section of chartSections) {
    await expect(section).toBeVisible();
    await expect(section.locator('[data-chart-area]')).toBeVisible();
    await expect
      .poll(() => section.locator('[data-chart-area]').boundingBox())
      .toMatchObject({ height: 256 });
  }
  const boxes = await Promise.all(chartSections.map((section) => section.boundingBox()));
  expect(boxes.every(Boolean)).toBe(true);
  for (const box of boxes) expect(box!.height).toBeGreaterThan(0);
});

test('next actions: expansion and expiry filters keep the panel stable', async ({
  page,
  kitchen,
}, testInfo) => {
  const mobile = testInfo.project.name.includes('Mobile');
  await page.setViewportSize(mobile ? { width: 412, height: 915 } : { width: 1440, height: 900 });
  await signIn(page, kitchen.owner);
  const household = (await state(page)).household!;
  const today = todaySingapore();
  const seed = makeDemoSeed(today, randomUUID);
  for (const item of seed.items) {
    const days = (Date.parse(item.expiry_date) - Date.parse(today)) / 86400000;
    if (days >= 4 && days <= 7)
      item.expiry_date = new Date(Date.parse(today) + 14 * 86400000).toISOString().slice(0, 10);
  }
  seed.items[0].expiry_date = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const reset = await admin.rpc('reset_demo', {
    actor: kitchen.owner.id,
    household: kitchen.householdId,
    expected_version: household.version,
    items_data: seed.items,
    outcomes_data: seed.outcomes,
    events_data: seed.events,
  });
  expect(reset.error).toBeNull();
  await page.goto('/?view=analytics');

  const panel = page.getByRole('region', { name: 'Next actions', exact: true });
  const outlook = panel.getByRole('region', { name: 'Expiry outlook', exact: true });
  const list = panel.getByRole('region', { name: 'Recommended actions', exact: true });
  const rows = list.locator('li');
  await expect(rows).toHaveCount(4);
  await expect(list).toHaveAttribute('tabindex', '0');
  const baseline = await Promise.all(
    [panel, outlook, list].map((element) => element.boundingBox()),
  );
  expect(baseline.every(Boolean)).toBe(true);
  expect(baseline[2]!.height).toBe(mobile ? 320 : 288);
  const expectStableHeights = async () => {
    const current = await Promise.all(
      [panel, outlook, list].map((element) => element.boundingBox()),
    );
    current.forEach((box, index) => {
      expect(box).not.toBeNull();
      expect(Math.abs(box!.height - baseline[index]!.height)).toBeLessThanOrEqual(1);
    });
  };
  await page.screenshot({
    path: testInfo.outputPath(
      mobile ? 'next-actions-default-mobile.png' : 'next-actions-default-desktop.png',
    ),
    fullPage: false,
    animations: 'disabled',
  });

  await panel.getByRole('button', { name: /View all \d+/ }).click();
  expect(await rows.count()).toBeGreaterThan(4);
  expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await expectStableHeights();
  await list.focus();
  await page.keyboard.press('End');
  await expect
    .poll(() =>
      list.evaluate(
        (element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 1,
      ),
    )
    .toBe(true);
  const listBox = await list.boundingBox();
  const lastRowBox = await rows.last().boundingBox();
  expect(lastRowBox!.y).toBeGreaterThanOrEqual(listBox!.y - 1);
  expect(lastRowBox!.y + lastRowBox!.height).toBeLessThanOrEqual(listBox!.y + listBox!.height + 1);
  await page.screenshot({
    path: testInfo.outputPath(
      mobile ? 'next-actions-expanded-mobile.png' : 'next-actions-expanded-desktop.png',
    ),
    fullPage: false,
    animations: 'disabled',
  });
  await panel.getByRole('button', { name: 'Show fewer', exact: true }).click();
  await expect(rows).toHaveCount(4);
  expect(await list.evaluate((element) => element.scrollTop)).toBe(0);
  await expectStableHeights();

  const pastDate = outlook.getByRole('button', { name: 'Past date, 1 item', exact: true });
  await pastDate.click();
  await expect(rows).toHaveCount(1);
  await expect(pastDate).toHaveAttribute('aria-pressed', 'true');
  await expectStableHeights();
  await pastDate.click();
  await expect(rows).toHaveCount(4);
  await expectStableHeights();

  const emptyRange = outlook.getByRole('button', { name: '4 to 7 days, 0 items', exact: true });
  await emptyRange.click();
  await expect(rows).toHaveCount(0);
  await expect(list).toContainText('No stock entries in this expiry range.');
  await expectStableHeights();
  expect(await list.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({
    path: testInfo.outputPath(
      mobile ? 'next-actions-empty-mobile.png' : 'next-actions-empty-desktop.png',
    ),
    fullPage: false,
    animations: 'disabled',
  });
});

test('quantity insights: action queue, matched charts and amount records', async ({
  page,
  kitchen,
}, testInfo) => {
  const mobile = testInfo.project.name.includes('Mobile');
  await page.setViewportSize(mobile ? { width: 412, height: 915 } : { width: 1440, height: 900 });
  await signIn(page, kitchen.owner);
  const household = (await state(page)).household!;
  const seed = makeDemoSeed(todaySingapore(), randomUUID);
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const reset = await admin.rpc('reset_demo', {
    actor: kitchen.owner.id,
    household: kitchen.householdId,
    expected_version: household.version,
    items_data: seed.items,
    outcomes_data: seed.outcomes,
    events_data: seed.events,
  });
  expect(reset.error).toBeNull();
  await page.goto('/?view=analytics');
  if (mobile)
    expect(await page.evaluate(() => innerWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width + 1,
    );
  const nextActions = page.getByRole('region', { name: 'Next actions', exact: true });
  await expect(nextActions).toBeVisible();
  const outlook = nextActions.getByRole('region', { name: 'Expiry outlook', exact: true });
  await expect(outlook).toBeVisible();
  const expiryButtons = [
    /^Past date, \d+ items?$/,
    /^Next 3 days, \d+ items?$/,
    /^4 to 7 days, \d+ items?$/,
    /^Later, \d+ items?$/,
  ].map((name) => outlook.getByRole('button', { name }));
  for (const button of expiryButtons) await expect(button).toBeVisible();
  const expiryLabels = await Promise.all(
    expiryButtons.map((button) => button.getAttribute('aria-label')),
  );
  await expectExpiryCountPositions(outlook);
  await selectOption(page, 'Reporting period', 'Last 7 days');
  expect(
    await Promise.all(expiryButtons.map((button) => button.getAttribute('aria-label'))),
  ).toEqual(expiryLabels);
  await selectOption(page, 'Reporting period', 'Last 28 days');
  const beanRows = nextActions.getByText('Bean sprouts', { exact: true });
  await expect(beanRows).toHaveCount(1);
  await expect(nextActions).toContainText(/Expiry (today|tomorrow|in \d+ days)/);
  await expect(nextActions).toContainText('3 previous discards');
  await expect(nextActions).not.toContainText(
    '3 previous spoilage or past-date discards. Buy less next time.',
  );
  const beanHelpTrigger = nextActions.getByRole('button', {
    name: 'Why Bean sprouts?',
    exact: true,
  });
  await beanHelpTrigger.click();
  const beanHelp = page.getByRole('dialog', { name: 'Why Bean sprouts?', exact: true });
  await expect(beanHelp).toBeVisible();
  await expect(beanHelp).toContainText(
    '3 previous spoilage or past-date discards. Buy less next time.',
  );
  await beanHelp.getByRole('button', { name: 'Close help', exact: true }).click();
  await expect(beanHelp).toBeHidden();
  const nearExpiry = page.getByRole('region', { name: 'Used near expiry', exact: true });
  await expect(nearExpiry.locator('[data-near-expiry-count]')).not.toHaveText('0');
  const detailsTrigger = nearExpiry.getByRole('button', { name: 'View ingredients', exact: true });
  await detailsTrigger.focus();
  await page.keyboard.press('Enter');
  const nearDetails = page.getByRole('dialog', { name: 'Used near expiry', exact: true });
  await expect(nearDetails).toHaveCSS('opacity', '1');
  await expect(
    nearDetails.getByRole('list', { name: 'Near-expiry ingredient uses' }),
  ).toBeVisible();
  await expect(nearDetails).toContainText('Expiry');
  await expect(nearDetails).toContainText(/\d+ g/);
  expect(
    await nearDetails
      .locator('[data-dialog-scroll]')
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath(mobile ? 'near-expiry-mobile.png' : 'near-expiry-desktop.png'),
    fullPage: false,
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(nearDetails).toBeHidden();
  await expect(detailsTrigger).toBeFocused();
  await page.screenshot({
    path: testInfo.outputPath(
      mobile ? 'insights-dashboard-mobile.png' : 'insights-dashboard-desktop.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });

  const viewAll = nextActions.getByRole('button', { name: /View all \d+/ });
  if (await viewAll.count()) {
    await viewAll.click();
    await expect(nextActions.getByText('Bean sprouts', { exact: true })).toHaveCount(1);
    const showFewer = nextActions.getByRole('button', { name: /Show fewer/ });
    if (await showFewer.count()) await showFewer.click();
  }
  await page.screenshot({
    path: testInfo.outputPath(
      mobile ? 'insights-dashboard-mobile-viewport.png' : 'insights-dashboard-desktop-viewport.png',
    ),
    fullPage: false,
    animations: 'disabled',
  });
  await page.goto('/?view=account');
  await page.getByRole('button', { name: 'light theme', exact: true }).click();
  await page.goto('/?view=analytics');
  await page.waitForLoadState('networkidle');
  await expect(page.getByLabel('Reporting period', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Waste over time', exact: true })).toBeVisible();
  await page.waitForFunction(() => {
    const trend = document.querySelector(
      '[aria-labelledby="pattern-title"] [data-chart-area] svg.recharts-surface',
    );
    const reasons = document.querySelector(
      '[aria-labelledby="reasons-title"] [data-chart-area] svg.recharts-surface',
    );
    return (
      Boolean(trend && reasons) &&
      [trend, reasons].every((chart) => chart!.querySelectorAll('path, rect').length > 2)
    );
  });
  await page.waitForTimeout(350);
  await expectExpiryCountPositions(outlook);
  await page.screenshot({
    path: testInfo.outputPath(
      mobile ? 'insights-dashboard-mobile-light.png' : 'insights-dashboard-desktop-light.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });
  await page.goto('/?view=account');
  await page.getByRole('button', { name: 'dark theme', exact: true }).click();
  await page.goto('/?view=analytics');

  const wasteOverTime = page.getByRole('region', { name: 'Waste over time', exact: true });
  const whyDiscarded = page.getByRole('region', { name: 'Why discarded', exact: true });
  const wasteHotspots = page.getByRole('region', { name: 'Waste hotspots', exact: true });
  const chartSections = [nearExpiry, wasteOverTime, whyDiscarded, wasteHotspots];
  for (const section of chartSections) {
    await expect(section).toBeVisible();
    await expect(section.locator('[data-chart-area]')).toBeVisible();
  }
  const sectionBoxes = await Promise.all(chartSections.map((section) => section.boundingBox()));
  const chartBoxes = await Promise.all(
    chartSections.map((section) => section.locator('[data-chart-area]').boundingBox()),
  );
  expect(sectionBoxes.every(Boolean)).toBe(true);
  expect(chartBoxes.every(Boolean)).toBe(true);
  const reasonLegend = whyDiscarded.locator('tbody tr').last();
  await expect(reasonLegend).toBeVisible();
  const reasonLegendBox = await reasonLegend.boundingBox();
  const legendBottomGap =
    sectionBoxes[2]!.y + sectionBoxes[2]!.height - (reasonLegendBox!.y + reasonLegendBox!.height);
  expect(legendBottomGap).toBeGreaterThanOrEqual(12);
  expect(legendBottomGap).toBeLessThanOrEqual(32);
  if (!mobile) {
    const outlookHeadingBox = await outlook
      .getByRole('heading', { name: 'Expiry outlook' })
      .boundingBox();
    const firstActionHeadingBox = await nextActions.locator('ul > li h3').first().boundingBox();
    const finalExpiryButtonBox = await expiryButtons[3].boundingBox();
    const finalActionBox = await nextActions
      .getByRole('region', { name: 'Recommended actions', exact: true })
      .boundingBox();
    expect(Math.abs(outlookHeadingBox!.y - firstActionHeadingBox!.y)).toBeLessThanOrEqual(16);
    expect(
      Math.abs(
        finalExpiryButtonBox!.y +
          finalExpiryButtonBox!.height -
          (finalActionBox!.y + finalActionBox!.height),
      ),
    ).toBeLessThanOrEqual(24);
    for (const [first, second] of [
      [0, 1],
      [2, 3],
    ]) {
      const box = sectionBoxes[second]!;
      expect(Math.abs(sectionBoxes[first]!.y - box.y)).toBeLessThanOrEqual(1);
      expect(
        Math.abs(sectionBoxes[first]!.y + sectionBoxes[first]!.height - (box.y + box.height)),
      ).toBeLessThanOrEqual(1);
      const chart = chartBoxes[second]!;
      expect(Math.abs(chartBoxes[first]!.y - chart.y)).toBeLessThanOrEqual(1);
      expect(
        Math.abs(chartBoxes[first]!.y + chartBoxes[first]!.height - (chart.y + chart.height)),
      ).toBeLessThanOrEqual(1);
    }
  }
  await expect(wasteOverTime.getByText(/^(Daily|Weekly)$/)).toBeVisible();
  await expect(wasteHotspots.getByText('Bean sprouts', { exact: true })).toBeVisible();
  await expect(whyDiscarded).toContainText(/18\s*incidents/);

  const recordsTrigger = page.getByRole('button', { name: 'View amount records', exact: true });
  await recordsTrigger.click();
  const records = page.getByRole('dialog', { name: 'Amount records', exact: true });
  await expect(records).toBeVisible();
  await expect(records.getByRole('table', { name: 'Recorded amounts', exact: true })).toBeVisible();
  await selectOption(page, 'Record type', 'Waste');
  await selectOption(page, 'Record unit', 'g');
  await expect(records).toContainText('Bean sprouts');
  await expect(records).toContainText('180 g');
  await selectOption(page, 'Record unit', 'mL');
  await expect(records).toContainText('Milk');
  await expect(records).toContainText('150 mL');
  await expect(records).not.toContainText('180 g');
  await selectOption(page, 'Record unit', 'pieces');
  await expect(records).toContainText('Bread');
  await expect(records).toContainText('3 pieces');
  await expect(records).not.toContainText('200 mL');
  await selectOption(page, 'Record unit', 'g');
  if (mobile)
    expect(
      await records.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath(mobile ? 'amount-records-mobile.png' : 'amount-records-desktop.png'),
    fullPage: false,
    animations: 'disabled',
  });
  await records.getByRole('button', { name: 'Close', exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: 'Amount records', exact: true })).toBeHidden();
  await page.waitForFunction(
    (element) => document.activeElement === element,
    await recordsTrigger.elementHandle(),
  );

  const expanded = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(expanded.scroll).toBeLessThanOrEqual(expanded.width + 1);
});

async function expectExpiryCountPositions(outlook: Locator) {
  const buttons = outlook.getByRole('button');
  await expect(buttons).toHaveCount(4);
  for (const button of await buttons.all()) {
    const bar = button.locator('[data-expiry-bar]');
    const count = button.locator('[data-expiry-count]');
    await expect(count).toBeVisible();
    const expectedCount = (await button.getAttribute('aria-label'))!.match(/, (\d+) items?$/)![1];
    await expect(count).toHaveText(expectedCount);
    const barBox = await bar.boundingBox();
    const countBox = await count.boundingBox();
    expect(barBox).not.toBeNull();
    expect(countBox).not.toBeNull();
    if (barBox!.height >= 28) {
      expect(countBox!.x).toBeGreaterThanOrEqual(barBox!.x - 1);
      expect(countBox!.x + countBox!.width).toBeLessThanOrEqual(barBox!.x + barBox!.width + 1);
      expect(countBox!.y).toBeGreaterThanOrEqual(barBox!.y - 1);
      expect(countBox!.y + countBox!.height).toBeLessThanOrEqual(barBox!.y + barBox!.height + 1);
    } else {
      expect(countBox!.y + countBox!.height).toBeLessThanOrEqual(barBox!.y + 1);
    }
    const buttonBox = await button.boundingBox();
    expect(countBox!.y).toBeGreaterThanOrEqual(buttonBox!.y - 1);
    const contrast = await count.evaluate((element, inside) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d')!;
      const rgba = (color: string) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return Array.from(context.getImageData(0, 0, 1, 1).data);
      };
      const foreground = rgba(getComputedStyle(element).color);
      let surface = element.closest(inside ? '[data-expiry-bar]' : 'button');
      let background = [255, 255, 255, 255];
      while (surface) {
        const candidate = rgba(getComputedStyle(surface).backgroundColor);
        if (candidate[3] === 255) {
          background = candidate;
          break;
        }
        surface = surface.parentElement;
      }
      const luminance = (color: number[]) => {
        const linear = color.slice(0, 3).map((channel) => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
      };
      const foregroundLight = luminance(foreground);
      const backgroundLight = luminance(background);
      return (
        (Math.max(foregroundLight, backgroundLight) + 0.05) /
        (Math.min(foregroundLight, backgroundLight) + 0.05)
      );
    }, barBox!.height >= 28);
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  }
}
