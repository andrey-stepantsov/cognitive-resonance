# Distributed Deployment & Infrastructure Guide

This document is intended for system administrators deploying the Cognitive Resonance Cloudflare worker and Progressive Web App.

## 1. Backend: Cloudflare Edge Worker

The backend is an event-sourced architecture powered by Cloudflare Workers, Durable Objects (for WebSocket sync), and D1 (for relational event storage).

### Live Deployment
To deploy the backend to your own Cloudflare account:
```bash
cd packages/cloudflare-worker
npx wrangler deploy
```

### Seeding Secrets
The Worker contains a strict HTTP authentication layer (`Packages/cloudflare-worker/src/index.ts -> requireAuth`) that rejects all incoming connections without a valid token. You must inject two critical secrets into the deployed Worker environment:

1. **The Edge Connection Key (`API_KEY`)**
   This is the master static key that web PWA users type into their "Edge Connection" popup to gain database access.
   ```bash
   npx wrangler secret put API_KEY
   # Enter something secure, e.g. "cognitive-resonance-admin-key"
   ```

2. **The Cryptographic JWT Secret (`JWT_SECRET`)**
   The CLI uses a native `/signup` and `/login` flow that mathematically signs JSON Web Tokens for identity verification. The Worker requires a secret to sign these payloads.
   ```bash
   echo "cr_jwt_secret_$(openssl rand -hex 32)" | npx wrangler secret put JWT_SECRET
   ```

---

## 2. Frontend: PWA web-deployment

The Progressive Web App communicates with the Cloudflare Worker. When compiling the React app code for production, it requires knowledge of the Cloudflare Worker's URL.

### GitHub Actions Pipeline
The deployment pipeline is automated in `.github/workflows/deploy-pwa.yml`. It triggers whenever code is pushed to the `main` branch.

### Provisioning the Pipeline Secrets
The Action pipeline uses Vite to build the PWA. To tell Vite where the backend lives globally, you must define the URL as a Repository Secret in GitHub:

1. Go to your GitHub Repository > **Settings** > **Secrets and variables** > **Actions**.
2. Click **New repository secret**.
3. Name: `VITE_CLOUDFLARE_WORKER_URL`
4. Value: `https://cr-vector-pipeline.<your-account>.workers.dev`

### Compilation Magic
During the Action sequence:
```yaml
      - name: Build PWA
        run: npm run build -w pwa
        env:
          VITE_CLOUDFLARE_WORKER_URL: ${{ secrets.VITE_CLOUDFLARE_WORKER_URL }}
```
Vite injects this URL directly into the `App.tsx` and `CloudflareAuthProvider.ts`. 

*(Note: The `vite-plugin-pwa` utilizes Workbox to cache all Javascript. We specifically implement Rollup manual code-splitting to isolate massive 3MB dependencies into separate chunks, preventing Workbox cache limit build failures).*
