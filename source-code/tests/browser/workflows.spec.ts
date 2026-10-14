import {
  test,
  expect,
  signIn,
  state,
  action,
  addRice,
  mealFixture,
  selectOption,
} from './fixtures';
import sharp from 'sharp';

test('UC2 / FR-04–FR-05: required date, preview, add, edit, remove and safe undo @smoke', async ({
  page,
  kitchen,
}) => {
  await signIn(page, kitchen.owner);
  await page.getByRole('button', { name: 'Add ingredient', exact: true }).click();
  await page.getByLabel('Ingredient name', { exact: true }).fill('Rice');
  await page.getByRole('button', { name: 'Review details' }).click();
  await expect(page.getByRole('heading', { name: 'Review ingredient' })).toHaveCount(0);
  expect((await state(page)).items).toHaveLength(0);
  await page.getByLabel('Expiry date', { exact: true }).fill('2020-01-01');
  await page.getByLabel('Amount', { exact: true }).fill('500');
  await selectOption(page, 'Amount unit', 'g');
  await page.getByRole('button', { name: 'Review details' }).click();
  expect((await state(page)).items).toHaveLength(0);
  await page.getByRole('button', { name: 'Confirm ingredient' }).click();
  await expect(page.getByRole('button', { name: 'Edit Rice', exact: true })).toBeVisible();
  await expect(
    page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: 'Rice', exact: true }) }),
  ).toContainText('Past date');
  await page.getByRole('button', { name: 'Edit Rice', exact: true }).click();
  await page.getByLabel('Ingredient name', { exact: true }).fill('Brown rice');
  await page.getByRole('button', { name: 'Review details' }).click();
  await page.getByRole('button', { name: 'Confirm changes' }).click();
  await expect(page.getByRole('button', { name: /More actions/ }).first()).toBeVisible();
  await page
    .getByRole('button', { name: /More actions/ })
    .first()
    .click();
  await page.getByRole('menuitem', { name: 'Remove ingredient', exact: true }).click();
  await page.getByRole('button', { name: 'Remove ingredient', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit Brown rice' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Activity & undo' }).click();
  await page.getByRole('button', { name: 'Undo my last edit' }).click();
  await expect
    .poll(async () => (await state(page)).items.map((item) => item.name))
    .toEqual(['Brown rice']);
});

test('UC2 photo / FR-04: recognition is a draft; amount/date and final confirmation are required @smoke', async ({
  page,
  kitchen,
}) => {
  await signIn(page, kitchen.owner);
  await page.route('**/api/photos', (route) =>
    route.fulfill({
      json: {
        items: [{ name: 'Tomato', category: 'Vegetables', uncertain: true }],
        message: '',
        hasMore: false,
      },
    }),
  );
  await page.getByRole('button', { name: 'Add ingredient', exact: true }).click();
  await page.getByRole('tab', { name: 'Photo', exact: true }).click();
  await page.getByLabel('Upload ingredient photo').setInputFiles({
    name: 'fixture.png',
    mimeType: 'image/png',
    buffer: await sharp({ create: { width: 32, height: 32, channels: 3, background: '#e44b24' } })
      .png()
      .toBuffer(),
  });
  await page.getByRole('button', { name: 'Find ingredients', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review ingredients' })).toBeVisible();
  expect((await state(page)).items).toHaveLength(0);
  await page.getByRole('button', { name: 'Review 1 ingredient', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Check the highlighted fields');
  await page.getByLabel('Amount', { exact: true }).fill('500');
  await page.getByLabel(/^Expiry date/).fill('2099-12-31');
  await selectOption(page, 'Amount unit', 'g');
  await expect(page.getByLabel('Expiry date', { exact: true })).toHaveValue('2099-12-31');
  await page.getByRole('tab', { name: 'Manual', exact: true }).click();
  await page.getByRole('tab', { name: 'Photo', exact: true }).click();
  await expect(page.getByLabel('Ingredient 1', { exact: true })).toHaveValue('Tomato');
  await expect(page.getByLabel('Expiry date', { exact: true })).toHaveValue('2099-12-31');
  await page.getByRole('button', { name: 'Review 1 ingredient', exact: true }).click();
  expect((await state(page)).items).toHaveLength(0);
  await page.getByRole('button', { name: 'Confirm 1 ingredient', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit Tomato', exact: true })).toBeVisible();
  expect((await state(page)).items[0]).toMatchObject({
    quantity: 500,
    unit: 'g',
    expiry_date: '2099-12-31',
  });
});

test('UC1/UC3/UC4: recommend, cook, confirm, retry and inspect recorded analytics @smoke', async ({
  page,
  kitchen,
}, testInfo) => {
  await signIn(page, kitchen.owner);
  const rice = await addRice(page);
  const meal = mealFixture(kitchen, rice);
  await page.route('**/api/meals', (route) =>
    route.fulfill({ json: { meals: [meal], message: '' } }),
  );
  await page.reload();
  await page.getByRole('button', { name: 'Cook', exact: true }).click();
  await page.getByRole('button', { name: 'Find meals', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Water', exact: true })).toBeChecked();
  await page.getByText('Salt', { exact: true }).click();
  const submitted = page.waitForRequest('**/api/meals');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  expect((await submitted).postDataJSON().staples).toEqual(['Water', 'Cooking oil']);
  await page.getByRole('button', { name: 'See recipe', exact: true }).click();
  const steps = page.getByRole('region', { name: 'Recipe steps', exact: true }).getByRole('list');
  await expect(steps.getByRole('listitem')).toHaveCount(4);
  await expect(steps.getByRole('checkbox')).toHaveCount(0);
  await steps.getByText('Rinse the rice.', { exact: true }).click();
  await expect(steps.getByText('Rinse the rice.', { exact: true })).not.toHaveClass(/line-through/);
  await page.screenshot({
    path: testInfo.outputPath('recipe-preview.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Cook this', exact: true }).click();
  await expect(steps.getByRole('checkbox')).toHaveCount(4);
  const firstStep = steps.getByRole('checkbox', { name: 'Step 1: Rinse the rice.', exact: true });
  await expect(firstStep).not.toBeChecked();
  expect((await state(page)).items[0].quantity).toBe(500);
  expect((await state(page)).outcomes).toHaveLength(0);
  await page.getByText('Rinse the rice.', { exact: true }).click();
  await expect(firstStep).toBeChecked();
  await firstStep.focus();
  await page.keyboard.press('Space');
  await expect(firstStep).not.toBeChecked();
  await page.keyboard.press('Space');
  await expect(firstStep).toBeChecked();
  await page.screenshot({
    path: testInfo.outputPath('recipe-cooking.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'I’ve finished cooking' }).click();
  await page.getByLabel('Used amount for Rice', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Waste details for Rice', exact: true }).click();
  await page.getByLabel('Waste amount for Rice (optional)', { exact: true }).fill('50');
  await selectOption(page, 'Waste reason for Rice', 'Preparation scraps');
  expect((await state(page)).outcomes).toHaveLength(0);
  const confirmation = page.waitForRequest('**/api/confirm');
  await page.getByRole('button', { name: 'Confirm meal', exact: true }).click();
  const body = (await confirmation).postDataJSON();
  await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible();
  const retry = await page.request.post('/api/confirm', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: body,
  });
  expect(retry.status()).toBe(200);
  const recorded = await state(page);
  expect(recorded.items[0].quantity).toBe(350);
  expect(recorded.outcomes).toHaveLength(1);
  expect(recorded.outcomes[0].ingredients[0]).toMatchObject({
    name: 'Rice',
    used: true,
    discarded: true,
  });
  await page.goto('/?view=analytics');
  await selectOption(page, 'Reporting period', 'Last 7 days');
  const records = page.getByRole('dialog', { name: 'Amount records', exact: true });
  await page.getByRole('button', { name: 'View amount records', exact: true }).click();
  await expect(records).toBeVisible();
  await selectOption(page, 'Record type', 'Waste');
  await selectOption(page, 'Record unit', 'g');
  await expect(records.getByRole('table', { name: 'Recorded amounts', exact: true })).toContainText(
    '50 g',
  );
  await expect(records).toContainText('Prep scraps');
  await records.getByRole('button', { name: 'Close', exact: true }).first().click();
});

test('UC1/UC3: provider failure preserves preferences; cancelling a selection saves nothing', async ({
  page,
  kitchen,
}) => {
  await signIn(page, kitchen.owner);
  const rice = await addRice(page);
  let calls = 0;
  await page.route('**/api/meals', (route) => {
    calls++;
    return route.fulfill(
      calls === 1
        ? { status: 502, json: { error: 'Provider unavailable. Try again.' } }
        : {
            json: {
              meals: [mealFixture(kitchen, rice)],
              message: 'Only one feasible meal fits the available ingredients.',
            },
          },
    );
  });
  await page.reload();
  await page.getByRole('button', { name: 'Cook', exact: true }).click();
  await page.getByRole('button', { name: 'Find meals', exact: true }).click();
  await page.getByLabel('Preferences (optional)', { exact: true }).fill('Warm meal');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Provider unavailable' })).toBeVisible();
  await page.getByRole('button', { name: 'Change preferences', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Preferences (optional)', exact: true }),
  ).toHaveValue('Warm meal');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Only one feasible meal' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cook this', exact: true }).click();
  await page.getByRole('button', { name: 'End session', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'End session', exact: true }).click();
  expect((await state(page)).items[0].quantity).toBe(500);
  expect((await state(page)).outcomes).toHaveLength(0);
});

test('UC5/UC6: leave, reject an invalid join code, then immediately rejoin @smoke', async ({
  page,
  kitchen,
}) => {
  await signIn(page, kitchen.owner);
  const invite = await action(page, { command: 'invite' });
  const { code } = await invite.json();
  await page.goto('/?view=account');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await signIn(page, kitchen.member);
  await page.goto('/?view=household');
  await page.getByRole('button', { name: 'Leave household', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Leave household', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Your household', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.getByLabel('12-character join code', { exact: true }).fill('000000000000');
  await page.getByRole('button', { name: 'Join kitchen', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByLabel('12-character join code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Join kitchen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Household', exact: true })).toBeVisible();
  expect((await state(page)).household!.id).toBe(kitchen.householdId);
});

test('FR-13: owner account deletion is blocked; a member can explicitly delete their account', async ({
  page,
  kitchen,
}) => {
  await signIn(page, kitchen.owner);
  await page.goto('/?view=account');
  await page.getByRole('button', { name: 'Delete my account', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete account', exact: true })).toBeDisabled();
  await page.getByLabel('Type DELETE to confirm', { exact: true }).fill('DELETE');
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Transfer ownership or delete your household',
  );
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await signIn(page, kitchen.member);
  await page.goto('/?view=account');
  await page.getByRole('button', { name: 'Delete my account', exact: true }).click();
  await page.getByLabel('Type DELETE to confirm', { exact: true }).fill('DELETE');
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  expect((await page.request.get('/api/state')).status()).toBe(401);
});

test('FR-13: account settings remain accessible after household deletion', async ({
  page,
  kitchen,
}) => {
  await signIn(page, kitchen.owner);
  await page.goto('/?view=household');
  await page.getByRole('button', { name: 'Delete household', exact: true }).click();
  await page
    .getByLabel('Type Browser test kitchen to confirm', { exact: true })
    .fill('Browser test kitchen');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete household', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Your household', exact: true })).toBeVisible();
  expect((await state(page)).household).toBeNull();
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('button', { name: 'Delete my account', exact: true }).click();
  await page.getByLabel('Type DELETE to confirm', { exact: true }).fill('DELETE');
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
});

test('PR-04: stale quantity returns conflict and leaves the database unchanged', async ({
  page,
  kitchen,
}) => {
  await signIn(page, kitchen.owner);
  const rice = await addRice(page);
  const meal = mealFixture(kitchen, rice);
  expect(
    (await action(page, { ...rice, command: 'edit_item', quantity: 200, unit: 'g' })).status(),
  ).toBe(200);
  const response = await page.request.post('/api/confirm', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: {
      token: meal.token,
      changes: [
        {
          id: rice.id,
          version: rice.version,
          usedAmount: 100,
          discardedAmount: 0,
          discardReason: null,
        },
      ],
    },
  });
  expect(response.status()).toBe(409);
  const unchanged = await state(page);
  expect(unchanged.items[0].quantity).toBe(200);
  expect(unchanged.outcomes).toHaveLength(0);
});

test('FR-11/FR-12: save exclusions, transfer ownership and block former owner actions', async ({
  page,
  kitchen,
}) => {
  await signIn(page, kitchen.owner);
  await page.goto('/?view=household');
  // Ignore hidden navigation copies, but fail if the visible form is duplicated.
  const exclusion = page.getByRole('textbox', { name: 'Dietary exclusion', exact: true });
  await expect(exclusion).toHaveCount(1);
  await exclusion.fill('Dairy');
  await page.getByRole('button', { name: 'Add exclusion', exact: true }).click();
  await page.getByRole('button', { name: 'Save exclusions', exact: true }).click();
  await expect.poll(async () => (await state(page)).exclusions).toEqual(['Dairy']);
  await page.getByRole('button', { name: 'Make Test member owner', exact: true }).click();
  await page.getByRole('button', { name: 'Transfer ownership', exact: true }).click();
  await expect.poll(async () => (await state(page)).household?.owner_id).toBe(kitchen.member.id);
  const current = await state(page);
  expect(
    (
      await action(page, {
        command: 'remove_member',
        user_id: kitchen.member.id,
        version: current.household!.version,
      })
    ).status(),
  ).toBe(403);
});

test('FR-10: incorrect password, local recovery request and logout', async ({ page, kitchen }) => {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(kitchen.owner.email);
  await page.getByLabel('Password', { exact: true }).fill('Definitely-wrong-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
  await page.getByRole('button', { name: 'Send recovery link', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('email');
  await signIn(page, kitchen.owner);
  await page.goto('/?view=account');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Cook with what you have.', exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL('http://127.0.0.1:3100/');
  expect((await page.request.get('/api/state')).status()).toBe(401);
});

test('FR-09: empty insights states the reporting limit', async ({ page, kitchen }) => {
  await signIn(page, kitchen.owner);
  await page.goto('/?view=analytics');
  await expect(page.getByText('No waste recorded in this period.', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Why discarded', exact: true })).toContainText(
    'No discards recorded',
  );
});

test('API: authentication, origin, JSON validation and forged tickets fail closed @smoke', async ({
  page,
  kitchen,
}) => {
  expect((await page.request.get('/api/state')).status()).toBe(401);
  await signIn(page, kitchen.owner);
  const badOrigin = await page.request.post('/api/actions', {
    headers: { Origin: 'https://other.invalid' },
    data: { command: 'undo' },
  });
  expect(badOrigin.status()).toBe(403);
  expect(
    (
      await action(page, {
        command: 'add_item',
        name: 'Rice',
        quantity: 3,
        unit: 'g',
        expiry_date: '',
        category: '',
        location: '',
      })
    ).status(),
  ).toBe(400);
  const nonJson = await page.request.post('/api/actions', {
    headers: { Origin: 'http://127.0.0.1:3100', 'Content-Type': 'text/plain' },
    data: 'no',
  });
  expect(nonJson.status()).toBe(415);
  const forged = await page.request.post('/api/confirm', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: {
      token: 'forged.payload',
      changes: [
        {
          id: kitchen.householdId,
          version: 1,
          usedAmount: 0,
          discardedAmount: 0,
          discardReason: null,
        },
      ],
    },
  });
  expect(forged.status()).toBe(400);
  expect((await state(page)).items).toHaveLength(0);
});

test('quantity regressions: decimals, restock, waste and overdraw are explicit', async ({
  page,
  kitchen,
}) => {
  await signIn(page, kitchen.owner);
  const rice = await addRice(page);
  const loaded = await state(page);
  const current = loaded.items.find((item) => item.id === rice.id)!;
  const decimal = await action(page, {
    command: 'edit_item',
    id: current.id,
    version: current.version,
    name: current.name,
    quantity: 0.29,
    unit: 'g',
    expiry_date: current.expiry_date,
    category: current.category,
    location: current.location,
  });
  expect(decimal.status()).toBe(200);
  const afterDecimal = (await state(page)).items.find((item) => item.id === rice.id)!;
  expect(afterDecimal.quantity).toBe(0.29);
  const restock = await action(page, {
    command: 'adjust_item',
    id: rice.id,
    version: afterDecimal.version,
    kind: 'restock',
    amount: 10.01,
    discardReason: null,
  });
  expect(restock.status()).toBe(200);
  const afterRestock = (await state(page)).items.find((item) => item.id === rice.id)!;
  const waste = await action(page, {
    command: 'adjust_item',
    id: rice.id,
    version: afterRestock.version,
    kind: 'discarded',
    amount: 0.3,
    discardReason: 'prep',
  });
  expect(waste.status()).toBe(200);
  const afterWaste = (await state(page)).items.find((item) => item.id === rice.id)!;
  expect(afterWaste.quantity).toBe(10);
  const overdraw = await action(page, {
    command: 'adjust_item',
    id: rice.id,
    version: afterWaste.version,
    kind: 'discarded',
    amount: 10.01,
    discardReason: 'other',
  });
  expect(overdraw.status()).toBe(400);
});

test('quantity UI: known units stay locked while amount remains editable', async ({
  page,
  kitchen,
}) => {
  await signIn(page, kitchen.owner);
  await addRice(page);
  await page.reload();
  await page.getByRole('button', { name: 'Edit Rice', exact: true }).click();
  await expect(page.getByLabel('Amount unit', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Amount', { exact: true })).toHaveValue('500');
});
