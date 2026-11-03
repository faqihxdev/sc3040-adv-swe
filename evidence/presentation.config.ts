import { defineConfig } from '@playwright/test';
import { join, resolve } from 'node:path';
import base from '../playwright.config';

const recordingDirectory = resolve('reports/presentation-recording');

export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: 'presentation.spec.ts',
  timeout: 120_000,
  outputDir: join(recordingDirectory, 'accepted'),
  reporter: [
    ['list'],
    ['html', { outputFolder: join(recordingDirectory, 'html'), open: 'never' }],
    ['junit', { outputFile: join(recordingDirectory, 'result.xml') }],
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
