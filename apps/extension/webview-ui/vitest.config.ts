import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/main.tsx', 'src/vite-env.d.ts']
    },
    server: {
      deps: {
        inline: ['@cr/ui', '@cr/core', '@cr/backend']
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    },
  },
});
