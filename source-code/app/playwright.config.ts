import { defineConfig } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const local = existsSync('.env.local') ? parseEnv(readFileSync('.env.local', 'utf8')) : {};
const url = local.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (new URL(url).hostname !== '127.0.0.1') throw new Error('Browser tests require local Supabase.');
Object.assign(process.env, local);
export const testSecret = 'useeatnow-local-browser-test-signing-key';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'reports/browser.xml' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'ChromiumMobile360',
      use: {
        browserName: 'chromium',
        viewport: { width: 360, height: 800 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'ChromiumDesktop1366',
      use: { browserName: 'chromium', viewport: { width: 1366, height: 768 } },
    },
    {
      name: 'FirefoxMobile360',
      // Narrow viewport only. Playwright Firefox does not emulate a mobile browser.
      use: { browserName: 'firefox', viewport: { width: 360, height: 800 } },
    },
    {
      name: 'FirefoxDesktop1366',
      use: { browserName: 'firefox', viewport: { width: 1366, height: 768 } },
    },
  ],
  webServer: {
    command: 'pnpm dev --port 3100',
    url: 'http://127.0.0.1:3100/login',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...local,
      APP_ORIGIN: 'http://127.0.0.1:3100',
      USEEATNOW_TEST_BUILD: 'true',
      DEMO_MODE: 'false',
      AI_ENABLED: 'true',
      OPENAI_API_KEY: '',
      MEAL_SIGNING_SECRET: testSecret,
    },
  },
});
