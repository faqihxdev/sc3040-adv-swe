import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const source = resolve('reports/lab5-evidence');
const raw = JSON.parse(readFileSync(join(source, 'live-ai.json'), 'utf8'));
assert.equal(raw.runs.length, 20);
const criterion = JSON.parse(readFileSync('evidence/protocol.json', 'utf8'));
const assessment = {
  case: 'TC-LIV-02',
  rawSha256: createHash('sha256')
    .update(readFileSync(join(source, 'live-ai.json')))
    .digest('hex'),
  targetSeconds: criterion.timing.targetSeconds,
  requiredPasses: criterion.timing.requiredPasses,
  recordedRequests: raw.runs.length,
  displayedRecipeRequests: raw.runs.filter((run) => run.recipesDisplayed > 0).length,
  currentPasses: raw.runs.filter(
    (run) => run.recipesDisplayed > 0 && run.seconds <= criterion.timing.targetSeconds,
  ).length,
  scope: raw.scope,
  criterionRecord:
    'UEN-CR-PERF-01, task #50. Criterion changed after measurement; raw results unchanged.',
  acceptance: 'Recorded observation; semantic QA and final release decisions remain separate.',
};
writeFileSync(join(source, 'criterion-assessment.json'), JSON.stringify(assessment, null, 2));
// Reports are ignored by Git and excluded from the app compiler.
const archiveDirectory = resolve('reports/lab5-evidence');
mkdirSync(archiveDirectory, { recursive: true });
let pack = join(archiveDirectory, 'pack-2026-10-20');
for (let suffix = 2; existsSync(pack); suffix++)
  pack = join(archiveDirectory, `pack-2026-10-20-${suffix}`);
mkdirSync(pack);
const files = [
  'reports/unit.xml',
  'reports/browser.xml',
  'reports/database.txt',
  'reports/restore.json',
  'reports/lab5-evidence/restore-with-reservation.json',
  'playwright-report',
  'coverage/lcov-report',
  'coverage/coverage-summary.json',
  'evidence/protocol.json',
  'evidence/review.json',
  'evidence/cases.json',
  'evidence/README.md',
  'evidence/calculations.config.mts',
  'evidence/calculations.test.ts',
  'evidence/session-defect.test.ts',
  'evidence/live-ai.config.ts',
  'evidence/live-ai.spec.ts',
  'evidence/restore-reservations.mjs',
  'scripts/backup.mjs',
  'evidence/reports/lab5-evidence/live.xml',
  'evidence/reports/lab5-evidence/live-html',
  'reports/lab5-evidence/ci-reference',
  ...readdirSync('reports')
    .filter((name) => /^(browser-|load-).*\.json$/.test(name))
    .map((name) => `reports/${name}`),
  ...readdirSync(source)
    .filter((name) => /\.(json|xml|png|webp)$/.test(name))
    .map((name) => `reports/lab5-evidence/${name}`),
];
for (const file of [...new Set(files)]) {
  if (!existsSync(file)) throw new Error(`Missing evidence: ${file}`);
  cpSync(file, join(pack, file), { recursive: true, errorOnExist: true, force: false });
}
for (const name of [
  'architecture.svg',
  'architecture.preview.png',
  'reservation-example.svg',
  'reservation-example.preview.png',
]) {
  cpSync(join('evidence/diagrams', name), join(pack, 'diagrams', name), {
    errorOnExist: true,
    force: false,
  });
}
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)],
  );
}
const retained = walk(pack);
const forbidden = retained.filter((file) =>
  /(^|[/\\])\.env|\.dump$|(^|[/\\])backups([/\\]|$)/i.test(file),
);
assert.equal(forbidden.length, 0);
const dirty = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout.trim();
const manifest = {
  kind: 'Presentation evidence preparation archive, not an approved release',
  createdAt: new Date().toISOString(),
  sourceCommit: raw.source,
  adapterSha256: raw.adapterSha256,
  workingTreeChanges: dirty.split('\n').filter(Boolean),
  criterion: assessment,
  reports: retained.map((file) => ({
    path: relative(pack, file).replaceAll('\\', '/'),
    sha256: hash(file),
  })),
  exclusions:
    'No environment files, credentials or database dumps. Private backups remain outside this archive.',
};
writeFileSync(join(pack, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(
  `${relative(process.cwd(), pack)}: ${retained.length} files retained with SHA-256 hashes. No env files or dumps.`,
);
