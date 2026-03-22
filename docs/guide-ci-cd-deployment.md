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
- **E2E Visual Regression (TerminalDirector)**: 
  - The CI runner provisions an empty filesystem.
  - Executes the headless `run_demo_recording.sh` pipelines (e.g., `record_git_import_export.ts`).
  - *Constraint Check*: Ensures the output ASCII casts exactly match previous keyframes (or succeeds without throwing/hanging), proving that AI parsing, REPL IO, and the Materializer sandbox have not functionally broken.

### Stage 2: The Staging Deployment (On push to `main`)
Once code merges to `main`, the pipeline automatically promotes to Staging.
- **Backend Sync**: Runs `wrangler deploy --env staging` to push the latest Durable Object state to the staging Worker (e.g., `api-staging.andrey-stepantsov.workers.dev`).
- **NPM "Next" Channel**: The CLI and Core packages are automatically compiled and published to the NPM registry appended with the `@next` tag (e.g., `npm publish --tag next`). 
- **Internal Dogfooding**: Core developers update their global binaries using `npm i -g @cr/cli@next` to functionally test the bleeding-edge features against the Staging Edge before they are fully finalized.

### Stage 3: The Production Release (On Version Tag `v*.*.*`)
When a changeset release branch is merged:
- **Production Edge Promotion**: The pipeline executes `wrangler deploy --env production`, linking the immutable D1 database and routing traffic to the global production Worker (e.g., `api.andrey-stepantsov.workers.dev`).
- **NPM Stable Release**: The binaries drop their prerelease tags and are formally published as `@latest` to the public registry.
- **VS Code Marketplace**: The `vsce publish` action successfully submits the compiled `apps/extension` payload to the Microsoft Marketplace.

## 4. Environment Variables & Safety Overrides

To completely isolate production D1 databases from rogue developer testing AI loops, the frontend clients (CLI/Extension) actively check for routing overrides:

| Variable | Purpose | Default Behavior |
| --- | --- | --- |
| `CR_ENV` | Indicates operating mode (`prod`, `staging`, `local`). | `prod` (uses stable API). |
| `CR_EDGE_URL` | Explicitly overrides the WebSocket Sync Daemon URL. | `wss://api.andrey-stepantsov.workers.dev` |
| `CR_GEMINI_API_KEY` | Bypasses Cloudflare Vault targeting to test pure local AI instances. | `null` (Offloads LLM API calls securely to the Edge) |

## Summary Execution

This CI/CD architecture transforms Cognitive Resonance from a localized AI script into an enterprise-grade distributed network. Any developer can fork the CLI safely offline, while the maintainers control a fully automated pipeline pumping tested updates simultaneously to NPM, Visual Studio Code, and Cloudflare datacenters.
