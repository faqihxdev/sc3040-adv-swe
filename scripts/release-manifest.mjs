import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

function git(...args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr.trim());
  return result.stdout.trim();
}
const source = git('status', '--porcelain', '--', '.');
if (source)
  throw new Error(
    'Commit and review the release files first; a dirty checkout is not a release baseline.',
  );
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const migrations = readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('.sql'))
  .sort();
const manifest = {
  generatedAt: new Date().toISOString(),
  commit: git('rev-parse', 'HEAD'),
  branch: git('branch', '--show-current'),
  packageVersion: JSON.parse(readFileSync('package.json')).version,
  lockSha256: hash('pnpm-lock.yaml'),
  migrations: migrations.map((name) => ({
    file: name,
    sha256: hash(join('supabase/migrations', name)),
  })),
  configSha256: {
    local: hash('supabase/config.toml'),
    hosted: hash('deployment/supabase/config.toml'),
  },
  evidence: [
    'unit.xml',
    'browser.xml',
    'database.txt',
    'restore.json',
    ...[
      'ChromiumMobile360',
      'ChromiumDesktop1366',
      'FirefoxMobile360',
      'FirefoxDesktop1366',
    ].flatMap((profile) => [`browser-${profile}.json`, `load-${profile}.json`]),
  ]
    .filter((name) => {
      try {
        readFileSync(join('reports', name));
        return true;
      } catch {
        return false;
      }
    })
    .map((name) => ({ file: name, sha256: hash(join('reports', name)) })),
};
mkdirSync('reports', { recursive: true });
writeFileSync('reports/release-manifest.json', JSON.stringify(manifest, null, 2));
console.log(
  'reports/release-manifest.json generated. Copy reviewed source/evidence to the GitLab submission; exclude credentials and backups.',
);
