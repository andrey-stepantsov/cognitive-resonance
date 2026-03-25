# Phantomachine Integration Specification

This document defines the architectural contract between **Cognitive Resonance (CR) — The Brain** and **Phantomachine — The Muscle**. 

Because Cognitive Resonance is designed for lightweight, high-scale Cloudflare edge deployments, it mathematically cannot run heavy OS-level binaries (like FFmpeg, Python scrapers with C-extensions, or Chromium instances) securely. Phantomachine fulfills the role of external, scalable compute nodes.

This integration specification ensures that Phantomachine is fully secured, observable, and completely driven by CR's existing Event-Sourcing architecture.

---

## 1. Security & Authentication (Bring Your Own Compute)

Phantomachine nodes must not be open endpoints executing arbitrary remote code payloads. To securely bind a Phantomachine node to a CR installation, we map it onto CR's existing decoupled Authentication models.

### The Lifecycle
1. **Registration:** An operator uses the CR Admin CLI (`cr-admin bot register`) to mint a unique, offline-signed provisioning token intended for a "Compute Node."
2. **Bootstrapping:** The Phantomachine daemon boots on a remote server (e.g., an EC2 instance). It is provided the CR Cloudflare endpoint and the provisioning token via its local `.env`.
3. **JWT Handshake:** The daemon executes an exchange against CR's `/api/auth/machine` endpoint, returning a long-lived JWT.
4. **Authorization:** Every further interaction (specifically upgrading the connection to a WebSocket) requires establishing the connection with `Authorization: Bearer <JWT>`. Cognitive Resonance drops any connection attempts from unauthorized compute nodes.

---

## 2. The WebSocket Event Protocol

Synchronous HTTP (POSTing code and waiting 5 minutes for an FFmpeg render to return) is anti-pattern to event sourcing. It causes timeouts and drops logs. Phantomachine will communicate with CR via long-lived, bi-directional WebSockets governed by Zod schemas.

### Upstream (CR to Phantomachine)
CR dispatches events dynamically down the socket:
*   `EXECUTION_REQUESTED`: Contains the Docker environment tag (e.g., `@@docker:ffmpeg-latest`) and the `virtual_filesystem` mapping representing all physical Artefacts in the session required for the run.

### Downstream (Phantomachine to CR)
Phantomachine pushes events back up the socket to be appended to the D1/SQLite timeline:
*   `STDOUT_CHUNK` / `STDERR_CHUNK`: Real-time telemetry (see Section 4).
*   `ARTEFACT_CREATED`: The final materialized payload (e.g., a base64 encoded `.mp4` string, or a signed R2 URI link if the file exceeds WebSocket payload limits).
*   `EXECUTION_COMPLETED`: Yields the aggregate exit code and duration.

---

## 3. VFS Materialization & Sandboxing Lifecycle

To safely execute foreign AI-generated code, Phantomachine must leverage **Docker Orchestration** directly via the Docker Engine socket natively, moving past the local `child_process.exec()` MVP.

### The Execution Flow
1. **Parse VFS:** Upon receiving an `EXECUTION_REQUESTED` payload, the node parses the JSON VFS tree.
2. **Materialize Host Volume:** The node creates an ephemeral directory on its physical disk (e.g., `/tmp/sandbox-evt-12345/`). It recursively writes all binary elements (audio, image) and source code (python script) to this directory.
3. **Spin Up Sandbox:** The node issues a `docker run` command:
    - `--rm`: Ensures the container is destroyed immediately after exit.
    - `--network none` (Optional): Determined by the CR payload. If the task is a pure FFmpeg render, network access is severed for security.
    - `-v /tmp/sandbox-evt-12345:/workspace`: Mounts the materialized VFS into the container.
4. **Execute Native:** The actual execution path triggers inside the container (`python /workspace/run.py`).
5. **Collection & Teardown:** The daemon streams logs. Once the container exits, the daemon sweeps the `/workspace` mount for newly generated files, packages them as `ARTEFACT_CREATED` events, and physically destroys `sandbox-evt-12345` from its host drive to strictly prevent cross-turn contamination.

---

## 4. Telemetry & Dissonance Stream

One of CR's core personas is the `@Auditor`, an AI loop that validates code execution by explicitly reading logs. Furthermore, the human PWA requires a live terminal-like experience.

*   Phantomachine **must not buffer logs**. As the Docker container streams `stdout/stderr`, the daemon must chunk those buffers and emit them near real-time (e.g., every 500ms) as `STDOUT_CHUNK` over the WebSocket.
*   This ensures that if a 10-minute long FFmpeg job fails at minute 9, the `@Auditor` in CR has the full chronological terminal trace to analytically determine the error, rather than suffering an opaque connection timeout.
