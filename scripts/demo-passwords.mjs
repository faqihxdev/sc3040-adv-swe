import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--hosted')) throw new Error('Use --hosted or no arguments.');
const hosted = args.includes('--hosted');
const env = parseEnv(readFileSync(hosted ? '.env.hosted' : '.env.local', 'utf8'));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const local = url && ['127.0.0.1', 'localhost'].includes(new URL(url).hostname);
if (hosted) {
  const ref = env.DEMO_SEED_PROJECT_REF;
  if (!ref || !/^[a-z]{20}$/.test(ref) || url !== `https://${ref}.supabase.co`)
    throw new Error('Hosted target must match DEMO_SEED_PROJECT_REF exactly.');
} else if (!local) throw new Error('Local password changes require a localhost Supabase URL.');
if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  throw new Error('Supabase credentials are missing.');

const names = hosted ? ['alex', 'sam'] : ['alex', 'sam', 'jo'];
const accounts = names.map((name) => ({
  email: `${name}@useeatnow.test`,
  password: env[`DEMO_${name.toUpperCase()}_PASSWORD`],
}));
if (accounts.some(({ password }) => !password || password.length < 8))
  throw new Error('Set all demo passwords in the private env file, at least 8 characters each.');

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, options);
const users = [];
for (let page = 1; ; page += 1) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw new Error('Could not list demo accounts.');
  users.push(...data.users);
  if (data.users.length < 1000) break;
}
for (const account of accounts) {
  const matches = users.filter((user) => user.email === account.email);
  if (matches.length !== 1) throw new Error(`Expected one existing account for ${account.email}.`);
  account.id = matches[0].id;
}
for (const { email, id, password } of accounts) {
  const { error } = await admin.auth.admin.updateUserById(id, { password });
  if (error)
    throw new Error(
      `Password update failed for ${email}. Private env values are retained for retry.`,
    );
  const client = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options);
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error || login.data.user?.id !== id)
    throw new Error(`Login verification failed for ${email}.`);
  await client.auth.signOut({ scope: 'local' });
  console.log(`${hosted ? 'Hosted' : 'Local'} ${email}: password updated and login verified.`);
}
console.log('Inventory, history and membership preserved.');
