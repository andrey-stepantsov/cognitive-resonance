import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  // BUT we need to load it from the monorepo root
  const env = loadEnv(mode, '../../', '')

  return {
    base: process.env.GITHUB_ACTIONS ? '/cognitive-resonance/' : '/',
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_CLOUDFLARE_WORKER_URL': JSON.stringify(env.VITE_CLOUDFLARE_WORKER_URL),
    },
    server: {
      port: 5173,
      strictPort: true,
    }
  }
})
