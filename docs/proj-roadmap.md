# Cognitive Resonance: Implementation Roadmap
*(Backend & CLI → PWA Transition)*

This document outlines the structured, phased approach to completing the Cognitive Resonance architecture. It moves sequentially from the lowest levels of local data persistence, up through the local CLI syncing engine, and finally culminates in the visual presentation layer (the PWA).

---

## Phase 12: The Local Engine (Event & Artefact Foundations)
Before the UI can act on events, the `@cr/core` package must natively support the Event-Sourced architecture. Currently, it relies on mock JSON blobs.

**1. Re-architect Local Storage Provider (`packages/core/src/providers/LocalNodeStorageProvider.ts`)**
- Rip out the logic that parses arbitrary `PWA_SNAPSHOT` blobs.
- Implement true Event aggregation: The provider must rebuild session state by sequentially applying a stream of atomic events (e.g., `CHAT_MESSAGE`, `ARTEFACT_PROPOSED`, `ARTEFACT_PROMOTED`).
- Implement the Session Forking logic: Given a `sessionId` and an `eventId`, generate a new `sessionId` and duplicate the event array up to that point.

**2. The Artefact/Git Manager (`packages/core/src/ArtefactManager.ts`)**
- Create a dedicated class wrapping the local Event Log.
- Implement automated Git commits for AI-generated Drafts and Human Promotions.
- Expose methods to generate simple patch/diff payloads for the PWA to consume.

---

## Phase 13: The CLI Sync Daemon (`apps/cli/src/commands/serve.ts`)
The local daemon must act as the bridge between the user's local filesystem (their external IDE) and the Cloudflare Edge.

**1. Filesystem Watcher Integration**
- Integrate `chokidar` (or native `fs.watch`) into the `serve.ts` daemon.
- When a user modifies an active Artefact file via VS Code/Neovim, the daemon must intercept the `change` event, invoke the `ArtefactManager` to commit it locally, and append a `MANUAL_OVERRIDE` event to the local database.

**2. Robust Edge Synchronization**
- Ensure the `syncDaemon` (push/pull loop) correctly transmits the granular Event array rather than monolithic payloads.
- Implement conflict resolution triggers: If a pull from the Edge results in a Git merge conflict on an Artefact, generate a `MERGE_CONFLICT` event to halt automated sync and alert the user.

---

## Phase 14: The PWA Pre-requisites (Stripping Appwrite)
The frontend currently contains legacy concepts that contradict the Local-First topology.

**1. Auth Refactor (`apps/pwa`)**
- Completely rip out the Email/Password and OAuth flows from `AuthScreen.tsx`.
- Implement a simplified Auth flow that strictly mirrors the CLI: The user either provides an API Key (for direct Cloud access) or connects to their local `localhost:3000` daemon (requiring no heavy auth).

**2. Component Cleanup**
- Remove any remaining `appwrite` SDK dependencies from `package.json`.
- Refactor the session-loading hooks to rely entirely on the refactored `@cr/core` Event aggregation rather than fetching monolithic blobs.

---

## Phase 15: CLI Completeness & Multi-Agent Routing
Before any UI work begins, the underlying CLI and core execution engine must support targeted routing, autonomous agent hand-offs, and runtime verification of generated code.

**1. The `@` Mention DSL Parsing & Routing (`@cr/core`)**
- Implement core parsing to detect intended recipients (e.g., `@Architect`, `@Coder`) from chat messages.
- Route context explicitly to distinct AI "Gems" equipped with their own system prompts.

**2. Multi-Agent Ecosystem (Gems)**
- Instantiate `Architect` (focuses on planning and delegating), `Coder` (focuses on execution), and `Auditor/Critic` profiles.
- Enable automatic handoffs so an Architect's response containing `@Coder` automatically triggers the Coder's execution.

**3. Trinity: Autonomous Choreography**
- Goal: Launch a "trinity" of Actors (`@Architect`, `@Coder`, and `@Auditor`/`@Critic`) to work autonomously on a given task.
- *Example Task:* Create a video recorder that takes an audio file (WAV) and one picture (PNG/JPEG) and produces a video with the static image. Should be based on FFmpeg. The goal is to create recordings optimized for YouTube uploads and match YouTube's audio profile accurately to avoid re-processing.

**4. Simple Runtime Capabilities (`/exec`)**
- Add an `/exec [cmd]` slash command strictly for human developers (Scientist).
- Spawn a `child_process` bound to the active Graph-Native Workspace, capturing `stdout/stderr` to securely verify task completion.

---

## Phase 16: The PWA Visual Architecture
With the backend solid and the legacy code gone, we build the core UX described in the design documents.

**1. The Artefact Interface (Diff Viewer & Rich Media)**
- Build the `DraftViewer` component: A side-by-side or inline diff renderer so users can review the AI's proposed code before hitting "Accept" (Promotion).
- Implement the Markdown/Mermaid Native Viewer for Promoted Artefacts.

**2. The Shared Multiplayer Canvas**
- Integrate the presence cursors and live typing indicators bound to the Cloudflare Durable Object WebSockets.
- Implement the "Cocktail Party" UI: Visually distinguish between human peer messages and the silent AI observer.

**3. The `@` Mention DSL**
- Build the interactive `<select>` dropdown in the chat input area.
- When `@` is typed, query the Active Peers list and the Available Gems list, allowing the human to explicitly route their next message to an AI agent or a specific human.

---

## Phase 17: Final MVP Verification Demo & E2E Testing
To prove the architecture is sound before committing fully to the React UI, we will build a headless MVP Verification Demo.

**1. The Component Genesis Test**
- Construct a deterministic CLI test script (`tests/e2e/component_genesis.test.ts`).
- The script spins up a local sandbox and programmatically creates a new Session.
- The script dispatches mock events simulating a user asking an AI to scaffold a software component (e.g., an `Express` router).
- The test verifies that the `ArtefactManager` successfully creates a local Git repository, commits the AI's generation as `Draft A1`, and cleanly promotes it to the `HEAD` of the repository.

**2. The Asynchronous Fork & Sync Test**
- The script spins up a *second* mocked sandbox (User B) and connects it to the Cloudflare Edge.
- User B forks the original Session and manually edits the `Express` router file on disk.
- The `syncDaemon` intercepts the FS change, pushes it to the Edge, and pulls it down to User A.
- The test asserts that the immutable Event Log is identical in both databases and that the `Materializer` correctly resolved the branch merge.

**3. The Live Multiplayer Co-Op Test**
- Both User A and User B connect to the *same* Session simultaneously via the WebSocket mock.
- User A prompts the AI to generate a new software component.
- The AI streams the code to both users as `Draft A1`. 
- Concurrently, User B intercepts the Draft before Promotion, typing a manual fix (e.g., adding an imported library).
- The test evaluates that the resulting `Artefact A2` successfully merged both the AI generation and User B's live edit into a single cohesive commit upon Promotion.

---

## Future Considerations (Post MVP)

### The Guide Persona (User Onboarding & Support)
Once the Telegram and Multi-Agent foundations are complete, we will implement a dedicated `@Guide` persona to reduce the learning curve of the Cognitive Resonance CLI, PWA, and Edge architectures.
- **RAG via Cloudflare Vectorize:** The Guide will use embeddings of the `docs/` directory to answer architectural and operational questions accurately.
- **Proactive Onboarding:** Hook into the `SESSION_STARTED` event to automatically inject a greeting and tutorial message from `@Guide` into new databases.
- **Artefact Proposals:** The Guide will possess the ability to output environment configuration diffs via the VFS to actively assist users in setting up their `.env` files and aliases.
