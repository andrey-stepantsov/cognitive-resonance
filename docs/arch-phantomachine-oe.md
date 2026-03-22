# Phantomachine: Operating Environment Specification

This document defines the interface and architectural requirements for developing **Phantomachine** strictly as an **Operating Environment (OE)** for Cognitive Resonance.

By treating Phantomachine as a fully decoupled execution engine, Cognitive Resonance (the "Brain") can offload all sandboxing, scaling, and dependency requirements.

## 1. Core Operating Principles
Phantomachine must act as a "dumb compute pipe." It takes a payload of code, provisions an environment, runs it, and returns the literal `stdout`, `stderr`, and `exit_code`. It should maintain zero conversational state. 

## 2. The Execution API Contract (Webhook / WebSocket)
Cognitive Resonance represents execution intents strictly through `EXECUTION_REQUESTED` events tagged to specific hosts (e.g., `@@edge:python`).
Phantomachine must expose an endpoint (or listen to a WebSocket) that accepts payloads mirroring this structure:

```json
{
  "request_id": "evt-12345",
  "sandbox_tier": "wasm-python",  // 'wasm-python' | 'node-local' | 'docker-container'
  "command": "python",
  "arguments": ["run.py"],
  "virtual_filesystem": {
     "run.py": "def main():\n  print('Hello from Edge!')\n\nif __name__ == '__main__':\n  main()",
     "dataset.json": "{ \"data\": [1,2,3] }"
  },
  "timeout_ms": 10000
}
```

## 3. Tiered Sandboxing Requirements

### Tier 1: Cloudflare Wasm Isolate (Pyodide / V8)
- **Target Tag:** `@@edge:wasm`
- **Purpose:** 0ms startup time. Maximum security. Small mathematical/text transformations.
- **Requirement:** Phantomachine must accept a Python script via HTTP, load it into a Pyodide worker, hijack `sys.stdout` to capture prints, and return the execution natively. 
- **Constraint:** Cannot run `pip install` or C-extensions.

### Tier 2: The Decoupled Node Executor
- **Target Tag:** `@@local:node` or `@@remote:container`
- **Purpose:** Heavy lifting. Compiling, using child_process, mounting volumes, running `npm i`.
- **Requirement:** Phantomachine must spin up distinct execution directories (or containers) per `request_id`, write the `virtual_filesystem` to disk, execute the command native to the host OS, stream the standard IO streams back to Resonance, and securely tear down temporary environments.

## 4. Concurrency & Security
Since multiple Cognitive Resonance agents might invoke Phantomachine simultaneously (especially in the "Infinite Loop" choreography):
- Phantomachine must handle executions asynchronously and scale queue depth. 
- Wasm executions must rigorously enforce Cloudflare's CPU time limits to avoid 502 Bad Gateway timeouts.
- Node executors must prevent directory traversal attacks (e.g., executing code outside the sandbox via `../../../`).

By fulfilling these specs, Phantomachine becomes the universal "Body" that Cognitive Resonance controls via event-sourced neurotransmissions!
