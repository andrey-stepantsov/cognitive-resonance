# Cognitive Resonance Architecture

## Overview
Cognitive Resonance is a multi-platform AI chat application built as an NPM Workspace monorepo. It features a Local-First Sync Topology, Event-Sourced artifact materialization, and an advanced AI Cognitive State engine.

## Workspaces Structure
- **`apps/extension`**: The VS Code webview extension.
- **`apps/pwa`**: The Vite/React Progressive Web App (also deployable as mobile iOS/Android apps via Capacitor).
- **`apps/cli`**: A robust Node.js Command Line Interface supporting both interactive REPL and headless batch execution modes. It is driven by an abstract `IoAdapter`.
- **`packages/terminal-director`**: Stateful multi-head `node-pty` integration and scriptable terminal recording framework.
- **`packages/ui`**: Highly optimized React components (Markdown, Mermaid, Semantic Graphs, Dissonance Meters) designed to be responsive and native touch-aware.
- **`packages/core`**: Core utilities including semantic search, state management, AI APIs, and Capacitor wrappers.
- **`packages/backend`**: Contains integration providers and utilities to interact with Cloudflare (D1 Storage, Workers, R2) and event-sourced synchronization.

## Key Architectural Pillars

### 1. Local-First Sync Topology
The platform operates on a Local-First, Event-Sourced architecture. The local device acts as the absolute source of truth, capable of autonomous offline execution.
- **Storage:** The CLI uses a local SQLite database (`DatabaseEngine.ts`), while the PWA utilizes IndexedDB.
- **Synchronization:** Both interfaces aggressively sync their events up to the Cloudflare Worker edge database (D1) using an incremental HTTP sync daemon (`runSyncDaemon` chunking events to `/api/events/batch`).
- **Real-Time Data:** Live presence and inter-client events are broadcast instantaneously using Cloudflare Durable Objects and WebSockets.

### 2. Local-First Event-Sourced Materializer
Single-user and multiplayer asynchronous artifact document editing is backed seamlessly by an Event-Sourced Materialization Engine.
- **Client-Side:** The clients (PWA, extension, CLI) rely entirely on `DatabaseEngine.ts` and `Materializer.ts` to rebuild state natively from a linear SQLite event log.
- **Cloudflare Edge Integration:** While the Cloudflare Worker maintains the Git Smart HTTP protocol (`git-receive-pack` and `git-upload-pack`) for edge compatibility, the core sync mechanism relies on the event stream.
- **Storage:** The core state is kept in the event log (SQLite locally, D1 on the Edge). For Git integration points, the worker intercepts payloads using `packParser.ts`, extracts the respective Git objects, and maps them as loose objects directly into Cloudflare R2 Storage.
- **Dynamic Materialization:** Instead of `git pull`, the local client dynamically constructs physical workspaces from the event stream. The `Materializer` resolves strict dependencies on the fly during `/exec` commands, supporting multi-repo operations natively.

### 3. AI Cognitive State (Dissonance & Semantic Markers)
The system tracks the AI's internal processing context natively.
- **Structured LLM Evaluation:** The LLM (`GeminiService.ts`) is strictly prompted via Structured Outputs to evaluate its current logical state on every turn, outputting a `dissonanceScore` (0-100) alongside dynamic `semanticNodes` and `semanticEdges`.
- **Persistence:** This AI metadata is permanently stored with the message inside the `events` table architecture.
- **Visualization:** In the PWA and VS Code Extension, users can visually explore this state through the `DissonanceMeter` and an interactive 3D `SemanticGraph`. The CLI surfaces and logs dissonance natively.

[Read the Deep Dive: AI Cognitive State](docs/technical/ai_cognitive_state.md)

## Cloudflare Edge Infrastructure
The cloud backend runs entirely on Cloudflare:
- **Cloudflare D1:** (SQLite at the edge) handles all session metadata and event storage, operating behind an api key auth layer.
- **Cloudflare Workers:** Serves the D1 REST API, natively processes the Git HTTPS remote endpoints, and routes WebSocket upgrade requests to Durable Objects.
- **Cloudflare Vectorize:** Generates embeddings of conversations on-the-fly and handles semantic search.
- **Cloudflare Durable Objects:** Governs real-time multiplayer WebSocket rooms and WebRTC voice payloads for sub-millisecond sync capability.
- **Cloudflare R2:** Used as the distributed blob store to house individual Git loose objects and references.

## Tooling & Dependencies Decisions
*   **Authentication:** HMAC derived local JWT verification → Edge API key fallback (Bearer token).
*   **Vector Database:** Cloudflare Vectorize (via `@cf/baai/bge-base-en-v1.5` Workers AI model).
*   **Version Control:** Local SQLite event log (`DatabaseEngine.ts`), Git Smart HTTP on Cloudflare Worker, loose objects in R2.
*   **Multiplayer Collab:** WebSockets mediated by Cloudflare Durable Objects.
*   **CLI Framework:** Built atop a programmatic `IoAdapter` enabling seamless headless E2E testing. Features the **Terminal Director** utilizing `node-pty` for persistent, stateful shell execution, allowing AI manipulation and user observation of real-time terminal environments.

## Documentation
Additional module documentation is available in the `docs/` directory:
- [Git Object Storage Deep-Dive](docs/technical/git_object_storage.md)
- [AI Cognitive State Deep-Dive](docs/technical/ai_cognitive_state.md)
- [Collaboration Demo & Walkthrough](docs/demo-collaboration.md)
- [CLI Interactions Catalog](docs/design/cli_interactions_catalog.md)
- [DSL & REPL Design](docs/design/dsl_repl_design.md)
