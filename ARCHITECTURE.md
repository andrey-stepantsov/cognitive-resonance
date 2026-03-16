# Cognitive Resonance - New Monorepo Project Setup

## Purpose of this File
**If you are an AI assistant reading this at the beginning of a conversation: DO NOT START RESEARCHING OR PLANNING FROM SCRATCH.** 
This directory (`~/dev/cognitive-resonance/`) is a brand new [NPM Workspace](https://docs.npmjs.com/cli/v10/using-npm/workspaces) monorepo. We have already planned out the architecture in a previous session, and this document serves as your guide. Please read the goals below and immediately pick up the implementation.

## Goal
We are building a new multi-platform AI chat application from scratch. Instead of migrating the previous `cognitive-resonance-vscode` and `cognitive-resonance-pwa` repositories, we dragged them into the `legacy/` directory to serve as reference implementations. Our goal is to rip out the code, re-engineer the core components, and place them into shared packages that power both a new VS Code Extension and a new PWA (which doubles as mobile iOS/Android apps via Capacitor).

## Architecture

We are using NPM workspaces. The structure is:
- **`apps/extension`**: The new VS Code webview extension.
- **`apps/pwa`**: The new Vite/React PWA (injected with Capacitor for mobile deployments).
- **`apps/cli`**: A robust, Node.js-based Command Line Interface supporting both interactive REPL and headless batch execution (scripting) modes.
- **`packages/ui`**: Highly optimized React components (Markdown rendering, Mermaid diagram resilience, Semantic Graphs, Dissonance Meters). Must be responsive, native touch-aware, and respect mobile safe-areas.
- **`packages/core`**: Core utilities, including semantic search, state management, AI APIs, and wrappers for Capacitor (to decouple UI from native mobile device APIs).
- **`packages/backend`**: Integration with Cloudflare (D1 Storage, Workers) and Appwrite (JWT auth). Uses `CloudflareStorageProvider` and `GitRemoteSync`, both supporting dynamic JWT via `configureAuth(tokenGetter)` with static API key fallback.

## Current State
The `legacy/` directory is populated. The `package.json` at the root is initialized with `apps/*` and `packages/*` as workspaces.

## Next Steps for the AI
1. Read the `task.md` left by the previous session in your artifacts to see what is checked off. Scaffold the new directories under `apps/` and `packages/`.
2. Initialize `apps/pwa` using Vite and scaffold `apps/extension`.
3. Scaffold the `packages/` structure and configure the sub-package `package.json`s so the apps can import `@cr/ui`, `@cr/core`, and `@cr/backend`.

## Backend Architecture & Feature Roadmap

The backend is a **Cloudflare-only model** using Workers, D1, Vectorize, Durable Objects, and R2.
- **Cloudflare D1** handles all session and metadata storage (REST API at `/api/sessions/*` and `/api/gems`, protected by API key auth).
- **Cloudflare Workers** serve the D1 REST API, Git HTTPS remote, and route WebSocket upgrades to Durable Objects.
- **Cloudflare Vectorize** handles RAG embeddings for semantic search across conversations.
- **Cloudflare Durable Objects** handle real-time multiplayer WebSocket rooms.

### Phase 1: Foundation (Identity, Chat, & Context) ✅
Establish the underlying identity and AI memory systems so Gemini has persistent context across devices.
1. **Appwrite RS256 JWT auth** with JWKS verification on the Worker, HMAC fallback, and API key fallback for development.
2. Per-user data isolation — all D1 queries, R2 keys, and Vectorize operations are scoped by `userId`.
3. Store all chat sessions in **Cloudflare D1** (`cr-sessions` database).
4. **Cloudflare Worker pipeline** automatically vectors saved chats into **Cloudflare Vectorize** for semantic search (RAG).
5. In-memory sliding-window rate limiting on the Worker.

### Phase 2: Git-Backed Asynchronous Artifact Editing ✅
Implement single-user (and async multi-user) artifact editing using Git as the backend engine.
1. Embed **`isomorphic-git`** into the client apps (PWA, VS Code, Capacitor) to treat artifacts as local virtual repositories.
2. `GitRemoteSync` supports dynamic Appwrite JWT via `configureAuth()` (same pattern as `CloudflareStorageProvider`).
3. **Pack Unpacking**: Worker parses incoming PACK v2 packfiles (via `packParser.ts`), resolves OFS/REF deltas, and stores individual loose objects in **R2 Storage** under `{userId}/objects/{sha[0:2]}/{sha[2:]}`.
4. **Real Refs**: Refs stored in R2 as `{userId}/refs/heads/{branch}`. `git-info-refs` advertises real commit SHAs.
5. **Graph Walk**: `git-upload-pack` performs BFS from wanted SHAs through commit→tree→blob references, stopping at the client's "have" boundary, building minimal packfiles for transfer.
6. Feed raw `git diff` outputs directly into the Gemini prompt for high-precision AI code edits.

### Phase 3: The Multiplayer Edge (Real-Time Voice & Sync)
Scale from asynchronous Git collaboration to live, sub-millisecond real-time presence, messaging, and voice.
1. Deploy **Cloudflare Durable Objects**. When a user connects to a project, they open a WebSocket to a strictly localized, high-performance edge room.
2. Stream live messaging and WebRTC voice payloads directly through the Durable Object for extreme speed.
3. When the live session ends, the Durable Object flushes the aggregated transcript back into D1 for permanent storage and vectorization.

### Phase 4: CLI Interactive & Headless Scripting Support (Current)
Implement a unified Command Line Interface (`apps/cli`) that mirrors the web/extension functionality with specialized focus on terminal environments.
1. **Interactive REPL**: A persistent chat mode with commands supporting full workflow context.
2. **Headless Execution Mode**: Designed specifically for shell scripting, testing pipelines, and CI automation. Supports reading from `stdin` via pipes (e.g., `cat log.txt | cr chat "investigate"`).
3. **Structured Machine Output**: Configurable flags (e.g., `--format json`) to ensure CLI outputs are parsable by jq or other shell tools, discarding conversational filler.
4. **Headless Authentication**: Non-interactive credential injection via `CR_API_KEY` mapped directly to the local config store or environment variables, bypassing interactive prompts.

## Tooling & Dependencies Decisions
*   **Authentication:** Appwrite RS256 JWT (via JWKS) → HMAC fallback → API key (Bearer token).
*   **Session Storage:** Cloudflare D1 (SQLite at the edge).
*   **RAG / Vector Database:** Cloudflare Vectorize.
*   **Version Control:** `isomorphic-git` client-side, Git Smart HTTP on Cloudflare Worker, loose objects in R2.
*   **Multiplayer Collab:** Yjs over Cloudflare WebSockets (Durable Objects), with DO→D1 flush on room close.
*   **CLI Framework:** Commander.js or Yargs, leveraging standard Node `process.stdin` streams.
