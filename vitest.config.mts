import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    clearMocks: true,
    reporters: ['default', ['junit', { outputFile: 'reports/unit.xml' }]],
    coverage: {
      provider: 'v8',
      include: ['src/domain/*.ts', 'src/server/meal-token.ts'],
      reporter: ['text', 'lcov', 'json-summary'],
    },
  },
});
