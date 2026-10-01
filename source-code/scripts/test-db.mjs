import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const sql = ['core-database.sql', 'photo-batch.sql', 'demo-reset.sql']
  .map((file) => readFileSync(new URL('../tests/' + file, import.meta.url), 'utf8'))
  .join('\n');
const result = spawnSync(
  'docker',
  [
    'exec',
    '-i',
    'supabase_db_useeatnow',
    'psql',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
  ],
  { input: sql, encoding: 'utf8' },
);
mkdirSync('reports', { recursive: true });
writeFileSync('reports/database.txt', (result.stdout ?? '') + (result.stderr ?? ''));
if (result.status !== 0)
  throw result.error ?? new Error(result.stderr || 'Local database tests failed.');
console.log(result.stdout.trim());
console.log(result.stderr.trim());
