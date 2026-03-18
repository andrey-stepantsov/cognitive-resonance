# Cognitive Resonance Developer Guide

Welcome to the **Cognitive Resonance** project! This multi-platform AI chat application leverages a Local-First Event-Sourced architecture with powerful semantic analysis via Cloudflare Vectorize.

This guide provides instructions to onboard new developers, configure the environment, setup Cloudflare Edge components, and use the powerful CLI toolset.

## 1. Environment Setup

Copy the example environment variables file into the project root:
```bash
cp .env.example .env
export $(cat .env | xargs)
```

You will need the following API keys and configurations:
```ini
VITE_CLOUDFLARE_WORKER_URL=https://cr-vector-pipeline.YOUR-SUBDOMAIN.workers.dev
VITE_CR_API_KEY=your-api-key-here
GEMINI_API_KEY=your-gemini-ai-key-here
```
> **Note:** The `VITE_CR_API_KEY` defines your primary authentication secret since Cognitive Resonance securely operates over Cloudflare edge rather than a conventional auth server. The underlying Local-First storage operates robustly via `VITE_CLOUDFLARE_WORKER_URL` HTTP synchronization.

## 2. Setting Up Cloudflare Infrastructure (Wrangler)

The backend (`packages/cloudflare-worker`) operates completely via Cloudflare.

To begin, ensure you are authenticated:
```bash
npx wrangler login
```

### D1 Database (SQLite)
The application fundamentally depends on a central SQLite edge database to persist events and sessions.

1. **Create the D1 Database:**
```bash
npx wrangler d1 create cr-sessions
```
2. **Update `wrangler.toml`:**
Copy the printed `database_name` and `database_id` blocks into `packages/cloudflare-worker/wrangler.toml` under `[[d1_databases]]`.

3. **Schema Execution:**
(If migrations are generated, run the deploy commands locally and remotely):
```bash
npx wrangler d1 migrations apply cr-sessions --remote
```

### Vectorize Index (Semantic Embeddings)
Vectorize works seamlessly alongside Workers AI for embedding RAG context.
```bash
npx wrangler vectorize create cr-sessions-index --dimensions=768 --metric=cosine
```
*(The dimensions match the `@cf/baai/bge-base-en-v1.5` embeddings standard).*

### R2 Storage (Git Objects)
Cloudflare R2 functions as the scalable Git BLOB repository.
```bash
npx wrangler r2 bucket create cr-git-repos
```

### Validate and Deploy Worker
Once provisioned:
```bash
cd packages/cloudflare-worker
npm run deploy
```

## 3. Command Line Interface (CLI) Usage

Cognitive Resonance is distributed with a high-performance CLI (`apps/cli`), functioning as both an interactive REPL and a headless execution utility. 

Execute the application via NPM workspace routing:
```bash
npm run dev --workspace=apps/cli
```

### Core Commands

| Command | Description |
|---|---|
| `cr serve` | Deploys the CLI backend (`DatabaseEngine.ts`) locally to proxy for `localhost:3000`. Acts as a synchronization event-source instance in the local-first structure. |
| `/login` | Provisions credential mapping for interactive use via config files. Evaluates `.env` and `VITE_CR_API_KEY`. |
| `/observe` | Toggles the real-time AI Cognitive State (Dissonance & Semantic Markers) visual output logs alongside the generated stream response. |
| `/git pull` | Connects securely to the Cloudflare Worker API. Parses remote HEAD references and reconstructs incremental `isomorphic-git` packfiles synchronously merging them with local artifact topologies. |

### Headless Execution (CI/Scripting)
The CLI exposes a machine-optimized execution paradigm designed explicitly for CI pipelines and pipe chains. 

Example integration with command line pipelines:
```bash
cat debugging_log.txt | cr chat "Investigate memory leak" --format json
```
*When executed with `--format json`, the system strictly conforms payload structures to parsable data blocks (useful via `jq`) dropping conversational context completely.*
