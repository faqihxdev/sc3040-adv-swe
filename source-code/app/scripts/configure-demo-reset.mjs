import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';

const hosted = process.argv.includes('--hosted');
const file = hosted ? '.env.hosted' : '.env.local';
const source = readFileSync(file, 'utf8');
const env = parseEnv(source);
const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
if (
  hosted
    ? url.origin !== `https://${env.DEMO_SEED_PROJECT_REF}.supabase.co`
    : !['127.0.0.1', 'localhost'].includes(url.hostname)
)
  throw new Error('Demo target is not allowlisted.');
const admin = createClient(url.origin, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data, error } = await admin.auth.admin.listUsers();
if (error) throw error;
const alex = data.users.find((user) => user.email === 'alex@useeatnow.test');
if (!alex) throw new Error('Seed the demo accounts first.');
const { data: household, error: householdError } = await admin
  .from('households')
  .select('id,name,owner_id')
  .eq('owner_id', alex.id)
  .single();
if (householdError || household?.name !== 'The good food club')
  throw new Error('The expected demo household is missing.');
const updated = source
  .replace(/^DEMO_HOUSEHOLD_ID=.*\r?\n?/gm, '')
  .replace(/^DEMO_MODE=.*\r?\n?/gm, '');
writeFileSync(file, `${updated.trimEnd()}\nDEMO_MODE=true\nDEMO_HOUSEHOLD_ID=${household.id}\n`);
if (process.argv.includes('--vercel')) {
  if (!hosted) throw new Error('Only the hosted demo can be configured in Vercel.');
  const args = [
    'pnpm',
    'dlx',
    'vercel@61.0.0',
    'env',
    'add',
    'DEMO_HOUSEHOLD_ID',
    'production',
    '--project',
    'useeatnow-sg-demo',
    '--scope',
    'aqilakmal-project',
    '--yes',
    '--no-sensitive',
  ];
  const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', args.join(' ')], {
    input: household.id,
    encoding: 'utf8',
  });
  if (result.status !== 0)
    throw new Error(
      'Vercel rejected the demo household setting. Check existing values before retrying.',
    );
}
console.log('Demo reset allowlisted for Alex’s seeded household.');
