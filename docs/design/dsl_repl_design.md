# Cognitive Resonance DSL & REPL Architecture Specification

## 1. Overview
To deliver a fully keyboard-controlled, power-user experience, we will introduce a Domain Specific Language (DSL) integrated directly into a Read-Eval-Print Loop (REPL). This REPL will serve as the primary interaction layer, replacing or augmenting the standard chat input box. The DSL will allow users to control session state, configure models, manage gems, and deeply interrogate the generated semantic graphs without lifting their hands from the keyboard.

## 2. REPL Integration Strategy
Instead of building a separate "terminal" window, we will **upgrade the standard Chat Input into a unified REPL interface.**

**How it works:**
1. **Unified Input:** The existing `<textarea>` where users type prompts will become the REPL prompt.
2. **Command Interception:** When the user types `Enter`, a specialized `CommandParserService` in `@cr/core` analyzes the input.
3. **Execution Branching:**
   - If the input starts with the DSL trigger character (`/` or `!`), it bypasses the LLM and executes locally as a system command. Output is rendered as a "System" message in the chat feed.
   - Otherwise, the input is treated as a standard chat prompt and sent to the LLM via `GeminiService`.
4. **Interactive Autocomplete:** The REPL input will detect `/` and pop up a fuzzy-findable list of available commands, arguments, and entity IDs (like session IDs, gem names, or semantic nodes).
5. **Command History & Search:** 
   - **Chronological History:** Pressing `Up` or `Down` arrow keys while the input is empty (or cursor is at bounds) cycles through previously executed commands and prompts, mimicking `bash`/`zsh` history.
   - **Reverse Fuzzy Search (`Ctrl+R`):** Pressing `Ctrl+R` (or `Cmd+R`) replaces the standard input box with a "fuzzy reverse history search" modal, allowing the user to search through both past commands (`/graph ls`) and past regular conversational prompts across all sessions, immediately loading the matched string into the active REPL buffer.

## 3. Core DSL Syntax Design
The DSL will use a standard slash-command prefix (`/`), followed by a namespace/entity, an action, and arguments.

### A. Environment & Session Control
| Command | Action | Example |
| :--- | :--- | :--- |
| `/clear` | Clears the current chat feed (does not delete session). | `/clear` |
| `/session new` | Starts a fresh session. | `/session new` |
| `/session load [id]` | Switches to a specific session. | `/session load 1234-abc` |
| `/session ls` | Lists recent sessions (rendered as interactive CLI table). | `/session ls --limit 5` |
| `/model use [name]` | Switches the active model. | `/model use gemini-1.5-pro` |

### B. Gem Control
| Command | Action | Example |
| :--- | :--- | :--- |
| `/gem use [id]` | Sets the active system gem. | `/gem use gem-coder` |
| `/gem ls` | Lists available gems. | `/gem ls` |

### C. File Context & Attachments
| Command | Action | Example |
| :--- | :--- | :--- |
| `/attach [file]` | Attaches a file from the workspace/device to the context. | `/attach ./src/App.tsx` |
| `/context drop [file]` | Removes a file from the active context. | `/context drop App.tsx` |

---

## 4. Semantic Graph Interaction DSL
Yes, having explicit DSL commands to interact with the semantic graphs is a **massive** value multiplier. Instead of just looking at the D3 visualization, users can programmatically query the knowledge structure generated during the session.

The graph DSL will operate under the `/graph` namespace, treating the accumulated semantic nodes and edges across the session as an in-memory database.

### Graph Interaction Commands

#### 1. Entity Exploration
| Command | Action | Example |
| :--- | :--- | :--- |
| `/graph ls [type]` | Lists all nodes, optionally filtered by type. | `/graph ls "Function"` |
| `/graph search [query]` | Fuzzy matches nodes by label or ID. | `/graph search "auth"` |
| `/graph describe [node_id]` | Prints the full details of a specific node. | `/graph describe node-useCognitivePlatform` |

#### 2. Relationship Traversal
| Command | Action | Example |
| :--- | :--- | :--- |
| `/graph neighbors [node_id]` | Shows all nodes directly connected to the target. | `/graph neighbors node-storage` |
| `/graph path [nodeA] [nodeB]` | Finds and prints the shortest path/relationship chain between two concepts. | `/graph path node-Auth node-Database` |
| `/graph dependants [node_id]` | Shows what concepts rely on this node (directional edge traversal). | `/graph dependants node-APIKey` |

#### 3. Graph Analysis & Metrics
| Command | Action | Example |
| :--- | :--- | :--- |
| `/graph stats` | Summarizes graph density, node counts, and most highly-connected "hub" nodes. | `/graph stats` |
| `/graph cluster [node_id]` | Groups and visualizes strongly related concepts around a target. | `/graph cluster node-React` |

---

## 5. System Output & Rendering
When a user executes a DSL command, the REPL should respond with a synthetic "System Message". 
- These messages are **ephemeral** and local. They are *not* appended to the `messages` array sent to the LLM, preventing token bloat.
- They are rendered natively using React components. For example, `/graph describe` doesn't just print text; it renders an interactive React card containing the node details. `/graph path` renders a mini D3.js visual of just that specific path.

## 6. AI Agent Navigation (Model-to-App Interface)

The unified REPL architecture offers a profound side-effect: if every UI action maps to a DSL command, **we can expose this entire DSL to other AI models programmatically.**

Instead of building a proprietary "skill", this perfectly aligns with the **Model Context Protocol (MCP)** standard. By running an embedded or sidecar MCP Server, Cognitive Resonance transforms from a passive chat interface into an **active environment that autonomous agents can navigate and control.**

### Proposed MCP Architecture
1. **The Core Engine (`CommandParserService`)**: Since `CommandParser.ts` cleanly converts string commands (`/graph ls`) into application intent, we don't need a separate API for AI models. The API *is* the REPL commands.
2. **MCP Tool Exposure**:
   - The Cognitive Resonance MCP server exposes a single, powerful tool: `execute_cr_command(command: string)`.
   - Alternatively, it could expose specific, typed tools like `cr_read_graph(nodeId)`, `cr_list_sessions()`, but piping raw DSL strings is highly robust for LLMs that are given a system prompt explaining the DSL.
3. **MCP Resources**:
   - Expose the current Semantic Graph and the `messages` array of the active session as continuous MCP `<Resources>`, allowing connected AI models to seamlessly read the live conversational context.
4. **Integration Types**:
   - **For Native/Electron/Desktop**: A local `.mcp.json` config can launch a Node.js process exposing stdio.
   - **For VS Code Extension**: VS Code natively supports exposing MCP servers and participating in the Language Model API, making the extension environment immediately traversable by tools like GitHub Copilot or Antigravity.
   - **For PWA/Web**: We can expose a local WebSocket server from the PWA, strictly bounded to `localhost`, intercepting and proxying agentic commands into the React state machine.

By combining the **DSL/REPL** for human power-users with an **MCP Server** for autonomous AI agents, Cognitive Resonance becomes fully programmable from both ends of the keyboard.
## 7. Implementation Plan (`@cr/core`)
1. Create a `CommandParser.ts` utility that parses string inputs into `CommandIntents` (e.g., `{ action: 'SESSION_LOAD', args: ['s123'] }`).
2. Expose a `useREPL` hook that wraps the existing `useCognitiveResonance` hook.
3. In the UI layer (`apps/pwa` & `apps/extension`), update the input field event handler. If `input.startsWith('/')`, intercept it, parse it, execute the side effect (like switching a model or fetching graph neighbors), and inject a system response into the feed.
4. **MCP Bridge:** Connect the internal intent dispatcher to a background MCP server instance, mapping `execute_cr_command` to the exact same pipeline handling the human's `<textarea>` input. 

---

## 8. Voice Input Routing

Adding a voice input layer becomes **trivial and highly robust** with this architecture. Because the application treats the REPL string as the universal control interface, Voice input simply acts as another text feed into the `CommandParserService`.

### Implementation Flow
1. **Speech-to-Text (STT)**: A voice input mechanism (e.g., the browser's native `SpeechRecognition` API, or an integration with Whisper) transcribes the user's speech into a raw string.
2. **AI Intent Translation (Optional/Recommended)**: If the user says "Hey, load my last session and switch to the pro model", a fast, low-latency LLM (like Gemini 1.5 Flash) can be used to translate natural language directly into DSL commands:
   * **Input:** "Load my last session and switch to the pro model"
   * **AI Output:** `/session load latest\n/model use gemini-1.5-pro`
3. **Execution**: The translated DSL strings are fed directly into the `CommandParserService`, executing the commands exactly as if the power-user had typed them into the REPL.

This means you never have to program custom "voice command handlers" for the UI. You simply rely on the LLM to translate speech into your strict DSL, and the App executes it reliably.

---

## 9. Multiplayer AI Orchestration & Interaction Model

When multiple humans collaborate in a Cognitive Resonance session, the implicit "ping-pong" chat paradigm breaks down. To solve the "cocktail party problem" of AI orchestration, we enforce the **Explicit Mention Pattern**.

### Interaction Rules
1. **Free Human Chat:** Humans can chat normally within the session. These messages are synchronized via Yjs/Cloudflare Durable Objects. **These messages do NOT trigger an AI response.**
2. **The Silent Observer:** The AI (Gem) constantly reads and synchronizes the entire conversational context, including all human-to-human interactions.
3. **Explicit Waking:** The AI *only* generates a response when explicitly addressed via an `@mention` (e.g., `@SystemCoder, what do you think of this architecture?`).
4. **Group Chat Awareness:** When the AI is invoked, it is supplied with a specific "Multi-Actor Environment" system prompt, ensuring it understands that the preceding messages come from different distinct human identifiers, allowing it to synthesize answers that resolve debates or combine ideas from multiple users.

### Interface Requirements
- **PWA UI (`@` Selector):** Typing `@` in the chat input will immediately pop up an autocomplete selector. This selector will list both **Active Human Peers** (to tag a colleague) and **Available AI Gems** (to query a specific model). Selecting a Gem inserts the token and primes the system to route the send event to the LLM.
- **CLI REPL Interaction:** In the terminal, typing `@` will trigger the autocomplete engine (similar to how `/` triggers the DSL autocomplete). Because the CLI lacks a floating GUI, the interface will temporarily yield to an inline, multi-row `<select>` interface (using a library like `enquirer` or heavily customized `readline` logic) allowing arrow-key selection of the target AI before returning the cursor to the prompt text.
