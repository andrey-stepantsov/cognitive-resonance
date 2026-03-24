import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/core/vitest.config.ts',
      'packages/ui/vitest.config.ts',
      'packages/cloudflare-worker/vitest.config.ts',
      'tests/e2e/vitest.config.ts',
      'apps/admin-cli/vitest.config.ts',
      'apps/admin-worker/vitest.config.ts',
    ],
  },
});
