import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import { enforceLoopback } from './loopback.mjs';
function run(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024, ...options });
  if (r.status !== 0) throw new Error(r.stderr || 'Local setup failed.');
  return r.stdout;
}
const cli = ['node_modules/supabase/dist/supabase.js'];
if (process.argv[2] === 'types') {
  writeFileSync(
    'src/lib/database.types.ts',
    run(process.execPath, [...cli, 'gen', 'types', 'typescript', '--local']),
  );
  console.log('Generated database types.');
} else {
  const network = 'useeatnow-local';
  const check = spawnSync('docker', ['network', 'inspect', network], { encoding: 'utf8' });
  if (check.status !== 0)
    run('docker', [
      'network',
      'create',
      '-o',
      'com.docker.network.bridge.host_binding_ipv4=127.0.0.1',
      network,
    ]);
  else if (
    JSON.parse(check.stdout)[0].Options['com.docker.network.bridge.host_binding_ipv4'] !==
    '127.0.0.1'
  )
    throw new Error('Local network must bind to 127.0.0.1.');
  console.log('Starting local Supabase. Initial image downloads may take several minutes.');
  run(process.execPath, [
    ...cli,
    'start',
    '--network-id',
    network,
    '-x',
    'realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor',
  ]);
  await enforceLoopback();
  const values = parseEnv(run(process.execPath, [...cli, 'status', '-o', 'env']));
  const old = existsSync('.env.local') ? parseEnv(readFileSync('.env.local', 'utf8')) : {};
  const config = {
    ...old,
    NEXT_PUBLIC_SUPABASE_URL: values.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: values.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY,
    MEAL_SIGNING_SECRET: old.MEAL_SIGNING_SECRET || randomBytes(32).toString('hex'),
    APP_ORIGIN: 'http://127.0.0.1:3000',
    AI_ENABLED: old.AI_ENABLED || 'false',
    AI_REQUEST_LIMIT: old.AI_REQUEST_LIMIT || '100',
  };
  if (!config.NEXT_PUBLIC_SUPABASE_ANON_KEY || !config.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error('Local credentials were not returned.');
  writeFileSync(
    '.env.local',
    Object.entries(config)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join('\n') + '\n',
  );
  console.log(
    'Local configuration saved without printing credentials. Studio: http://127.0.0.1:54323. Mail inbox: http://127.0.0.1:54324.',
  );
}
