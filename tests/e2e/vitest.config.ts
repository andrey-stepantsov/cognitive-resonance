import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./setup.ts'],
    testTimeout: 30000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@cr': resolve(__dirname, '../../packages/'),
    },
  },
});
