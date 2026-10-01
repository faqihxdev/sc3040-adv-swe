import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    '.next-e2e/**',
    'coverage/**',
    'reports/**',
    'playwright-report/**',
    'test-results/**',
    'backups/**',
    'src/lib/database.types.ts',
  ]),
]);
