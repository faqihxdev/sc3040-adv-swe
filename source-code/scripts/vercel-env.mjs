import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const hosted = parseEnv(readFileSync('.env.hosted', 'utf8'));
if (
  !hosted.DEMO_SEED_PROJECT_REF ||
  hosted.NEXT_PUBLIC_SUPABASE_URL !== `https://${hosted.DEMO_SEED_PROJECT_REF}.supabase.co`
)
  throw new Error('An explicit hosted demo target is required.');
const root = parseEnv(readFileSync('../.env', 'utf8'));
const values = {
  NEXT_PUBLIC_SUPABASE_URL: hosted.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: hosted.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: hosted.SUPABASE_SERVICE_ROLE_KEY,
  MEAL_SIGNING_SECRET: hosted.MEAL_SIGNING_SECRET,
  OPENAI_API_KEY: root.OPENAI_API_KEY,
  APP_ORIGIN: hosted.APP_ORIGIN,
  AI_ENABLED: hosted.AI_ENABLED,
  DEMO_MODE: hosted.DEMO_MODE,
  DEMO_HOUSEHOLD_ID: hosted.DEMO_HOUSEHOLD_ID,
  ENABLE_EXPERIMENTAL_COREPACK: '1',
};
if (Object.values(values).some((value) => !value))
  throw new Error('A required deployment variable is missing.');
const secrets = new Set(['SUPABASE_SERVICE_ROLE_KEY', 'MEAL_SIGNING_SECRET', 'OPENAI_API_KEY']);
for (const [name, value] of Object.entries(values)) {
  const args = [
    'dlx',
    'vercel@61.0.0',
    'env',
    'add',
    name,
    'production',
    '--project',
    'useeatnow-sg-demo',
    '--scope',
    'aqilakmal-project',
    '--yes',
    secrets.has(name) ? '--sensitive' : '--no-sensitive',
  ];
  // Secret values travel through stdin, never process arguments or logs.
  const windows = process.platform === 'win32';
  const result = spawnSync(
    windows ? process.env.ComSpec || 'cmd.exe' : 'pnpm',
    windows ? ['/d', '/s', '/c', ['pnpm', ...args].join(' ')] : args,
    {
      input: value,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    },
  );
  if (result.status !== 0)
    throw new Error(
      `Vercel rejected ${name}. Values were not printed. Check the existing environment before retrying.`,
    );
  console.log(`Configured ${name} for the demo deployment.`);
}
