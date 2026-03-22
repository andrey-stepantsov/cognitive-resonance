# Design: Dynamic Memory Escalation & Semantic Graph Injection

## Core Architecture
Cognitive Resonance operates a true Local-First, Event-Sourced architecture. To prevent context window collapse and LLM inference cost bloat on long-running conversations, the system employs **Dynamic Memory Escalation**.

This architecture shifts seamlessly between two modes based on session lifecycle thresholds:

### 1. Phase 1: The Sliding Window (Casual Chat)
For newly spawned sessions (Messages 1 through N threshold):
- The LLM relies entirely on raw event history processing.
- Input is simply the array of `events` mapped sequentially to model roles.
- The LLM prompt is fast, stateless, and cheap.
- No semantic graph mapping overhead occurs; the AI acts natively.

### 2. Phase 2: Compilation & Condensation (The Threshold)
When the active session exceeds the configured threshold (e.g., Message #20):
- An asynchronous event intercepts the threshold trigger during the syncing layer.
- A Cloudflare Queue job (or background local thread) fires to "Compile the History."
- The LLM is prompted in a specialized side-stream to synthesize the raw text strictly into `semanticNodes` and `semanticEdges`.
- The graph is initialized and saved. The session is flagged as having transitioned to the "Advanced Mode".

### 3. Phase 3: Semantic Graph Injection (Deep Mode)
From Message N+1 onward:
- The raw history payload is truncated from the prompt context entirely.
- The newly serialized Knowledge Graph (JSON or YAML subset) is dynamically injected as the structural "State of the World" `system_instruction`.
- The prompt appends only the absolute most recent 1-3 raw messages strictly for conversational fluidity.
- The LLM's Structured Output is updated so it generates graph mutations (adding/deleting nodes) alongside its conversational reply on every subsequent turn.

## Implementation Details (Cloudflare Edge & PWA)
- **Token Economies**: Shifts from linear token bloat per message to a logarithmic decay overhead (the graph condenses meaning).
- **D1 Integration**: The threshold count acts as a conditional query trigger. `sessions` table utilizes a `has_graph` flag.
- **Hybrid RAG Recovery**: If a node cannot answer a deeply specific historical question, the Cloudflare Vectorize embedding index allows the AI to implicitly surface exact quotes back into the sliding window.
