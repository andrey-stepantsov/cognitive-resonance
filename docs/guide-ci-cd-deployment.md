# Cognitive Resonance: CI/CD & Deployment Architecture

This document defines the strict development flow, testing requirements, and automated deployment pipelines required to sustain Cognitive Resonance at production scale. Because CR is a distributed monorepo encompassing CLI binaries, VS Code Extensions, NPM packages, and Cloudflare Edge microservices, the deployment pipeline must be rigidly bifurcated into **Development**, **Staging**, and **Production** tracks.

## 1. The Monorepo Versioning Strategy (Changesets)

We utilize strict Semantic Versioning (`semver`) orchestrated by [Changesets](https://github.com/changesets/changesets). Every PR must include a changeset file detailing whether the bump is a `major`, `minor`, or `patch` across the affected workspaces.

* **`@cr/core`**: The foundational types, command parsers, and event schema logic.
* **`@cr/cli`**: The terminal executable package.
* **`@cr/backend`**: The Cloudflare Worker / Durable Object routing infrastructure.
* **`@cr/extension`**: The VS Code Extension distribution.

## 2. The Development Flow (Local Hacking)

When a developer clones the repository to iterate on new features:
1. **Isolated Daemon**: The developer relies purely on the local materializer disk paths (`/tmp/cr-manual-test` and local `.cr/` SQLite database).
2. **Linked CLI Execution**: Uses `npm link -w apps/cli` to globally link `cr` to the local `/dist/index.js` file, enabling instant execution upon recompilation (`npm run dev -w apps/cli`).
3. **No Edge Pollution**: By default, `cr start` runs entirely hermetically offline. To test Edge features locally, the developer runs `npm run dev -w backend/edge` to spin up `wrangler dev` (Local Cloudflare Emulator), and sets their CLI context via an environment override: `CR_EDGE_URL=http://localhost:8787 cr start`.

## 3. The CI/CD Pipeline (GitHub Actions)

Every push to the repository triggers our robust GitHub Actions matrix.

### Stage 1: The Verification Matrix (On PR Open)
- **Code Quality**: `npm run lint` and `tsc --noEmit` across all workspaces.
- **Unit & Integration Testing**: `vitest run` executes all standard mathematical, parser, and IO unit tests.
- **Preview Environments**: Automatically spins up an ephemeral Cloudflare Worker (e.g., `cr-vector-pipeline-preview-pr-123`) using the shared staging D1 database and Vectorize index to avoid hitting Cloudflare API limits. Teardowns are handled automatically on PR merge/close.

### Stage 2: The Staging Deployment (On push to `main`)
Once code merges to `main`, the pipeline automatically promotes to Staging.
- **Backend Sync**: Runs `npm run provision:staging` followed by `wrangler deploy --env staging` to push the latest Durable Object state to the staging Worker (e.g., `cr-vector-pipeline-staging.andrey-stepantsov.workers.dev`).
- **NPM "Next" Channel**: The CLI and Core packages are automatically compiled and published to the NPM registry appended with the `@next` tag. 

### Stage 3: The Production Release (On push to `production` branch)
When a release is ready, changes are PR'd into the protected `production` branch:
- **Production Edge Promotion**: The pipeline executes `wrangler deploy --env production`, linking the immutable D1 database and routing traffic to the global production Worker (e.g., `cr-vector-pipeline.andrey-stepantsov.workers.dev`).
- **NPM Stable Release**: The binaries drop their prerelease tags and are formally published as `@latest`.
- **Smoke Tests**: Runs automated smoke tests against the production edge API to verify deployment viability.

## 4. Identity Isolation & Visual Cues

To strictly isolate production from development/staging, Cognitive Resonance implements physical environment segregation and clear visual markers:

* **Ed25519 Identity Isolation**: Staging and Production edges utilize completely separate asymmetric cryptographic keypairs (`.keys/dev/` vs `.keys/prod/`). Admin commands execution (`cr admin`) enforce isolation via the `--env <dev|prod|preview>` flag. The Edge workers verify identities exclusively against their configured `CR_PUBLIC_KEY`.
* **Database & Vector Separation**: Staging infrastructure operates on distinct resources (e.g., `cr-sessions-staging` D1 database and `cr-sessions-index-staging` Vectorize index).
* **DEV Visual Cues**: When operating against Staging or Local environments, the CLI explicitly injects a `[DEV 🧪]` prefix in the terminal prompt. PWA interfaces display watermarks and header badges to prevent operators from executing destructive commands in the wrong context. Outstanding outbound Telegram bot messages also append a DEV tag indicator.

## 5. Environment Variables & Safety Overrides

To completely isolate production D1 databases from rogue developer testing AI loops, the frontend clients (CLI/Extension) actively check for routing overrides:

| Variable | Purpose | Default Behavior |
| --- | --- | --- |
| `CR_ENV` | Indicates operating mode (`prod`, `staging`, `local`). | `prod` (uses stable API). |
| `CR_EDGE_URL` | Explicitly overrides the WebSocket Sync Daemon URL. | `wss://api.andrey-stepantsov.workers.dev` |
| `CR_GEMINI_API_KEY` | Bypasses Cloudflare Vault targeting to test pure local AI instances. | `null` (Offloads LLM API calls securely to the Edge) |

## Summary Execution

This CI/CD architecture transforms Cognitive Resonance from a localized AI script into an enterprise-grade distributed network. Any developer can fork the CLI safely offline, while the maintainers control a fully automated pipeline pumping tested updates simultaneously to NPM, Visual Studio Code, and Cloudflare datacenters.
