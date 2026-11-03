import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
process.loadEnvFile('.env.hosted');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.equal(url, `https://${process.env.DEMO_SEED_PROJECT_REF}.supabase.co`);
const origin = process.env.APP_ORIGIN;
assert(origin?.startsWith('https://'));
const landing = await fetch(origin);
assert.equal(landing.status, 200);
assert.equal(new URL(landing.url).origin, origin);
assert.equal(new URL(landing.url).pathname, '/');
const landingHtml = await landing.text();
assert(landingHtml.includes('Cook with what you have.'));
assert(!landingHtml.includes('Opening your kitchen'));
console.log('Signed-out visitors reach the public landing page without private dashboard content.');
const page = await fetch(`${origin}/login`);
assert.equal(page.status, 200);
assert.equal(new URL(page.url).origin, origin);
assert.equal(new URL(page.url).pathname, '/login');
const html = await page.text();
assert(html.includes('Use the demo credentials shared by your team.'));
assert(!html.includes('Create account'));
assert(html.includes('"class","theme","dark",null'));
assert(html.includes('/icon.svg?'));
const icon = await fetch(`${origin}/icon.svg`);
assert.equal(icon.status, 200);
assert(icon.headers.get('content-type')?.includes('image/svg+xml'));
console.log('Sign-in page is public, dark by default and has no signup UI.');
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const settings = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
assert.equal(settings.status, 200);
const auth = await settings.json();
assert.equal(auth.disable_signup, true);
assert.equal(auth.external.email, true);
assert.equal(auth.mailer_autoconfirm, false);
console.log('Public registration blocked; email/password login and email verification retained.');
let householdId;
for (const [email, password] of [
  ['alex@useeatnow.test', process.env.DEMO_ALEX_PASSWORD],
  ['sam@useeatnow.test', process.env.DEMO_SAM_PASSWORD],
]) {
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await db.auth.signInWithPassword({ email, password });
  assert.equal(login.error, null);
  const household = await db.from('households').select('id,owner_id').single();
  assert.equal(household.error, null);
  if (!householdId) householdId = household.data.id;
  assert.equal(household.data.id, householdId);
  assert.equal(household.data.owner_id === login.data.user.id, email.startsWith('alex'));
  const members = await db.rpc('member_directory');
  assert.equal(members.error, null);
  assert(members.data.length >= 2);
  const items = await db.from('inventory').select('id,name').eq('deleted', false);
  assert.equal(items.error, null);
  assert(Array.isArray(items.data));
  const history = await db.from('outcomes').select('id,synthetic');
  assert.equal(history.error, null);
  assert(Array.isArray(history.data));
  const cookies = new Map();
  const serverSession = createServerClient(url, key, {
    cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: (values) => values.forEach(({ name, value }) => cookies.set(name, value)),
    },
  });
  assert.equal((await serverSession.auth.signInWithPassword({ email, password })).error, null);
  const cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  const stateResponse = await fetch(`${origin}/api/state`, { headers: { cookie } });
  assert.equal(stateResponse.status, 200);
  const state = await stateResponse.json();
  assert.equal(state.demoResetEnabled, email.startsWith('alex'));
  assert.equal(state.household.id, process.env.DEMO_HOUSEHOLD_ID);
  if (email.startsWith('alex')) {
    for (const requestOrigin of [origin, 'https://invalid-origin.example']) {
      const invalid = await fetch(`${origin}/api/actions`, {
        method: 'POST',
        headers: { cookie, origin: requestOrigin, 'content-type': 'application/json' },
        body: '{', // Invalid JSON cannot execute a stock mutation.
      });
      assert.equal(invalid.status, requestOrigin === origin ? 400 : 403);
    }
    console.log('Canonical origin accepted; foreign origin rejected without data writes.');
  }
  if (email.startsWith('sam')) {
    const reset = await fetch(`${origin}/api/demo/reset`, {
      method: 'POST',
      headers: { cookie, origin, 'content-type': 'application/json' },
      body: JSON.stringify({
        householdId: state.household.id,
        version: state.household.version,
        confirmation: 'RESET',
      }),
    });
    assert.equal(reset.status, 403);
  }
  await serverSession.auth.signOut({ scope: 'local' });
  await db.auth.signOut({ scope: 'local' });
  console.log(
    `${email}: correct role, shared household, ${items.data.length} ingredients, ${history.data.length} records.`,
  );
}
const anonymous = createClient(url, key, { auth: { persistSession: false } });
const inventory = await anonymous.from('inventory').select('id');
assert(inventory.error || inventory.data.length === 0);
console.log('Anonymous inventory access denied. No AI calls or inventory writes performed.');
assert.equal((await fetch(`${origin}/api/state`)).status, 401);
console.log(
  'App sessions verified; reset enabled only for the allowlisted owner, member reset denied.',
);
