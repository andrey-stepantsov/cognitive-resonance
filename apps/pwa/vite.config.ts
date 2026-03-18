import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  // BUT we need to load it from the monorepo root
  const env = loadEnv(mode, '../../', '')

  return {
    base: process.env.GITHUB_ACTIONS ? '/cognitive-resonance/' : '/',
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        devOptions: { enabled: false },
        workbox: {
          maximumFileSizeToCacheInBytes: 5000000 // 5 MB
        }
      })
    ],
    define: {
      'import.meta.env.VITE_CLOUDFLARE_WORKER_URL': JSON.stringify(env.VITE_CLOUDFLARE_WORKER_URL),
    },
    server: {
      port: 5173,
      strictPort: true,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/mermaid')) return 'vendor-mermaid';
            if (id.includes('node_modules/d3')) return 'vendor-d3';
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'vendor-react';
            if (id.includes('node_modules/@cr/core') || id.includes('node_modules/@cr/ui')) return 'cr-packages';
          }
        }
      }
    }
  }
})
