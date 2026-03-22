# Terminal Integration Strategy

## Overview

This document tracks the discussion and architectural decisions regarding adding terminal/shell integration to Cognitive Resonance.

## Design Recommendation: "The Multiplayer PTY"

I strongly recommend approaching this as **Both (Backend first, Frontend second)**, but through a unified Event-Sourced architecture. 

Currently, `EXECUTION_REQUESTED` triggers `child_process.exec()`. This is ephemeral: `cd` commands don't stick, environment variables reset, interactive prompts fail, and long-running servers hang the thread.

### The Architecture

**1. The Host Daemon (Backend)**
*   Integrate a library like `node-pty` into the `SyncDaemon`. 
*   When a session boots up on a host, the daemon spawns a dedicated, stateful pseudo-terminal (`bash` or `zsh`).
*   Instead of closing after one command, the process stays alive. Using a new event like `TERMINAL_INPUT`, the Cloudflare Room can pipe raw strings (or stdin buffers) into this PTY.
*   The daemon buffers the PTY's `stdout`/`stderr` and periodically emits `TERMINAL_OUTPUT` events to the cloud.

**2. The Shared Experience (Frontend / AI)**
*   Because the terminal stream is entirely event-sourced (`TERMINAL_OUTPUT` events), *anyone* authorized in the session can read it.
*   **The AI Agent:** can interpret the output stream, issue interactive commands (like typing "y" to a prompt), and maintain ongoing context of a server crash.
*   **The User UI:** can map an `xterm.js` component directly to the event stream. This creates a "multiplayer terminal" where you and the AI can both type into and view the exact same live terminal session in real-time.

### V1 Implementation Plan

1. **Add `node-pty` to `@cr/cli`:** Refactor the `SyncDaemon` execution engine. Instead of `exec()`, spawn a `pty.spawn()` tied to the `session_id`.
2. **New Event Types:** Expand `IEvents.ts` with `TERMINAL_INPUT` and `TERMINAL_OUTPUT`.
3. **Agent Awareness (MCP Integration):** Update the `@cr/core` `MCPServer` loop by creating natively registered `send_terminal_input` and `read_terminal_output` MCP tools. This decouples the AI logic from the `SyncDaemon` host entirely, relying on the Multiplayer event stream.
4. **(Optional Follow-up):** Wire up an `xterm.js` component in the React UI so users get a visual "agent terminal" widget.

## Architectural Decisions

### Git API vs Terminal Commands
**Decision:** Rely strictly on raw terminal commands and local generic FileSystem (`fs`) operations.
Now that AI agents possess an interactive stateful shell (`node-pty`), they can operate Git natively (`git add . && git commit`) without complex Git abstractions. For our specialized `cr import` and `cr export` commands, we use standard Node `fs` (alongside the `ignore` npm package) to generate and parse raw files without requiring heavy isomorphic git abstractions locally.

### Comprehensive E2E Testing Strategy
Testing persistent pseudo-terminals across multiplayer topologies requires deterministic mocks because OS PTY rendering behaves differently across Mac vs CI Linux.

**E2E Scenario: PTY Multiplayer Streams (`apps/cli/tests/e2e_pty_multiplayer.test.ts`)**
1. **Topology Setup:** Spin up a local SQLite DB mimicking 1 Daemon (Host) + 1 Remote CLI Client.
2. **Spawn Assert:** The Daemon receives a `TERMINAL_SPAWN` event and successfully boots an isolated `node-pty`.
3. **Input Interception:** The Remote Client pushes a `TERMINAL_INPUT` event simulating a user typing `"echo 'Hello Multiplayer'\n"`.
4. **Output Streaming:** The daemon applies this via `stdin`. The PTY executes the command, and the E2E tests assert that the DB records multiple `TERMINAL_OUTPUT` events containing fragments of the buffered stdout.
5. **Concurrency:** A simulated *second* client connects and issues a `TERMINAL_INPUT` (e.g., `Ctrl+C`), proving the single shared host PTY instance acts flawlessly across overlapping remote inputs.
