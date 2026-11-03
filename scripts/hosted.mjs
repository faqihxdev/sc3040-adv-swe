import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';

const envFile = '.env.hosted';
const projectName = 'useeatnow-sg-demo';
const organization = 'vlixlavvtibcrsxolxhm';
const cli = 'node_modules/supabase/dist/supabase.js';
const command = process.argv[2];
const config = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
const save = () =>
  writeFileSync(
    envFile,
    Object.entries(config)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join('\n') + '\n',
    { mode: 0o600 },
  );

function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, ...config },
  });
  if (result.status !== 0)
    throw new Error(`Supabase ${args[0]} ${args[1] ?? ''} failed. Credentials were not printed.`);
  return result.stdout;
}
function json(args) {
  const text = run([...args, '--output', 'json']);
  const start = text.search(/[\[{]/);
  if (start < 0) throw new Error('Supabase did not return JSON. No credentials were printed.');
  return JSON.parse(text.slice(start));
}
function target() {
  const ref = config.DEMO_SEED_PROJECT_REF;
  if (
    !ref ||
    !/^[a-z]{20}$/.test(ref) ||
    config.NEXT_PUBLIC_SUPABASE_URL !== `https://${ref}.supabase.co`
  )
    throw new Error('The explicit hosted demo target is missing or invalid.');
  return ref;
}

if (command === 'create') {
  const response = json(['projects', 'list']);
  const projects = Array.isArray(response) ? response : response.projects;
  if (!Array.isArray(projects)) throw new Error('Could not check for an existing demo project.');
  const existing = projects.filter(
    (p) => p.name === projectName && p.organization_id === organization,
  );
  if (existing.length > 1)
    throw new Error('More than one matching project exists; select one manually.');
  let project = existing[0];
  if (project && !config.SUPABASE_DB_PASSWORD)
    throw new Error(
      'An existing project requires its saved credentials. No replacement project was created.',
    );
  if (!project) {
    config.SUPABASE_DB_PASSWORD ||= randomBytes(32).toString('base64url');
    save(); // Retain the password before a network request with an uncertain outcome.
    project = json([
      'projects',
      'create',
      projectName,
      '--org-id',
      organization,
      '--region',
      'ap-southeast-1',
      '--db-password',
      config.SUPABASE_DB_PASSWORD,
    ]);
    if (project.project) project = project.project;
  }
  const ref = project.ref ?? project.id;
  if (!ref || !/^[a-z]{20}$/.test(ref))
    throw new Error('Check project creation status before retrying.');
  config.DEMO_SEED_PROJECT_REF = ref;
  config.NEXT_PUBLIC_SUPABASE_URL = `https://${ref}.supabase.co`;
  config.DEMO_ALEX_PASSWORD ||= randomBytes(24).toString('base64url');
  config.DEMO_SAM_PASSWORD ||= randomBytes(24).toString('base64url');
  config.MEAL_SIGNING_SECRET ||= randomBytes(32).toString('hex');
  config.APP_ORIGIN ||= 'https://useeatnow.utf.sh';
  config.AUTH_CALLBACK_URL = `${config.APP_ORIGIN}/auth/callback`;
  config.AUTH_RECOVERY_URL = `${config.APP_ORIGIN}/auth/callback?next=/reset-password`;
  config.AI_ENABLED = 'true';
  delete config.AI_REQUEST_LIMIT;
  config.DEMO_MODE = 'true';
  save();
  console.log(
    `Supabase demo project: ${projectName}, ${ref}, Singapore. Credentials saved privately.`,
  );
} else if (command === 'keys') {
  const response = json(['projects', 'api-keys', '--project-ref', target(), '--reveal']);
  const keys = Array.isArray(response) ? response : (response.api_keys ?? response.keys);
  if (!Array.isArray(keys)) throw new Error('Unexpected key response. No values were printed.');
  for (const [name, variable] of [
    ['anon', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
    ['service_role', 'SUPABASE_SERVICE_ROLE_KEY'],
  ]) {
    const key = keys.find((key) => key.name === name)?.api_key;
    if (!key || key.includes('***')) throw new Error('A required API key was not returned.');
    config[variable] = key;
  }
  save();
  console.log('Hosted Supabase keys saved privately; no keys printed.');
} else if (command === 'link') {
  run(['link', '--project-ref', target()]);
  console.log('CLI linked to the hosted demo. Local Docker configuration was retained.');
} else if (command === 'migration-list') {
  console.log(run(['migration', 'list', '--project-ref', target()]).trim());
} else if (command === 'migration-check' || command === 'migrate') {
  const args = ['db', 'push', '--project-ref', target(), '--skip-vault'];
  args.push(command === 'migration-check' ? '--dry-run' : '--yes');
  console.log(run(args).trim());
} else if (command === 'config-check' || command === 'configure') {
  console.log(
    run([
      'config',
      command === 'config-check' ? 'diff' : 'push',
      '--project-ref',
      target(),
      '--workdir',
      'deployment',
      ...(command === 'configure' ? ['--yes'] : []),
    ]).trim(),
  );
} else if (command === 'origin') {
  target();
  const origin = new URL(process.argv[3]);
  if (
    origin.protocol !== 'https:' ||
    (!origin.hostname.endsWith('.vercel.app') && origin.hostname !== 'useeatnow.utf.sh') ||
    origin.pathname !== '/' ||
    origin.port ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash
  )
    throw new Error('Use the exact HTTPS demo origin: useeatnow.utf.sh or a Vercel deployment.');
  config.APP_ORIGIN = origin.origin;
  config.AUTH_CALLBACK_URL = `${origin.origin}/auth/callback`;
  config.AUTH_RECOVERY_URL = `${origin.origin}/auth/callback?next=/reset-password`;
  save();
  console.log(`Hosted app origin: ${origin.origin}`);
} else if (command === 'credentials') {
  target();
  writeFileSync(
    '.demo-credentials.local',
    `UseEatNow hosted demo\n${config.APP_ORIGIN}\n\nAlex, owner\nalex@useeatnow.test\n${config.DEMO_ALEX_PASSWORD}\n\nSam, member\nsam@useeatnow.test\n${config.DEMO_SAM_PASSWORD}\n`,
    { mode: 0o600 },
  );
  console.log('Two demo logins saved in ignored .demo-credentials.local. No passwords printed.');
} else {
  throw new Error(
    'Use create, keys, link, migration-list, migration-check, migrate, config-check, configure, origin, or credentials.',
  );
}
