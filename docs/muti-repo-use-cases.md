# Multi-Repo Materialization: Use Cases

To rigorously validate the **Event-Sourced Materialization Engine**, we must project the architecture onto complex, multi-repository topologies. Passing these use cases proves the architecture's maturity for production environments crossing physical project boundaries.

## The Optimal Stress Test: Strict Dependency (Core Lib + Service)

While testing different languages (e.g., Python Backend + React Frontend) validates environment orchestration (e.g., running `pipd` alongside `npm`), the ultimate stress test is **Cross-Project Dependency Synchronization**. 

### Scenario: The Monorepo/Multi-repo Linking Challenge
1. **Repo A (Core Types/SDK)**: A strict TypeScript utility library that publishes interface models.
2. **Repo B (API Consumer Service)**: A separate TypeScript microservice that explicitly imports Repo A locally via an NPM workspace or `npm link`.

### Why this stresses the architecture:
- **Simultaneous Materialization**: If the AI decides to add a new `UserAge` field to Repo A, and immediately uses it in Repo B in the *exact same turn*, the Materializer must atomically compute and physically persist the file changes for *both* repositories before Repo B tries to invoke the TypeScript compiler.
- **Topological Bootstrapping**: The Materializer must execute compilation logic functionally: it realizes Repo A (`npm run build`), links it natively within the staging virtual workspace (`npm link`), and then invokes the execution context on Repo B—all completely detached from the user's actual `main` repositories.

### The Agent Workflow (How it looks)
1. **Event Generation**: The AI generates a massive multi-repo `ARTEFACT_PROPOSAL` patch covering files in both `Repo A` and `Repo B`. This is written seamlessly into the SQLite Event Log as raw text/diffs.
2. **Materialization Call**: The user asks to run integration tests (`/exec npm run test:integration`).
3. **The Materializer Engine**:
   - Replays the event stream and extracts the latest file state for Repo A.
   - Replays the event stream and extracts the latest file state for Repo B.
   - Creates a hidden temporary sandbox: `.cr/materialized/session-123/workspace/`.
   - Projects Repo A into `workspace/repo-a/` and Repo B into `workspace/repo-b/`.
   - Executes the linkage graph (`cd workspace/repo-a && npm i && npm link` -> `cd workspace/repo-b && npm link repo-a`).
4. **Execution**: The isolated tests execute against purely functional, thrown-away infrastructure. The user's actual source code directories remain perfectly untouched.

## Alternative Scenarios

### 1. Cross-Language Services (Python Worker + TS API)
- **Focus**: Process multiplicity.
- **Challenge**: The Materializer must project a Python virtual environment (`venv`) alongside a Node environment within the materialization sandbox. The AI writes to `worker.py` and `app.ts` simultaneously. 

### 2. Multi-Agent Segregation (Frontend Agent vs Backend Agent)
- **Focus**: Concurrent Event Contention.
- **Challenge**: Two distinct AI actors outputting drafts simultaneously into the event stream targeting different repositories. The Materializer must gracefully merge the temporal event stream into a coherent full-system projection anytime a human developer invokes a build command.

### 3. The Distributed Sandbox: Asynchronous Multiplayer Delegation
Since Cognitive Resonance fundamentally operates as an Event-Sourced multiplayer architecture (synchronized via Cloudflare D1 and Durable Objects), we are not restricted to running physical execution environments on the same device where the UI is rendered. We can treat physical Materialization Sandboxes (daemons running `cr serve`) as participating **Agents** or **Peers** in the multiplayer room.

**Scenario: Mobile Delegation & Distributed Execution**
1. **The Mobile Commander (PWA/Android)**: A user opens the PWA on their Android phone while commuting. They command an AI to generate a complex multi-repo feature (e.g., adding an API route to a Node.js backend and modifying a Python worker).
2. **The Cloud Broker**: The Android app instantly pushes the newly generated code diffs as `ARTEFACT_PROPOSAL` events into the Cloudflare D1 Event Log.
3. **The Distributed Executors (`cr serve`)**: The developer has left their MacBook at home and a dedicated CI Linux server running the `cr serve` local daemon. Both daemons are connected to the exact same Cloudflare Session ID.
4. **Targeted Materialization**: The user explicitly tags an executor in the chat (e.g., `@MacBook /exec npm run test` and `@LinuxNode /exec python worker.py`).
5. **The Event Pipeline**:
   - The Cloudflare Durable Object broadcasts the `EXECUTION_REQUESTED` event.
   - The `@MacBook` and `@LinuxNode` daemons recognize their respective calls.
   - They each instantly spin up their local `Materializer`, linking the workspaces and running the processes in perfectly native, physical execution environments.
   - The daemons capture `stdout/stderr` execution logs and emit them back to Cloudflare as `SYSTEM_LOG` events.
6. **The Result**: The user sitting on the train watches their lightweight Android UI seamlessly stream live terminal outputs originating from physical machines miles away.

**Why this is a paradigm shift:**
- **Zero Browser WebAssembly Overhead:** We entirely bypass the severe limitations, memory limits, and CORS/COOP problems of trying to force mobile browsers to execute Node.js or Python via WebContainers.
- **Concurrent Distributed Builds:** A single user can trigger a multi-repo compilation where Repo A (a rust binary) builds instantly on a Linux peer, and Repo B (an iOS app) builds concurrently on a macOS peer.
- **Hermetic Execution without Cloud VMs:** We gain the identical isolation features of high-end cloud Docker environments (like CodeSandbox or E2B) without paying for ephemeral cloud infrastructure, simply by leveraging the idle compute of our own distributed devices acting as peers.
