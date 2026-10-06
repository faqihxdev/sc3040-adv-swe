import { test as base, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { platform, release } from 'node:os';
import type { AppState, Item, RankedMeal, Recipe } from '../../src/domain/model';

type Account = { id: string; email: string; password: string };
type Kitchen = { owner: Account; member: Account; householdId: string };
export const test = base.extend<{ kitchen: Kitchen; environmentEvidence: void }>({
  environmentEvidence: [
    async ({ browser, browserName }, use, testInfo) => {
      const evidence = {
        checkedAt: new Date().toISOString(),
        project: testInfo.project.name,
        engine: browserName,
        browserVersion: browser.version(),
        operatingSystem: `${platform()} ${release()}`,
        viewport: testInfo.project.use.viewport,
        mobileEmulation: testInfo.project.use.isMobile ?? false,
        touchEmulation: testInfo.project.use.hasTouch ?? false,
        physicalDevice: false,
        scope:
          'Playwright test builds, local Supabase and mocked AI. Not branded-browser or real-device acceptance.',
      };
      mkdirSync('reports', { recursive: true });
      writeFileSync(
        `reports/browser-${testInfo.project.name}.json`,
        JSON.stringify(evidence, null, 2),
      );
      await testInfo.attach('browser-environment', {
        body: JSON.stringify(evidence),
        contentType: 'application/json',
      });
      await use();
    },
    { auto: true },
  ],
  kitchen: async ({}, runFixture) => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    if (new URL(url).hostname !== '127.0.0.1') throw new Error('Refusing non-local test database.');
    const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    const accounts: Account[] = [];
    try {
      for (const name of ['Test owner', 'Test member']) {
        const email = `browser-${randomUUID()}@useeatnow.test`;
        const password = `Local-${randomUUID()}!`;
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { display_name: name },
        });
        if (error || !data.user) throw error ?? new Error('Test user not created.');
        accounts.push({ id: data.user.id, email, password });
      }
      const db = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false },
      });
      const login = await db.auth.signInWithPassword(accounts[0]);
      if (login.error) throw login.error;
      const created = await db.rpc('mutate', {
        command: 'create_household',
        payload: { name: 'Browser test kitchen' },
      });
      if (created.error) throw created.error;
      const householdId = created.data.id;
      const invite = await db.rpc('mutate', { command: 'invite', payload: {} });
      if (invite.error) throw invite.error;
      const memberDb = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false },
      });
      const memberLogin = await memberDb.auth.signInWithPassword(accounts[1]);
      if (memberLogin.error) throw memberLogin.error;
      const joined = await memberDb.rpc('mutate', {
        command: 'join_household',
        payload: { code: invite.data.code },
      });
      if (joined.error) throw joined.error;
      await runFixture({ owner: accounts[0], member: accounts[1], householdId });
    } finally {
      // Only accounts created above can own households removed by this fixture.
      for (const account of accounts) {
        const removed = await admin.from('households').delete().eq('owner_id', account.id);
        if (removed.error) throw removed.error;
      }
      for (const account of accounts) {
        const removed = await admin.auth.admin.deleteUser(account.id);
        if (removed.error && removed.error.code !== 'user_not_found') throw removed.error;
      }
    }
  },
});
export { expect };
export async function signIn(page: Page, account: Account) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible();
}

export async function state(page: Page): Promise<AppState> {
  const response = await page.request.get('/api/state');
  expect(response.status()).toBe(200);
  return response.json();
}
export async function action(page: Page, data: unknown) {
  return page.request.post('/api/actions', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data,
  });
}
export async function selectOption(page: Page, label: string, option: string) {
  await page.getByLabel(label, { exact: true }).click();
  if (page.viewportSize()!.width < 640)
    await page
      .getByRole('dialog', { name: label, exact: true })
      .getByRole('button', { name: option, exact: true })
      .click();
  else await page.getByRole('option', { name: option, exact: true }).click();
}
export async function addRice(page: Page): Promise<Item> {
  const response = await action(page, {
    command: 'add_item',
    name: 'Rice',
    quantity: 500,
    unit: 'g',
    expiry_date: '2099-12-31',
    category: 'Grains',
    location: 'Pantry',
  });
  expect(response.status()).toBe(200);
  return (await state(page)).items.find((item) => item.name === 'Rice')!;
}

// Stand-in for the external recommender, with an independently issued local ticket.
// The confirmation endpoint and database are real. This is not an AI quality trial.
export function mealFixture(
  kitchen: Kitchen,
  rice: Item,
  additionalItems: Item[] = [],
): RankedMeal {
  const trackedItems = [rice, ...additionalItems];
  const recipe: Recipe = {
    name: 'Simple rice',
    summary: 'A local browser-test recipe.',
    servings: 2,
    cookingMinutes: 20,
    ingredients: [
      { ingredientId: rice.id, amount: 100, unit: 'g' },
      ...additionalItems.map((item) => ({
        ingredientId: item.id,
        amount: Math.min(item.quantity ?? 100, 100),
        unit: item.unit ?? 'g',
      })),
    ],
    steps: ['Rinse the rice.', 'Add water.', 'Cook until ready.', 'Serve the rice.'],
  };
  const payload = Buffer.from(
    JSON.stringify({
      id: randomUUID(),
      userId: kitchen.owner.id,
      householdId: kitchen.householdId,
      format: 2,
      expires: Date.now() + 86400000,
      recipe,
      trackedIds: trackedItems.map((item) => item.id),
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', 'useeatnow-local-browser-test-signing-key')
    .update(payload)
    .digest('base64url');
  return {
    ...recipe,
    score: 100,
    points: trackedItems.length,
    totalPoints: trackedItems.length,
    coverage: trackedItems.length,
    ingredientNames: Object.fromEntries(trackedItems.map((item) => [item.id, item.name])),
    trackedItems,
    token: `${payload}.${signature}`,
  };
}
