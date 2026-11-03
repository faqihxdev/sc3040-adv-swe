import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const types = [
  ['next', 'dist/bin/next', ['typegen']],
  ['typescript', 'bin/tsc', ['--noEmit']],
];
const jobs = {
  types,
  all: [
    ['prettier', 'bin/prettier.cjs', ['--check', '.']],
    ['eslint', 'bin/eslint.js', ['.']],
    ...types,
    ['vitest', 'vitest.mjs', ['run', '--coverage']],
    ['next', 'dist/bin/next', ['build']],
  ],
};
const selected = jobs[process.argv[2] ?? 'all'];
if (!selected) throw new Error('Use check.mjs with no arguments, or with types.');

for (const [name, executable, args] of selected) {
  const binary = join(dirname(require.resolve(`${name}/package.json`)), executable);
  const result = spawnSync(process.execPath, [binary, ...args], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
