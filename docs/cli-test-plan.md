# Cognitive Resonance CLI: Hands-On Test Plan

This test plan guides you through a progressive, hands-on exploration of the `cr` CLI's capabilities. It starts with generic AI interaction and builds up to distributed, multi-node edge orchestration.

## Prerequisites
Open two separate terminal windows. You will need both for the Distributed Sandbox tests.
**CRITICAL:** Both terminal windows *must* be opened in the exact same Graph-Native Workspace (we highly recommend running this from the root of the `cognitive-resonance` repository so that the CLI can automatically access your `.env` file credentials for the AI and Cloudflare Edge requests).

Instead of relying on a global installation, we will execute the CLI directly from source using `tsx` (which is blazing fast for TypeScript execution). Every command below will start with `npx tsx apps/cli/src/index.ts`.

---

### Phase 1: Identity & The AI REPL
*Goal: Understand basic session management, logging in, and model switching.*

1. **Boot the CLI REPL:**
   ```bash
   npx tsx apps/cli/src/index.ts chat
   ```
2. **Authentication:** 
   * Type `/login admin@example.com` (using any test credentials).
   * Observe the dynamic morphing of the prompt to show your semantic identity.
3. **Session Management:**
   * Type `/session`. You should see a list of active sessions (likely just `clear`).
   * Type `/new test-drive`. The system will automatically switch your context to the new `test-drive` session.
4. **Model Interaction:**
   * Type `/model ls` to see the curated list of available Gemini models.
   * Type `/model gemini-2.5-flash`.
   * Ask the AI a simple question: "What is the capital of France?" Ensure it streams the response.

---

### Phase 2: The Materializer & Repository Import
*Goal: Bring external code into the event stream.*

1. **Exit the REPL** by typing `/exit`.
2. **Import a local repository:**
   Create a temporary workspace boundary, or use an existing tiny project.
   ```bash
   git clone https://github.com/octocat/Hello-World.git /tmp/hello-world
   npx tsx apps/cli/src/index.ts import /tmp/hello-world -s import-session
   ```
   * *What happens:* The CLI clones the repo, parses the files, and uses the `Materializer` to convert the entire repository state into a sequence of `ARTEFACT_PROMOTED` events in the SQLite database.
3. **Re-enter the REPL:**
   ```bash
   npx tsx apps/cli/src/index.ts chat -s import-session
   ```
   Ask the AI: "Explain the files in this repository." It should have full context from the import.

---

### Phase 2.5: Semantic Focus Workspace
*Goal: Navigate the Virtual Filesystem using Semantic Focus boundaries.*

1. **Navigate the bounded Virtual Graph:**
   * Ensure you are in the REPL from Phase 2.
   * Type `/session ls` to confirm your active session.
2. **Set a Semantic Focus:**
   * Type `/focus src` (or the name of a folder in the imported repo). Notice the prompt changes to reflect the `#path:src` boundary.
3. **Visualize the Graph:**
   * Type `/ls`. You should only see contents within the semantic boundary.
   * Type `/tree`. The projected tree is strictly restricted to your focus.
   * Type `/cat ` and press `<tab>` to verify that tab-completion only suggests files within the bounded focus.
4. **Clear Focus:**
   * Type `/focus clear` to return to the global workspace view.

---

### Phase 3: The Time Machine (Observability & Forking)
*Goal: Visualize the event DAG and demonstrate immutable state forking.*

1. **Observe the Event Stream:**
   Open your second terminal window and run:
   ```bash
   npx tsx apps/cli/src/index.ts logs fresh-import-session
   ```
   This boots the live observation stream. You will see real-time logs and outputs from the event-driven architecture streaming directly to your terminal.
2. **Cloning Reality:**
   Back in your first terminal (inside the REPL), type:
   ```bash
   /clone
   ```
   * *What happens:* The system creates a new session pointing to the exact same parent `event_id` as your current state, seamlessly duplicating the universe without duplicating files.

---

### Phase 4: Distributed Sandbox Execution
*Goal: Run code securely through the local daemon using Lisp DSL.*

1. **Boot the Orchestration Daemon:**
   In your second terminal (close the observer via `Ctrl+C`), run:
   ```bash
   npx tsx apps/cli/src/index.ts serve --identity TestNode
   ```
   The daemon is now aggressively polling the database and waiting for commands targeted at `TestNode`.
2. **Trigger Remote Execution:**
   In your first terminal (REPL), simulate an AI deciding to run a terminal command on that specific node using the DSL:
   ```lisp
   @@TestNode(exec "ls -la")
   ```
   * *What happens:* The REPL saves an `EXECUTION_REQUESTED` event. The `serve` daemon intercepts it, materializes the sandbox bounds, runs `ls -la` inside a native shell, and pipes the `RUNTIME_OUTPUT` event right back to your REPL screen.

---

### Phase 5: The Cloudflare Edge Dispatch
*Goal: Programmatically deploy a sub-worker directly to the Cloudflare Edge.*

1. Be sure the `cr serve` daemon is still running in the second terminal.
2. **Deploy to the Edge:**
   In your REPL, type:
   ```lisp
   @@CloudflareEdge(deploy "my-test-worker")
   ```
   * *What happens:* The daemon intercepts the `CloudflareEdge` intent. It generates the `SubWorkerTemplate`, executes `wrangler deploy` under the hood using your `.env` credentials, and returns the live `https://my-test-worker...` URL to the REPL.
3. **Teardown the Edge:**
   ```lisp
   @@CloudflareEdge(teardown "my-test-worker")
   ```
   * *What happens:* The daemon fires a Cloudflare API `DELETE` request to clean up the worker, leaving no trace behind.

---

### Phase 6: The Ejection Seat (Export)
*Goal: Convert the pure event-stream back into standard flat files.*

1. **Exit the REPL** (`/exit`).
2. **Export the Session:**
   ```bash
   # Replace the UUID with the cloned session ID you got in Phase 3
   npx tsx apps/cli/src/index.ts export ./exported-repo -s <cloned-session-id>
   ```
   * *What happens:* The CLI reads the event stream from your SQLite database, reconstructs the file system DAG up to the tip of `branch-b`, and writes raw files to `./exported-repo`. 
3. Verify the files exist and match the state of your AI's codebase.

---

### Phase 7: Observability and Health
*Goal: Use the diagnostic and health commands to monitor the local daemon and project.*

1. **Check Daemon Status:**
   Run the following command at any time to verify your `cr serve` instance is operational:
   ```bash
   npx tsx apps/cli/src/index.ts status
   ```
2. **Snapshot Audit:**
   Execute an audit to extract localized metrics and environment assertions:
   ```bash
   npx tsx apps/cli/src/index.ts audit
   ```
   * *What happens:* The CLI inspects the active sandbox context and generates a diagnostic report, validating connections without modifying the active workspace state.
