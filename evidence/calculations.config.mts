import { defineConfig } from 'vitest/config';
import base from '../vitest.config.mts';

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['evidence/calculations.test.ts', 'evidence/session-defect.test.ts'],
    reporters: ['default', ['junit', { outputFile: 'reports/lab5-evidence/calculations.xml' }]],
  },
});
