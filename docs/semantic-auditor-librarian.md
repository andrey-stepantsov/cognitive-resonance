# Event-Sourced Librarian & Semantic Skill Repository

This document defines the architecture of the **Background Auditor** (Librarian) and the **Skill** namespace extensions within Cognitive Resonance.

## 1. The Virtual Namespace (`.cr/skills/`)
Cognitive Resonance treats AI "Capabilities" and "Skills" not as hardcoded MCP plugins, but as dynamic scripts written into the Virtual Filesystem (VFS) under `.cr/skills/`.
- **Zero Configuration Extensibility:** AIs can define, structure, and modify their own operational workflows merely by outputting file diffs via standard `ARTEFACT_PROPOSAL` events.
- **Native Synergy:** By utilizing the Materializer, executing a skill (e.g., `(exec bash .cr/skills/deploy.sh)`) natively spins up physical environment overlays and guarantees synchronized state traversal.

## 2. Temporal Paradox Recovery (No Backup Needed)
Because everything—from thoughts to scripts—is appended immutably to the `events` table, the skill repository requires no external backup.
If a cascading AI failure corrupts `.cr/skills/`, the developer or orchestrator can simply:
1. Identify the timestamp/event threshold of the destructive `ARTEFACT_PROPOSAL`.
2. Fork the session (`/clone`) or rollback (`/session recover`) from exactly one tick prior to the failure.
3. The VFS projection is cleanly restored byte-for-byte.

## 3. The Asynchronous Critic (Librarian Persona)
To ensure the safety and quality of the self-modifying skill repository, Cognitive Resonance utilizes an asynchronous Background Auditor.

### Architecture Topology
1. **The Daemon Loop:** A background process (e.g., `cr serve-auditor`) queries local/remote active sessions and tails the `events` table.
2. **Selective Awakening:** The daemon specifically watches for `ARTEFACT_PROPOSAL` events where the underlying patch paths match namespace restrictions (e.g., `.cr/skills/*`).
3. **The Audit Execution:** The daemon parses the proposed script changes and dispatches them to a high-speed inference model (like `gemini-1.5-flash-8b`), constrained by a strict "Auditor System Prompt" focusing entirely on security (`rm -rf`, recursion limits) and formatting cleanliness.
4. **Graph Injection (The Stamp):** If the skill passes, the Auditor emits a structural `AI_RESPONSE` back to the session containing no raw text, but containing distinct **Semantic Nodes** like `["skill_verified", "v1.1.0"]`.
5. **Human/Agent Alerting:** If the skill fails auditing, the Auditor injects an explicit warning back into the chat (`@developer WARNING: Volatile dependency detected.`), immediately alerting the multi-actor room.

This yields a resilient, self-healing memory architecture without taxing the contextual cognitive load of the primary generative agents.
