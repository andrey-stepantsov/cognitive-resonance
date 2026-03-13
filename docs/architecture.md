# Cognitive Resonance: System Architecture Roadmap

The envisioned product is a cross-platform AI development environment (VS Code, native iOS/Android, and PWA Web) where users chat with Gemini and collaborate asynchronously and synchronously on code artifacts. 

The chosen backend architecture is a **Hybrid Appwrite + Cloudflare Model**.
- **Appwrite** handles all Identity, OAuth routing, and static database storage (Chat History / Metadata).
- **Cloudflare (Workers, Vectorize, Durable Objects)** handles all execution, RAG embeddings, Git remote serving, and real-time multiplayer WebSockets.

## Proposed Phased Implementation

### Phase 1: Foundation (Identity, Chat, & Context)
Establish the underlying identity and AI memory systems so Gemini has persistent context across devices.
1. Integrate **Appwrite SDKs** across PWA, Capacitor, and VS Code for unified Google/Email authentication.
2. Store all chat sessions and raw prompts in an **Appwrite Database Collection**.
3. *Critical AI Step:* Build a **Cloudflare Worker pipeline** that automatically vectors all saved chats and snippets into **Cloudflare Vectorize**. This enables semantic search (RAG) so Gemini remembers previous conversations.

### Phase 2: Git-Backed Asynchronous Artifact Editing
Implement single-user (and async multi-user) artifact editing using Git as the backend engine. This completely avoids "last-write-wins" database overwrites and provides pristine diffs for the LLM.
1. Integrate **Monaco / ProseMirror** editors into the clients for editing Markdown and Code.
2. Embed **`isomorphic-git`** into the client apps (PWA, VS Code, Capacitor) to treat artifacts as local virtual repositories.
3. Deploy a **Cloudflare Worker** to act as the Git HTTPS Remote. It intercepts client `git push` commands, validates the user's Appwrite JWT in the headers, and unpacks the Git objects into **Appwrite Storage Buckets**.
4. Feed raw `git diff` outputs directly into the Gemini prompt for high-precision AI code edits.

### Phase 3: The Multiplayer Edge (Real-Time Voice & Sync)
Scale from asynchronous Git collaboration to live, sub-millisecond real-time presence, messaging, and voice.
1. Deploy **Cloudflare Durable Objects**. When a user connects to a project, they open a WebSocket to a strictly localized, high-performance edge room.
2. Stream live messaging and WebRTC voice payloads directly through the Durable Object, completely bypassing the Appwrite database for extreme speed.
3. When the live session ends, the Durable Object acts as a flush mechanism, saving the aggregated transcript back into Appwrite for permanent storage and vectorization.

## Tooling & Dependencies Decisions
*   **Authentication:** Appwrite (Vastly superior cross-platform UX for VS Code/Native vs Supabase).
*   **RAG / Vector Database:** Cloudflare Vectorize (Appwrite lacks native vector support, so this is outsourced to CF).
*   **Version Control:** `isomorphic-git` running client-side, hitting Cloudflare API bounds.
*   **Multiplayer Collab:** Yjs over Cloudflare WebSockets (Durable Objects).
