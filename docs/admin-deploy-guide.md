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

### 1. Seeding the Root Identity Authority

The Worker now strictly implements a **Dual-Token Asymmetric Authenticator**. It intercepts mathematical signatures mapped against an Ed25519 PKI root structure. To set this up:

1. **The Asymmetric Public Key (`CR_PUBLIC_KEY`)**
   Offline, run the identity minter script (detailed in section 3) to generate your core keypair. Once generated, upload *only* the resulting `.pub` file into your worker's encrypted vault.
   ```bash
   npx wrangler secret put CR_PUBLIC_KEY < /path/to/save/.keys/ed25519.pub
   ```

2. **The Session HMAC Key (`JWT_SECRET`)**
   Because the Edge instantaneously swaps Asymmetric Tokens into fast 1-hour symmetric `HS256` tokens for throughput, a symmetric shared JWT secret is still required:
   ```bash
   echo "cr_jwt_secret_$(openssl rand -hex 32)" | npx wrangler secret put JWT_SECRET
   ```

---

## 2. Managing Identities & Permissions

User identity and activation tokens are managed entirely offline on the Administrator's secure machine to prevent private-key leaks to the cloud.

### 2a. Minting a New Identity Token
To authorize a new human, agent, or programmatic CLI client, execute the offline Minter:
```bash
npx tsx packages/core/src/scripts/mint_token.ts <target_user_identity> [optional_days_valid]
```
- A `days_valid` numeric parameter will mathematically bake an `exp` claim into the cryptograph.
- Omitting the parameter generates an infinite-horizon *Permanent Identity*.

The resulting block of Base64 strings should be sent uniquely to the user, who then executes `cr activate <token>` on their end.

### 2b. Instant Access Revocation
We natively utilize D1 lookups at the Edge exclusively during the 1-hour swap boundary.
To immediately and globally terminate an identity (or leaked permanent token), inject the username into the stateful `revoked_identities` table:
```bash
npx wrangler d1 execute cr-sessions --remote --command "INSERT INTO revoked_identities (identity, revoked_at) VALUES ('<target_user_identity>', strftime('%s','now'));"
```

## 3. Frontend: PWA web-deployment

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
