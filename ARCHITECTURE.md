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
- **`packages/backend`**: Integration with AppWrite (Authentication) and CloudFlare (Storage) to maintain and sync user state across all platforms.

## Current State
The `legacy/` directory is populated. The `package.json` at the root is initialized with `apps/*` and `packages/*` as workspaces.

## Next Steps for the AI
1. Read the `task.md` left by the previous session in your artifacts to see what is checked off. Scaffold the new directories under `apps/` and `packages/`.
2. Initialize `apps/pwa` using Vite and scaffold `apps/extension`.
3. Scaffold the `packages/` structure and configure the sub-package `package.json`s so the apps can import `@cr/ui`, `@cr/core`, and `@cr/backend`.
