# Artefact Collaboration: Humans & AI

Cognitive Resonance establishes a unique dynamic where humans and artificial intelligence (Gems) act as co-designers. This is particularly evident in how **Artefacts** (documents, code, schemas, SVG renders) are created and evolved.

In an Event-Sourced architecture, it is critical to distinguish between the **Process** (Sessions of events) and the **State** (the materialized views or *Artefacts*).

## 1. Terminological Distinction

Before diving into collaboration, understand the three core structural pillars:

1. **Entity (The Lineage):** The abstract container or concept (e.g., "The Authentication Service" or "Main CSS"). It has a unique ID and points to the latest accepted version of itself.
2. **Artefact (The Snapshot):** A mathematically perfect, **immutable snapshot** of the Entity at a specific point in time. (`Artefact A1` is forever what it is).
3. **Draft vs. Promoted:** Temporary or unverified AI outputs are **Draft Artefacts**. When a human explicitly accepts a Draft, it becomes **Promoted**, and the Canonical Entity updates its pointer to this new Artefact ID.

## 2. The Genesis of an Artefact
Entities and their initial Artefacts can be created by either a human or an AI.

### Human Initiated (The Blank Canvas)
1. **Creation:** A user opens the UI and creates a new Entity called `system_architecture.md`.
2. **First Draft:** The user writes out a rough outline of their thoughts. 
3. **The Promotion:** When the human hits "Save," the system generates the first immutable `Artefact (A1)`. The Entity `system_architecture.md` now points to `A1` as its authoritative State.

### AI Initiated (The Zero-Shot Generation)
1. **Prompt:** A user types: `@SystemCoder, scaffold a React hook for managing WebSockets.`
2. **Generation:** The AI decides the response is too complex for a chat bubble. It inherently decides to output the code into a dedicated Entity.
3. **Delivery:** The UI presents the response as a **Draft Artefact**, allowing the user to review the code before accepting it into the permanent timeline.

## 3. Collaborative Evolution
Once an Entity has a baseline Artefact, the iteration cycle fluidly transitions between human intent and AI execution.

### The "Over-the-Shoulder" Edit (AI Modifies Human Work)
1. **The Context Window:** The human has `system_architecture.md` (currently pointing to `Artefact A1`) open in their Workspace. The AI implicitly "sees" this version in its context window.
2. **The Directive:** The human types: `@TechWriter, can you expand section 2 with more details on the D1 database schema?`
3. **The AI Generation:** The AI understands it needs to modify an existing Entity. It generates a new output block.
4. **The UI Representation:** The UI merges the AI's generation and presents it as **Draft Artefact A2**. The human reviews the changes and hits "Accept." The Canonical Entity resolves its pointer to the new, immutable `A2`.

### The "Manual Override" (Human Modifies AI Work)
1. **The Imperfect Generation:** The AI generates `Draft Artefact A3` representing `useWebSocket.ts`, but the human notices it used an outdated `useEffect` dependency array.
2. **Direct Manipulation:** Instead of typing out a prompt asking the AI to fix it (which wastes time/tokens), the human simply clicks into the Draft GUI, types the missing variable into the dependency array, and hits save.
3. **The State Update:** That manual fix is what gets Promoted. The final, immutable `Artefact A3` mathematically includes the human's manual correction.
4. **Re-Alignment:** The next time the human asks the AI a question, the AI reads the Promoted `A3`. It immediately recognizes the human's manual correction and inherently aligns its future logic to match.

## 4. Multiplayer Collisions & Git Resilience
In a multiplayer session or when branching timelines, the system utilizes Git conceptually to handle parallel State materialization.

1. **Parallel Timelines:** User A decides to start an independent Session (`S2`) specifically to refactor `auth.ts` (currently `Artefact A5`), bringing that Artefact into their contextual lens. Simultaneously, User B does the same in Session `S3`.
2. **Divergent Drafts:** User A and User B both work with the AI independently, generating their own **Draft Artefacts**.
3. **The Merge Protocol:** When User A promotes their Draft to `Artefact A6`, Entity `auth.ts` points to `A6`. If User B subsequently attempts to promote their Draft, the system detects a conflict.
4. **Conflict Resolution:** The Materializer subsystem natively handles these collisions by treating Artefact lineages as Git graphs. If User A's edits and User B's edits cleanly apply to different sections, the merge creates `Artefact A7` seamlessly. If they conflict, standard Git conflict markers (`<<<<<<< HEAD`) appear in a new Draft, and the users can resolve them collaboratively (or ask the AI to resolve its own merge conflict!).

## 5. End-to-End Example: Developing a Component
To solidify this concept, here is an example of developing a new software component (e.g., the `SyncDaemon`) from conception to completion.

### Phase 1: The Specification (Entity Genesis)
1. **The Request:** The user creates a new Workspace and starts a Session. They prompt: *"We need a background process to sync local SQLite events to Cloudflare D1. Create the technical specification."*
2. **Drafting the Spec:** The AI (`@TechWriter`) generates a detailed markdown document. 
3. **Promotion:** The user reviews it, makes a few manual tweaks to the retry logic, and hits **Accept**. 
   - *Backend Result:* Immutable `Artefact A1` is created. Canonical Entity `SyncDaemon_Spec.md` now points to `A1`.

### Phase 2: Implementation (Multiplayer Co-op)
1. **The Request:** User A invites User B to a live multiplayer session. User A pins `SyncDaemon_Spec.md` to their Workspace so the AI has context. They prompt: *"Based on the specification, implement the TypeScript class."*
2. **Drafting the Code:** The AI (`@SystemCoder`) analyzes `Artefact A1` and generates a new Entity: `SyncDaemon.ts` as a **Draft Artefact**.
3. **Iterative Refinement (Co-op):** Both users are reviewing the Draft live. 
   - User B notices the AI forgot to import the WebSocket library. Instead of asking the AI to fix it, User B clicks directly into the Draft GUI, types `import { WebSocket } from 'ws';`, and hits save.
   - User A simultaneously runs a quick local test and realizes the `reconnect()` method needs a longer timeout. They prompt the AI: *"Increase the reconnect timeout to 5000ms."*
   - The AI generates `Draft Artefact A2`, mathematically merging its timeout fix with User B's manual import fix.
4. **Promotion:** The team confirms the code works. User A hits **Accept**.
   - *Backend Result:* Immutable `Artefact A3` (the finalized code) is created. Canonical Entity `SyncDaemon.ts` points to `A3`.

### Phase 3: Documentation & Testing (Parallel Branching)
Because Entities are decoupled, the user can easily delegate testing and documentation.

1. **Parallel Timelines:** 
   - The user opens a new Session focusing purely on testing, bringing `SyncDaemon.ts` into context. They ask `@TDD_Bot` to generate `SyncDaemon.test.ts`.
   - Simultaneously, in another Session, User B asks `@DocGen` to parse `SyncDaemon.ts` and write `SyncDaemon_Usage.md`.
2. **The Final State:** Both Users accept their respective Agent's work.
   - The system now tracks three distinct, mature Entities: The implementation (`SyncDaemon.ts`), the tests (`SyncDaemon.test.ts`), and the documentation (`SyncDaemon_Usage.md`).

By treating each file as a discrete Canonical Entity, the Cognitive Resonance architecture ensures AI agents are never guessing where they are in the development lifecycle. They always read the exact, mathematically proven "Promoted" state of an Artefact before generating the next step.

## 6. The Artefact Interface (Viewer vs. Editor)

Because Cognitive Resonance integrates deeply with the user's local filesystem (via the CLI sync daemon), the web interface is not intended to be a heavyweight, feature-parity IDE (like Monaco or an embedded VS Code). External IDEs handle the heavy lifting of raw code authoring.

Instead, the web interface provides a high-performance **Artefact Viewer & Review Layer**. 

### Core Viewer Capabilities
1. **The Diff Viewer (For Drafts):** A side-by-side or inline Diff interface (similar to a Pull Request). This allows a user to safely review an AI's proposed **Draft**, make minor manual tweaks in a simple text area, and hit "Accept" to promote it, ensuring local files are never overwritten blindly.
2. **Read-Only Code Viewer:** A lightweight syntax-highlighted block (e.g., `prismjs` or `highlight.js`) to display the Promoted state of Code Entities.
3. **Rich Media & Documentation Viewers:**
   - **Markdown Renderer:** For specifications, documentation, and chat.
   - **Mermaid Diagrams:** Native rendering of `mermaid` syntax to visualize architectures, data flows, and state machines.
   - **Visual Assets:** SVG and Image rendering for generated graphics.
   - **Structured Data:** JSON/Schema tree viewers.

## Summary
In Cognitive Resonance:
- **Chat** is for alignment, debate, and intent.
- **Artefacts** are the materialized source of truth.
- **Git** is the invisible engine that seamlessly synchronizes the human mind with the generative agent.
