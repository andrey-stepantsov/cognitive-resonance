import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    name: 'admin-cli',
    include: ['src/**/*.test.ts'],
  },
});
