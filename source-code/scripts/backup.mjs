import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';

// Local only. A restore never targets postgres or an existing database.
const container = 'supabase_db_useeatnow';
const directory = resolve('backups');
mkdirSync(directory, { recursive: true });
function docker(args, input) {
  const result = spawnSync('docker', args, { input, maxBuffer: 256 * 1024 * 1024 });
  if (result.error || result.status !== 0)
    throw result.error ?? new Error(result.stderr.toString().trim());
  return result.stdout;
}
function query(database, sql) {
  return docker([
    'exec',
    container,
    'psql',
    '-U',
    'postgres',
    '-d',
    database,
    '-At',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    sql,
  ])
    .toString()
    .trim();
}
const mode = process.argv[2];
if (mode && mode !== 'practice') throw new Error('Use db:backup or db:restore:practice.');
const stamp = new Date().toISOString().replaceAll(':', '-');
const snapshot = docker(['exec', container, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '-Fc']);
const path = resolve(directory, `${stamp}.dump`);
writeFileSync(path, snapshot, { flag: 'wx', mode: 0o600 });
console.log(`Private local backup: ${relative(process.cwd(), path)}. Do not commit or upload it.`);
if (mode === 'practice') {
  const database = `useeatnow_restore_${randomUUID().replaceAll('-', '')}`;
  if (!/^useeatnow_restore_[a-f0-9]{32}$/.test(database)) throw new Error('Unsafe restore target.');
  const started = Date.now();
  let created = false;
  const tables = [
    'auth.users',
    'public.profiles',
    'public.households',
    'public.memberships',
    'public.inventory',
    'public.activity',
    'public.outcomes',
  ];
  const fingerprints = tables
    .flatMap((table) => {
      const name = table.split('.')[1];
      const order = name === 'memberships' ? 't.user_id' : 't.id';
      return [
        `'${name}'`,
        `(select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by ${order}), '')) from ${table} t)`,
      ];
    })
    .join(',');
  const sql = `select json_build_object('users',(select count(*) from auth.users),'households',(select count(*) from public.households),'memberships',(select count(*) from public.memberships),'inventory',(select count(*) from public.inventory),'activity',(select count(*) from public.activity),'outcomes',(select count(*) from public.outcomes),'rls',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity),'dataFingerprints',json_build_object(${fingerprints}))::text`;
  const before = query('postgres', sql);
  try {
    docker(['exec', container, 'createdb', '-U', 'postgres', '--template=template0', database]);
    created = true;
    docker(
      [
        'exec',
        '-i',
        container,
        'pg_restore',
        '-U',
        'supabase_admin',
        '-d',
        database,
        '--exit-on-error',
      ],
      snapshot,
    );
    const after = query(database, sql);
    if (before !== after) throw new Error('Restored data fingerprints, row counts or RLS differ.');
    const report = {
      checkedAt: new Date().toISOString(),
      source: 'local Supabase',
      backupSha256: createHash('sha256').update(snapshot).digest('hex'),
      durationSeconds: (Date.now() - started) / 1000,
      checks: JSON.parse(after),
      result: 'passed',
      scope:
        'Isolated local content/RLS restore; not hosted recovery time or retention acceptance.',
    };
    mkdirSync('reports', { recursive: true });
    writeFileSync('reports/restore.json', JSON.stringify(report, null, 2));
    console.log(`Restore drill passed in ${report.durationSeconds}s; reports/restore.json.`);
  } finally {
    // This exact name was created by this invocation; the source database is untouched.
    if (created) docker(['exec', container, 'dropdb', '-U', 'postgres', database]);
  }
}
