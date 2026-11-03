import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { makeDemoSeed } from '../src/domain/demo-data.ts';

const seed = JSON.stringify(makeDemoSeed('2026-10-01', randomUUID)).replaceAll("'", "''");
const fixtures = `create temporary table test_demo_seed (payload jsonb);
insert into test_demo_seed values ('${seed}'::jsonb);\n`;
const tests = [
  'core-database.sql',
  'photo-batch.sql',
  'demo-reset.sql',
  'meal-image-cache.sql',
  'cooking-reservations.sql',
]
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
    '-v',
    'VERBOSITY=terse',
  ],
  { input: fixtures + tests, encoding: 'utf8' },
);
mkdirSync('reports', { recursive: true });
writeFileSync('reports/database.txt', (result.stdout ?? '') + (result.stderr ?? ''));
if (result.status !== 0)
  throw result.error ?? new Error(result.stderr || 'Local database tests failed.');
console.log(result.stdout.trim());
console.log(result.stderr.trim());
