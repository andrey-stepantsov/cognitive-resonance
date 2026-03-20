# Architecture: Graph-Native Navigation & Current Semantic Focus (CSF)

## Overview
As Cognitive Resonance evolves to manage multi-repository, cloud-native deployments (e.g., executing Python workers alongside Node.js frontends in the same session), relying on standard POSIX filesystem metaphors (`cd`, `ls`, `cat`) becomes an architectural bottleneck. 

Our core pipeline is built on an **Event-Sourced Materialization Engine**. This engine ingests arbitrary entities (files, database rows, UI components, serverless functions) as `ARTEFACT_PROPOSAL` events. By forcing a POSIX 1-dimensional hierarchy onto the `VirtualState` REPL, we limit the human and AI from intuitively navigating rich, multi-dimensional relational graphs.

This document formalizes the pivot towards a **Graph-Native REPL**, powered by **Current Semantic Focus (CSF)**.

---

## 1. The Bridge: Paths are just Hierarchical Markers
To decouple our interface from the physical disk without breaking human intuition, we treat physical filepaths as **Semantic Markers**.

In our data model, a `Marker` is simply semantic metadata attached to a node.
A physical filepath (e.g., `src/utils/math.ts`) is functionally identical to a highly-structured semantic tag: `#path:src/utils/math.ts`.

When a physical repository is imported:
1. The `Materializer` assigns standard `#file` markers to each node.
2. It assigns intrinsic `#path:*` markers based on their structural locations.
3. It assigns a `#workspace:<repo_name>` mount marker (crucial for multi-repo disambiguation).

By treating hierarchical directories purely as graph markers, we bridge the gap. You can still query hierarchies, but the underlying query engine is purely graph-native.

---

## 2. Upgrading `cd` to `/focus`
We replace the concept of a "Current Working Directory (CWD)" with **"Current Semantic Focus (CSF)"**.

A conventional CWD requires you to traverse a rigid tree. A CSF is a dynamically applied *lens* over the entire graph workspace.

* **Conceptual Example:**
  * `/focus #auth-logic` semantically scopes the workspace to authentication artefacts, regardless of what physical files or database tables hold them.
  * `/focus src/utils/` is simply syntactic sugar for `/focus #path:src/utils/*`. The system gracefully translates human "path" intuition into a graph query constraint.
  * Intersection: `/focus src/utils/ + #failing-tests`.

---

## 3. Preserving Verbs via Syntactic Context (`ls`, `tree`, `cat`)
Because "paths" are simply a subset of "markers", we do **not** need to deprecate ergonomic, human-friendly tools like `ls` and `tree`. Instead, they are reimagined as context-aware graph visualizers:

* **`/ls [dir]`**: Syntactic sugar for "query all artefacts matching my active CSF constraint and visually group them."
* **`/graph ls [tag]`**: A more explicit query bypassing the POSIX aesthetic to list nodes by raw markers.
* **`/inspect <id>`** (replaces `/cat`): Dumps the structured payload of a node. If it's a file, it prints text. If it's an API payload, it prints JSON.
* **`/context add <id>`** (replaces `/read`): Pins the node cleanly into the AI's cognitive window for the next conversational turn.

---

## 4. Multi-Workspace Isolation
In a multi-repository scenario, physical paths collide (e.g. `frontend/package.json` vs `backend/package.json`). CSF effortlessly solves this.

### Prompt Indicators
The REPL dynamically reflects your active CSF to clearly indicate your scope boundary. 
Instead of a sterile `cr>`, the prompt mutates natively:
```bash
cr [frontend] {#components}> 
```
This guarantees the user always understands exactly which filetree subset they are exploring.

### CSF Management Console
To prevent users getting lost in massive graph scopes, CSF states can be persisted and recalled:
* **`/focus ls`**: Lists available, pre-defined workspaces (e.g. `frontend`, `backend`) and custom saved focuses.
* **`/focus save <name>`**: Snapshots your current intersection of tags (e.g. `/focus save microservice-auth` caches your current graph lens).
* **`/focus use <name>`**: Instantly swaps your context boundary to a saved state.

When you `/focus use backend`, any subsequent `/ls` or `/read src/index.ts` command is absolutely guaranteed to route specifically to the `backend` workspace graph, eliminating ambiguity definitively.
