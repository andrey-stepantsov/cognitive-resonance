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
- **`packages/ui`**: Highly optimized React components (Markdown rendering, Mermaid diagram resilience, Semantic Graphs, Dissonance Meters). Must be responsive, native touch-aware, and respect mobile safe-areas.
- **`packages/core`**: Core utilities, including semantic search, state management, AI APIs, and wrappers for Capacitor (to decouple UI from native mobile device APIs).
- **`packages/backend`**: Integration with Cloudflare (D1 Storage, Workers) to maintain and sync user state across all platforms. Uses `CloudflareStorageProvider` with API key authentication.

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
1. Anonymous auth with API key protection on all endpoints.
2. Store all chat sessions in **Cloudflare D1** (`cr-sessions` database).
3. **Cloudflare Worker pipeline** automatically vectors saved chats into **Cloudflare Vectorize** for semantic search (RAG).

### Phase 2: Git-Backed Asynchronous Artifact Editing
Implement single-user (and async multi-user) artifact editing using Git as the backend engine.
1. Integrate **Monaco / ProseMirror** editors into the clients for editing Markdown and Code.
2. Embed **`isomorphic-git`** into the client apps (PWA, VS Code, Capacitor) to treat artifacts as local virtual repositories.
3. Deploy a **Cloudflare Worker** as the Git HTTPS Remote. It intercepts client `git push` commands, validates the API key, and unpacks Git objects into **R2 Storage**.
4. Feed raw `git diff` outputs directly into the Gemini prompt for high-precision AI code edits.

### Phase 3: The Multiplayer Edge (Real-Time Voice & Sync)
Scale from asynchronous Git collaboration to live, sub-millisecond real-time presence, messaging, and voice.
1. Deploy **Cloudflare Durable Objects**. When a user connects to a project, they open a WebSocket to a strictly localized, high-performance edge room.
2. Stream live messaging and WebRTC voice payloads directly through the Durable Object for extreme speed.
3. When the live session ends, the Durable Object flushes the aggregated transcript back into D1 for permanent storage and vectorization.

## Tooling & Dependencies Decisions
*   **Authentication:** Anonymous auth + API key (Bearer token) on Worker endpoints.
*   **Session Storage:** Cloudflare D1 (SQLite at the edge).
*   **RAG / Vector Database:** Cloudflare Vectorize.
*   **Version Control:** `isomorphic-git` running client-side, hitting Cloudflare Worker Git remote.
*   **Multiplayer Collab:** Yjs over Cloudflare WebSockets (Durable Objects).
