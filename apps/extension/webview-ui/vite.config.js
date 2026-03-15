import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../../../', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      // Appwrite injections for @cr/backend
      'import.meta.env.VITE_APPWRITE_ENDPOINT': JSON.stringify(env.VITE_APPWRITE_ENDPOINT),
      'import.meta.env.VITE_APPWRITE_PROJECT': JSON.stringify(env.VITE_APPWRITE_PROJECT),
      'import.meta.env.VITE_APPWRITE_DB_ID': JSON.stringify(env.VITE_APPWRITE_DB_ID),
      'import.meta.env.VITE_APPWRITE_SESSIONS_COLLECTION_ID': JSON.stringify(env.VITE_APPWRITE_SESSIONS_COLLECTION_ID),
      'import.meta.env.VITE_CLOUDFLARE_WORKER_URL': JSON.stringify(env.VITE_CLOUDFLARE_WORKER_URL),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
          entryFileNames: `assets/index.js`,
          assetFileNames: `assets/index.[ext]`
        }
      }
    }
  };
});
