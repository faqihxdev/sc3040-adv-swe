import { createClient } from '@supabase/supabase-js';
import { test, expect, action, addRice, mealFixture, signIn, state } from './fixtures';

test('reserves on Cook this, resumes after reload and releases on End session @smoke', async ({
  page,
  kitchen,
}, testInfo) => {
  await signIn(page, kitchen.owner);
  const rice = await addRice(page);
  const meal = mealFixture(kitchen, rice);
  await page.route('**/api/meals', (route) =>
    route.fulfill({ json: { meals: [meal], message: '' } }),
  );
  await page.getByRole('button', { name: 'Cook', exact: true }).click();
  await page.getByRole('button', { name: 'Find meals', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Cook this', exact: true }).click();
  await expect(
    page.getByText('Portions reserved for your cooking session.', { exact: true }),
  ).toBeVisible();
  let current = await state(page);
  expect(current.reservations).toHaveLength(1);
  expect(current.items.find((item) => item.id === rice.id)?.quantity).toBe(500);
  expect(current.outcomes).toHaveLength(0);
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  const row = page.locator(`[data-inventory-item="${rice.id}"]`);
  await expect(row.locator('[data-reservation]')).toHaveText(
    '100 g reserved by Test owner. 400 g available.',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width,
  );
  await page.screenshot({ path: testInfo.outputPath('reserved-stock.png'), fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: 'Cook', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'I’ve finished cooking', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('resumed-cooking.png'), fullPage: true });
  await page.getByRole('button', { name: 'End session', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'End session', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  current = await state(page);
  expect(current.reservations).toEqual([]);
  expect(current.cookingSession).toBeNull();
  expect(current.items.find((item) => item.id === rice.id)?.quantity).toBe(500);
});

test('two members race for portions, share restocked amounts and cannot steal each other holds @smoke', async ({
  page,
  browser,
  kitchen,
}) => {
  await signIn(page, kitchen.owner);
  let rice = await addRice(page);
  expect((await action(page, { ...rice, command: 'edit_item', quantity: 150 })).status()).toBe(200);
  rice = (await state(page)).items.find((item) => item.id === rice.id)!;
  const context = await browser.newContext();
  const memberPage = await context.newPage();
  try {
    await signIn(memberPage, kitchen.member);
    const meals = [
      mealFixture(kitchen, rice),
      mealFixture({ ...kitchen, owner: kitchen.member }, rice),
    ];
    const pages = [page, memberPage];
    const post = (index: number, path: string, body: unknown) =>
      pages[index].request.post(`/api/${path}`, {
        headers: { Origin: 'http://127.0.0.1:3100' },
        data: body,
      });
    const starts = await Promise.all(
      meals.map((meal, index) => post(index, 'cooking', { action: 'start', token: meal.token })),
    );
    expect(starts.map((response) => response.status()).sort()).toEqual([200, 409]);
    let current = await state(page);
    expect(current.reservations).toHaveLength(1);
    expect(current.reservations![0].amount).toBe(100);
    const winner = starts[0].status() === 200 ? 0 : 1;
    const loser = 1 - winner;
    const won = await starts[winner].json();
    // The same start retry is idempotent, even through a second device.
    expect(
      (await post(winner, 'cooking', { action: 'start', token: meals[winner].token })).status(),
    ).toBe(200);
    expect(
      (
        await action(page, {
          command: 'adjust_item',
          id: rice.id,
          version: rice.version,
          kind: 'restock',
          amount: 200,
          discardReason: null,
        })
      ).status(),
    ).toBe(200);
    expect(
      (await post(loser, 'cooking', { action: 'start', token: meals[loser].token })).status(),
    ).toBe(200);
    current = await state(page);
    const latest = current.items.find((item) => item.id === rice.id)!;
    const confirmation = (usedAmount: number, version = latest.version) => ({
      token: won.meal.token,
      changes: [{ id: rice.id, version, usedAmount, discardedAmount: 0, discardReason: null }],
    });
    // 350 g recorded, 100 g held by the other member, so this meal can use at most 250 g.
    expect((await post(winner, 'confirm', confirmation(251))).status()).toBe(409);
    expect((await state(page)).reservations).toHaveLength(2);
    expect((await post(winner, 'confirm', confirmation(225))).status()).toBe(200);
    expect((await post(winner, 'confirm', confirmation(225))).status()).toBe(200);
    current = await state(page);
    expect(current.items.find((item) => item.id === rice.id)?.quantity).toBe(125);
    expect(current.outcomes).toHaveLength(1);
    expect(current.reservations).toHaveLength(1);
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    const expiry = await admin
      .from('cooking_sessions')
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', current.reservations![0].sessionId);
    expect(expiry.error).toBeNull();
    expect(
      (
        await post(loser, 'confirm', {
          token: meals[loser].token,
          changes: [
            {
              id: rice.id,
              version: latest.version + 1,
              usedAmount: 100,
              discardedAmount: 0,
              discardReason: null,
            },
          ],
        })
      ).status(),
    ).toBe(409);
    expect((await state(page)).reservations).toEqual([]);
    expect(
      (await post(loser, 'cooking', { action: 'start', token: meals[loser].token })).status(),
    ).toBe(200);
  } finally {
    await context.close();
  }
});
