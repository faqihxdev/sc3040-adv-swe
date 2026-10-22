import { defineConfig } from '@playwright/test';
import base from '../playwright.config';

export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: 'presentation.spec.ts',
  timeout: 120_000,
  outputDir: '../reports/presentation-recording/accepted',
  reporter: [
    ['list'],
    ['html', { outputFolder: '../reports/presentation-recording/html', open: 'never' }],
    ['junit', { outputFile: '../reports/presentation-recording/result.xml' }],
  ],
  projects: [
    {
      name: 'PresentationChromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1366, height: 768 },
        colorScheme: 'dark',
        reducedMotion: 'reduce',
        video: { mode: 'on', size: { width: 1366, height: 768 } },
        trace: 'on',
        screenshot: 'on',
      },
    },
  ],
});
