# The Multi-Agent Genesis Demo

## Overview

The **Genesis Demo** is an automated, visual end-to-end orchestration that proves out the "Multi-Agent Segregation" and "Strict Dependency" use cases defined in [Multi-Repo Use Cases](./multi-repo-use-cases.md). 

Instead of an AI collaborating with a human on a pre-existing repository, this demonstration spins up two distinct AI agents—an **Architect** and an **Engineer**—collaborating autonomously within a completely empty, shared Event-Sourced session to build a multi-repository ecosystem from scratch.

## Objectives

1. **Demonstrate Concurrent Event Streams:** Prove that multiple independent AI entities can read from and write to the same `cr chat` session without conflict.
2. **Showcase Lisp DSL Routing:** Use the explicit `@actor:agent(lisp-ast)` syntax to deterministically hand off execution intent between the AIs rather than using unstructured free text.
3. **Validate Orchestration Safety (The Sentinel):** Implement a third-party script supervisor (`TerminalDirector`) that enforces bounded interactions and prevents infinite conversational loops.
4. **Prove Materialization:** Culminate the conversation by synthesizing out two physically functional, cross-dependent repositories onto the local disk using the `cr export` command.

## Theoretical Architecture

The orchestration runs entirely through a standard `bash` and `TypeScript` wrapper, utilizing `asciinema` to record the interactive REPLs and multiplex their outputs.

### The Highlighted Subject: The Cloudflare Edge "MicroLisp" Engine
*(Note: This scenario is documented for architectural demonstration purposes and is not slated for immediate implementation in the Phase 5 baseline).*

To maximize the "Wow Factor" and prove the **Distributed Sandbox / Edge Deployment** topology, the AIs are directed to build a **Cloudflare Edge MicroLisp Engine**:
* **Repo A (The Edge Evaluator):** A Cloudflare Worker (`wrangler.toml` + `src/index.ts`) that acts as an HTTP `fetch` handler. It accepts a `POST` body containing a raw custom MicroLisp script, parses the AST securely in memory, and returns the computed JSON response.
* **Repo B (The Edge CLI Client):** A gorgeous, interactive Node.js CLI REPL (using `readline` + `chalk`). Instead of evaluating locally, every keystroke/enter dispatches an HTTP `fetch` to the instantiated local `wrangler dev` environment (Repo A) running inside the Materializer sandbox.

---

### The Actors

- **The Architect (`gemini-2.5-pro`)**: Responsible for system design. Prompted with instructions to invent the Cloudflare Worker parser (`Repo A`) and the CLI Client (`Repo B`).
- **The Engineer (`gemini-2.5-pro`)**: Responsible for translating the Architect's instructions into physical `<ARTEFACT_PROPOSAL>` write sequences.
- **The Sentinel (TypeScript Orchestrator)**: The `TerminalDirector` test harness running the show. It bridges the `stdout` of one agent to the `stdin` of another, limits the conversation depth, and triggers panic (`.kill()`) if the loop goes out of bounds.

### Execution Flow

1. **Bootstrapping**: The script runs `cr session new genesis-demo`.
2. **Architect Turn**: The script spawns the first TTY instance targeting the `genesis-demo` session. It prompts the Architect:
   > *"You are the Architect. We need to build a new system: Repo A is a Cloudflare Worker that evaluates MicroLisp ASTs over HTTP. Repo B is an interactive Node.js CLI REPL that queries it. Draft the exact file specs."*
3. **The Handoff**: Once the Architect stops generating, the script parses the plan.
4. **Engineer Turn**: The script spawns the second TTY instance. It injects a DSL-routed command forcing the Engineer to act:
   > `@engineer:gemini-2.5-pro(task "Read the Architect's plan above and synthesize the exact file artifacts for both repositories now.")` 
5. **Event Emission**: The Engineer emits raw `ARTEFACT_PROPOSAL` sequence events into the central SQLite database.
6. **The Kill Switch**: Once the standard completion tokens are printed, the `TerminalDirector` forcefully aborts both processes.
7. **Synthesis**: The script runs `cr export /tmp/genesis-demo-output -s genesis-demo`, materializing the completely hallucinatory architecture into real physical execution files.

## Safety Mechanics

Because Cognitive Resonance is an asynchronous, event-driven multiplayer engine, two AIs subscribed to the same chat room could hypothetically lock themselves into a "thank you" feedback loop.

This demo strictly relies on **The Dual-Sentinel Pattern**:
- **Grammatical Rigidity:** AIs are told their peers will *only* execute actions formatted in the specific `parseDslRouting` syntax (e.g., `@agent(exec ...)`). Fluff text is ignored by the REPL parser.
- **Hard Turn Caps:** The automation script defines a `MAX_TURNS` threshold globally. At the third hand-off, if `.cast` recording hasn't naturally concluded, the physical process orchestrator terminates the AI child processes, protecting API budgets and preventing zombie generation.
