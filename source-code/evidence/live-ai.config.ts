import { defineConfig } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

if (process.env.UEN_LIVE_EVIDENCE !== 'approved')
  throw new Error('Live evidence requires UEN_LIVE_EVIDENCE=approved and incurs API charges.');
const local = parseEnv(readFileSync('.env.local', 'utf8'));
const root = existsSync('../.env') ? parseEnv(readFileSync('../.env', 'utf8')) : {};
if (new URL(local.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname !== '127.0.0.1')
  throw new Error('Live evaluation requires the local test database.');
const key = local.OPENAI_API_KEY || root.OPENAI_API_KEY;
if (!key) throw new Error('No authorised API key is available.');
Object.assign(process.env, local, { OPENAI_API_KEY: key, AI_ENABLED: 'true' });

export default defineConfig({
  testDir: '.',
  testMatch: 'live-ai.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 1_500_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/lab5-evidence/live-html', open: 'never' }],
    ['junit', { outputFile: 'reports/lab5-evidence/live.xml' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    browserName: 'chromium',
    viewport: { width: 1366, height: 768 },
    screenshot: 'only-on-failure',
    trace: 'off',
  },
  outputDir: 'reports/lab5-evidence/live-browser-output',
  webServer: {
    command: 'pnpm dev --port 3100',
    url: 'http://127.0.0.1:3100/login',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...local,
      OPENAI_API_KEY: key,
      AI_ENABLED: 'true',
      DEMO_MODE: 'false',
      APP_ORIGIN: 'http://127.0.0.1:3100',
      USEEATNOW_TEST_BUILD: 'false',
    },
  },
});
