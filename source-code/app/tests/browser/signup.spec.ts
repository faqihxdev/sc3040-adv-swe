import { test, expect, state } from './fixtures';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

test('FR-10/FR-12: local signup creates an account and the first household', async ({ page }) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (new URL(url).hostname !== '127.0.0.1')
    throw new Error('Signup tests require local Supabase.');
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  let userId: string | undefined;
  try {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.getByLabel('Your name', { exact: true }).fill('New browser member');
    await page.getByLabel('Email', { exact: true }).fill(`signup-${randomUUID()}@useeatnow.test`);
    await page.getByLabel('Password', { exact: true }).fill(`Local-${randomUUID()}!`);
    const submitted = page.waitForResponse((response) =>
      response.url().includes('/auth/v1/signup'),
    );
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    const response = await submitted;
    expect(response.ok()).toBe(true);
    const data = await response.json();
    userId = data.user?.id ?? data.id;
    if (!userId || !/^[0-9a-f-]{36}$/.test(userId))
      throw new Error('Signup did not return a test account ID.');
    await expect(page.getByRole('heading', { name: 'Your household', exact: true })).toBeVisible();
    await page.getByLabel('Household name', { exact: true }).fill('New browser kitchen');
    await page.getByRole('button', { name: 'Start my kitchen', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible();
    const saved = await state(page);
    expect(saved.user.display_name).toBe('New browser member');
    expect(saved.household).toMatchObject({ name: 'New browser kitchen', owner_id: userId });
  } finally {
    if (userId) {
      const household = await admin.from('households').delete().eq('owner_id', userId);
      if (household.error) throw household.error;
      const account = await admin.auth.admin.deleteUser(userId);
      if (account.error) throw account.error;
    }
  }
});
