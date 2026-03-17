# Event-Sourced Architecture (Model 2)

## 1. Core Concept
We are shifting away from a rigid folder-based or Git repository-style file system towards an **Event-Sourced Architecture**. In this model, we decouple the *Process* of work from the *State* (the useful outputs).

*   **Events**: The ultimate source of truth. Every action, prompt, or code edit is an immutable event in a log.
*   **Sessions**: Append-only streams of Events. Sessions represent the continuous *Process* or journey. They do not have structural locations (like folders); they are simply the root identifiers of event streams.
*   **Artefacts**: The distilled, materialized views of a Session at a given point in time. When a Session yields something useful, an Artefact is generated as a snapshot. Artefacts represent the *State*.
*   **Workspaces**: Virtual containers, dashboards, or "lenses". Workspaces do not physically contain Sessions or Artefacts. Instead, they hold relation links (pointers or tags) to curate which Sessions and Artefacts are visible in a specific context.

## 2. UI / UX Implications
By stripping physical location out of the data model, the UI gains significant power and flexibility:
*   **Transclusion (Sharing across boundaries)**: An Artefact created in `Workspace A` can be referenced in `Workspace B` without copying files. The UI simply adds a pointer to the Artefact ID. If the original Artefact updates, the system can seamlessly propose those updates in all linked Workspaces.
*   **Spatial Canvas / Views**: Workspaces can present their curated lists as a desktop, a Kanban board, or an infinite spatial canvas, treating Artefacts and Sessions as blocks or nodes.
*   **Lightweight Branching**: Branching or forking a Session is inherently native. It simply starts a new Event stream that points to an older Event ID as its chronological parent.

## 3. Backend Implementation
To support this, the backend will be completely rebuilt to treat the event log as a first-class citizen. 

*   **Events**: `id`, `session_id`, `timestamp`, `actor` (USER | SYSTEM | BOT), `type`, `payload`, `previous_event_id`.
*   **Sessions**: `id`, `owner_id`, `head_event_id`.
*   **Artefacts**: `id`, `source_session_id`, `source_event_id`, `type`, `content`, `version`.
*   **Workspaces**: Junction tables (e.g., `workspace_items`) linking Workspaces to Artefact and Session IDs.

*(Implementation Note: In a Cloudflare architecture, Durable Objects will manage the live connections of active Sessions to strictly serialize events in-memory, flushing them down to a distributed data store like Cloudflare D1).*

## 4. Test-Driven Development (TDD) & CLI Tooling
A major priority of this architectural shift is building a CLI designed from the ground up for deep introspection, debugging, and advanced TDD patterns.

*   **Absolute Observability**: The CLI can stream and tail events live from any Session, inspect the raw relational graph, and dump Workspace contextual pointers.
*   **"Faking" Actors (Bots)**: Because every Event has an explicit `actor` field, the architecture natively supports the injection of simulated actors:
    *   **Mock Users**: A bot can dispatch structured "User" events (e.g., simulating a user making an edit or submitting a prompt).
    *   **Mock AIs**: A test stub can instantly dispatch simulated "AI" responses (e.g., streaming code diffs) to bypass expensive LLM calls during rapid iterations.
*   **Automated Scenario Testing**: E2E integration tests can be expressed as headless, deterministic sequences. A test script can spin up a Sandbox Workspace, inject a trace of Bot User events, inject corresponding Bot AI events, and finally assert that the newly materialized Artefact exactly matches the expected output graph—all run entirely from the CLI.

## 5. Lifecycle of an Artefact & Human Helper Concepts
"Just tagging" is insufficient for humans because it lacks the concept of *time* and *identity*. If 50 artifacts are tagged `#auth-service`, a human needs to know which one is the "current" one. To solve this, we introduce the concept of **Lineage (or Canonical Entities)** and **Draft vs. Published** states.

### The Problem: Snapshots vs. Continuity
In pure Event Sourcing, an Artefact is an immutable snapshot (`Artefact_ID: 123` is forever exactly what it was when created). But to a human, "The Auth Service Code" is a living, breathing entity that evolves over time. 

### Helper Concepts
1.  **The Canonical Entity (Lineage)**: A UUID that represents the *concept* of the artefact (e.g., "The Auth Service"). The Entity maintains a pointer to the *latest accepted Artefact ID*.
2.  **Draft vs. Promoted**: 
    *   When an AI modifies code in a Session, it generates a **Draft Artefact**. 
    *   When a human reviews and accepts the change, the Draft is **Promoted**. The Canonical Entity's pointer is updated to this new Artefact ID.

### The Lifecycle Map
1.  **Genesis**: User 1 writes a prompt in Workspace W1 -> Session S1. The AI generates a good script. User 1 hits "Save/Promote". 
    *   Backend creates immutable `Artefact (ID: A1)`.
    *   Backend creates `Entity (ID: E1, Name: "Sync Script", Latest_Artefact: A1)`.
    *   Workspace W1 adds a pointer to `Entity E1`.
2.  **Observation**: User 2 opens Workspace W2. They search for "Sync Script" and pin `Entity E1` to their workspace. The UI resolves `E1` and renders `Artefact A1`.
3.  **New Evolution (Forking into Process)**: User 2 wants to add a feature to the script. They cannot edit `A1` (it's immutable). Instead, they start a *new* Session (`S2`) within their Workspace, injecting `A1` as the starting context.
    *   Session `S2` is an event stream of User 2 iterating with the AI on the script.
    *   The AI generates multiple intermediate outputs (**Draft Artefacts**).
4.  **Resolution**: User 2 is happy with the changes. They hit "Publish" on their final draft.
    *   Backend creates immutable `Artefact (ID: A2)`.
    *   The `Entity E1` pointer is updated: `Latest_Artefact: A2` (and `Previous: A1` for history).
    *   Instantly, User 1 (over in Workspace W1) sees a notification or visual indicator that `Entity E1` has a new version available.

By wrapping immutable **Artefacts** inside a mutable **Entity Lineage**, humans get the continuity they expect (e.g., clicking on a file to edit it), while the backend retains the perfect audit trail and time-travel capabilities of Event Sourcing.

## 6. Composition: Developing an Application (Hierarchies of Entities)
In software development, artefacts do not exist in isolation. A Function belongs to a Module, a Module to an Application, and an Application to a Build. 

In this architecture, we model this through **Composite Entities** (or Dependency Graphs). An Entity's underlying Artefact doesn't just have to contain raw text/code; it can contain *pointers to other Entities*.

### The Composition Model
1.  **Atomic Artefacts (The Leaves)**: These contain raw values. 
    *   Entity: `AuthUtils.ts` -> Artefact: `[String: "function hash(pw) { ... }"]`
2.  **Composite Artefacts (The Branches/Roots)**: These contain structural definitions (schemas, manifests, or package.json equivalents) indicating how other entities plug together.
    *   Entity: `Backend Module` -> Artefact: `[List of Pointers: Entity(AuthUtils.ts), Entity(DB.ts)]`
    *   Entity: `App V1` -> Artefact: `[List of Pointers: Entity(Backend Module), Entity(Frontend Module)]`

### Example: Developing an Application
How does a team actually build an application from scratch in this model?

1.  **The Bootstrapping Session**: A user creates a Workspace (`Alpha Project`) and starts a Session to lay out the architecture. They tell the AI: *"Create the schema for a new web app with a React frontend and Hono backend."*
2.  **The Root Entity Creation**: The AI outputs a JSON/YAML blueprint. The user accepts it.
    *   Backend creates **Entity: `Alpha Release`**. 
    *   Its Artefact contains an empty scaffolding: pointers indicating it expects a `Frontend` entity and a `Backend` entity.
3.  **Parallel Sessions (Delegation)**: Because entities are decoupled from workspaces, the work can be perfectly parallelized.
    *   User A creates Workspace `Frontend Dev` and pins the empty `Frontend` entity. They start a Session to write React components. Each component becomes its own atomic Entity.
    *   User B creates Workspace `Backend Dev` and pins the `Backend` entity. They start a Session writing routes.
4.  **The Build Artefact (Transitive Resolution)**: 
    *   When User A publishes their React components, the `Frontend` entity updates its pointer to the latest Artefact.
    *   When the system (or a CI Bot) needs to evaluate the whole application, it simply resolves the graph from the root: `Alpha Release` -> `Frontend` -> `React Components`. 
    *   The "Build Artefact" is simply a computed, fully-resolved projection of the entire tree of Entity pointers at that exact millisecond. It can be compiled to a binary or deployed.

### Why this is powerful for AI
When an AI agent is working on `AuthUtils.ts`, you do not need to feed it the entire repository as context. You simply pass it the Composite Entity it belongs to (`Backend Module`). If the AI changes the signature of `hash()`, the backend can automatically flag to the human: *"Warning: The `UserRouter` entity depends on `AuthUtils`; do you want to start a Session to update it?"* 
Because the dependencies are explicit semantic links in the database (rather than implicit string imports in a flat filesystem), the system mathematically understands the blast radius of any change.
