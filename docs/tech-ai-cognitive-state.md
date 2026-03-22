# AI Cognitive State

Cognitive Resonance establishes a transparent and fully modeled internal processing state for the underlying LLM interacting with the user system. Rather than abstracting the agent's logic as a "black box" text generator, the system enforces a strict state architecture utilizing Gemini Structured Outputs to capture metadata on *how* the AI evaluates knowledge.

## Metadata Schemas
On every turn, `GeminiService.ts` executes a prompt evaluation that strictly enforces an internal state JSON representation alongside standard content payload. 

The state comprises three key primitives:
1. **Dissonance (`dissonanceScore`)**
2. **Nodes (`semanticNodes`)**
3. **Edges (`semanticEdges`)**

### 1. Dissonance Score
The Dissonance metric is an integer scale from `0-100` quantifying the AI's internal confusion, constraint violation awareness, or logical conflict.
- **0-20:** Complete clarity. Routine task execution.
- **30-60:** Minor inconsistencies between system context and user execution, or slight ambiguity in requests.
- **70-100:** Extreme conflict. This occurs when instructions explicitly contradict known facts, established architecture, or critical missing dependencies are severely impeding progress.

By broadcasting dissonance, the human operator accurately visualizes the underlying logic engine's confidence rather than relying purely on generated conversational tone.

### 2. Semantic Nodes
Semantic Nodes represent the core concepts, files, technical functions, or contextual elements the AI focused on during the inference turn.
A Semantic Node consists of:
- `id`: A unique programmatic identifier (e.g., `feature_auth`, `Worker_index_ts`).
- `label`: A human-readable title.
- `type`: An enumerated categorical breakdown (e.g., `file`, `concept`, `action`, `error`).

### 3. Semantic Edges
Semantic Edges graph the relationships and logic junctions the AI determined *between* isolated nodes within that generated turn.
A Semantic Edge consists of:
- `source`: The `id` of the parent Semantic Node.
- `target`: The `id` of the connected target Semantic Node.
- `relation`: The nature of the dependency (e.g., `depends_on`, `modifies`, `conflicts_with`, `resolves`).

## Persistence & Subsystems
The evaluated structural state is persistently stored alongside the user interaction inside the `data` properties of the `events` SQLite database schema natively. 

### Web Subsystem Visualization
In visually rich environments like the Vite Progressive Web App (`apps/pwa`) or the VS Code Canvas (`apps/extension`):
- React Components (`packages/ui`) harness this state dynamically.
- The **Dissonance Meter** surfaces the `0-100` scalar representation interactively.
- The **Semantic Graph** utilizes 3D force-directed node-edge architectures to map the concepts for advanced visual debugging of the AI's memory and working pattern.

### Terminal Output
In the CLI Headless (`apps/cli`) environments, the structured state is natively interpreted allowing programmatic logic loops (e.g., checking if the AI exited a command generation block with an inherently high dissonance score indicating a potential hallucination). Interactive REPL sessions log the dissonance score via formatted ANSI stdout blocks.
