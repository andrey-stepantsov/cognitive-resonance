# Git Import/Export Strategy

## Overview

This document discusses the strategy for importing and exporting git repositories to and from Cognitive Resonance.

What should we implement in the first version?

Use cases: 
1. Import a git repository from a filesystem.
2. Export changes back to the filesystem repository.

### The Local Repository Lifecycle

Since Cognitive Resonance is an event-sourced virtual file system, we do not need to mimic Git's internal object model natively. Instead, we can translate physical files into virtual events on import, and translate virtual events back into physical file modifications on export.

**Phase 1: Import (`cr import /path/to/repo`)**
1. The developer runs the CLI command targeting a local directory containing a Git repository.
2. The CLI daemon scans the physical directory tree, respecting `.gitignore`.
3. For every file, the CLI generates a `BASELINE_IMPORTED` or `ARTEFACT_PROPOSAL` event containing the raw physical file content.
4. These events are flushed to the local SQLite replica and synced to the Cloudflare Room. The workspace is now fully materialized in the CR session.

**Phase 2: Modification**
1. Agents and the developer collaborate within the CR session, generating sequence events like `ARTEFACT_PROPOSAL` (diffs), `FILE_DELETED`, etc.
2. These events strictly mutate the virtual state but *do not* touch the physical Git repository directory.

**Phase 3: Export / "Eject" (`cr export /path/to/repo`)**
1. The developer decides they are ready to commit the AI's work back to their real codebase.
2. They run `cr export` pointing to the original repository.
3. The CLI daemon runs the standard `Materializer` logic locally using the session's event history to compute the *final virtual file representations*.
4. The CLI compares the final virtual state against the physical directory contents.
5. **Optimization Rule**: The CLI *only* overwrites physical files if the virtual content differs from the physical content. Identical files are left untouched to preserve filesystem `mtime` (avoiding unnecessary rebuilds or IDE indexing). 
6. **Empty Directory Rule**: If the target directory is completely empty, the export behaves exactly like a traditional "clone", recursively creating all directories and materializing all files from the virtual state from scratch.
7. Finally, any files explicitly marked as deleted in the event stream (that still exist physically) are removed safely.
8. The developer can now use `git diff`, `git add`, and `git commit` using their standard physical Git workflow.

### Safety, Tracking, and Verification Assumptions

To implement Phase 1 and Phase 3 safely, we need to guarantee that user data is never accidentally mutated or destroyed.

**1. Repository-to-Session Linking (State Tracking)**
*   **Recommendation:** Do *not* pollute the user's repository with hidden folders like `.cr/workspace.json`. Instead, store mapping information globally within the CLI's existing SQLite database. Create a structured mapping of `absolute_directory_path` -> `active_session_id`. 
*   **Workflow:** When `cr import` runs, it asks or assigns a session and binds the path. When `cr export` runs in that path, it inherently knows which session to pull events from. 

**2. Deletion Safety (Untracked Files)**
*   **Recommendation:** The `cr export` module must never blindly delete physical files just because they are missing from the virtual state (e.g., local logs, `.env` files). 
*   **Workflow:** Deletions should only occur sequentially. If an explicit `FILE_DELETED` event or a 100% deletion `ARTEFACT_PROPOSAL` sequence was logged in the session history, the CLI explicitly unlinks the physical file. The virtual state engine only governs what *should* be there, making it perfectly safe for users to have massive untracked folders alongside a smaller CR session scope.

**3. Verification Strategy (Real Repositories)**
*   **Recommendation:** Leverage our existing `e2e` fixture payloads (`lifecycle-test-temp/bundle.json` based on the `octocat/Hello-World` git repository).
*   **Workflow:** The E2E tests should: 
    1. Unpack a real physical repository.
    2. Add a dummy `secret.txt` file (to simulate an untracked file).
    3. Run `cr import` to seed the session.
    4. Inject synthetic AI events modifying `README.md` and explicitly deleting another tracked file.
    5. Run `cr export`.
    6. Assert using `fs` that `README.md` evolved, the target file deleted, *and* `secret.txt` remains entirely untouched.

---

## Tutorial: Manual Real-World Repository Import & Export

This tutorial demonstrates how to verify the Cognitive Resonance `cr import` and `cr export` pipeline manually using a popular, real-world Node.js repository (`http-party/http-server`). This tests that the platform successfully serializes physical files into the virtual event graph, ignores dependencies appropriately, and materializes safely back to disk.

### Prerequisites
Make sure you have built the CLI locally:
```bash
npm run build --workspace=apps/cli
```

### Step 1: Provision
Create two isolated physical directories to serve as your testing bounds:
```bash
mkdir -p /tmp/cr-manual-test/source-repo
mkdir -p /tmp/cr-manual-test/export-repo
```

### Step 2: Acquire the Target
Clone the real repository into the source directory. We use `http-server` as it has a robust `.gitignore` and deterministic runtime:
```bash
cd /tmp/cr-manual-test/source-repo
git clone --depth 1 https://github.com/http-party/http-server.git .
```

### Step 3: Resonance Import
Import the physical tree into a localized Cognitive Resonance virtual session. The CLI uses `ignore` package semantics to skip the `.git/` history objects and any downloaded dependencies.
```bash
node /path/to/cognitive-resonance/apps/cli/dist/index.js import /tmp/cr-manual-test/source-repo -s manual-test-session
```
*Note: A SQLite database (`.cr/central.sqlite`) will automatically track that `/tmp/cr-manual-test/source-repo` belongs to `manual-test-session`.*

### Step 4: Resonance Export
Export the materialized session back to a completely blank secondary physical directory:
```bash
node /path/to/cognitive-resonance/apps/cli/dist/index.js export /tmp/cr-manual-test/export-repo -s manual-test-session
```
*At this point, the core files of `http-server` should have been synthesized from the virtual database back out to the physical `/export-repo` filesystem!*

### Step 5: Runtime Verification
Because the `cr import` skipped explicitly ignored patterns (like `node_modules`), we must install dependencies before executing the binary. This proves our `package.json` and internal code survived zero-corruption.

```bash
cd /tmp/cr-manual-test/export-repo
npm install --production
```

Boot the server:
```bash
node bin/http-server -p 18081
```

In a second terminal, verify it bounded successfully and serves HTTP correctly:
```bash
curl http://localhost:18081
```
*You should receive a `200 OK` response with the directory's index HTML payload, proving the codebase successfully transported across the virtual horizon intact!*