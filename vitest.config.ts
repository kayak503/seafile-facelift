import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  // Browser journeys belong to Playwright and must not be collected by Vitest.
  test: { environment: 'node', include: ['tests/**/*.test.ts'], exclude: ['tests/e2e/**'] },
});
