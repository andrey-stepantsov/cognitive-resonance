import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/cognitive-resonance-pwa/' : '/',
  plugins: [react(), tailwindcss()],
  define: {
    APP_VERSION: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/mermaid')) return 'vendor-mermaid';
          if (id.includes('node_modules/d3')) return 'vendor-d3';
        }
      }
    }
  }
});
