import { test, expect, signIn, state } from './fixtures';

test('sign out keeps an independent session for the same account active', async ({
  page,
  browser,
  kitchen,
}) => {
  await signIn(page, kitchen.owner);
  const secondContext = await browser.newContext({ baseURL: 'http://127.0.0.1:3100' });
  try {
    const second = await secondContext.newPage();
    const login = second.waitForResponse((response) =>
      response.url().includes('/auth/v1/token?grant_type=password'),
    );
    await signIn(second, kitchen.owner);
    const { refresh_token } = await (await login).json();
    await page.getByRole('button', { name: /^Account(?: for Test owner)?$/ }).click();
    const logout = page.waitForRequest((request) => request.url().includes('/auth/v1/logout'));
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    expect(new URL((await logout).url()).searchParams.get('scope')).toBe('local');
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
    expect((await page.request.get('/api/state')).status()).toBe(401);

    // Force renewal so a still-valid access token cannot mask a revoked session.
    const renewed = await second.request.post(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        data: { refresh_token },
      },
    );
    expect(renewed.status()).toBe(200);
    expect((await state(second)).user.id).toBe(kitchen.owner.id);
    await second.reload();
    await expect(second.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible();
  } finally {
    await secondContext.close();
  }
});
