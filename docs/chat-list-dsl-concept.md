# Chat List DSL Concept

Here is an annotated architectural summary of the Lisp-based DSL we have developed. This outlines the structural pillars, the core vocabulary, and the design philosophy required to build the underlying engine.

### Architectural Philosophy

The architecture treats the LLM conversation not as a flat text stream, but as an **Abstract Syntax Tree (AST) of objects**. By using Lisp's S-expressions, we enable deep functional composition—allowing you to slice context, extract semantic metadata, and route to specialized actors without stepping out of the language.

---

### 1. The Core Data Model (The "Nouns")

To make the DSL composable, the functions must pass rich objects rather than raw strings.

* **`Chat` Object:** The root container. Holds metadata (participants, session ID) and an ordered sequence of `Turn` objects.
* **`Turn` Object:** Represents a single interaction. Contains the raw text, author (user/agent), timestamp, and a collection of `Marker` objects.
* **`Marker` Object:** Semantic metadata attached to a turn (e.g., intent, sentiment, extracted entities).

---

### 2. DSL Vocabulary & Syntax (The "Verbs")

Here is the foundational dictionary of your DSL, categorized by operational domain.

| Operation Domain | DSL Expression | Architectural Annotation |
| --- | --- | --- |
| **Context Slicing** | `(get-context :from n :to m)` | Returns a list of `Turn` objects. Relies on keyword arguments (`:from`, `:to`) with implicit defaults (`start`, `end`) for ergonomic boundaries. |
| **Element Selection** | `(turn n)` | Extracts a specific `Turn` object by index. Can act as a primitive building block for other functions. |
| **Metadata Extraction** | `(get-markers [target])` | A polymorphic function. If passed a `Turn`, it yields markers for that turn. If passed a `Chat` or a `get-context` slice, it aggregates markers across the sequence. |
| **Actor Routing** | `(request 'actor-name :input [data] :expect 'type)` | Implements the Actor Model. Routes a payload to a specific agent (e.g., `'tech-writer`) and enforces a structured output schema (e.g., `'artefact`). |
| **Session Management** | `(fork-chat :at-turn n)` | Manages state. Creates a cloned `Chat` object inheriting the original participants and history up to `n`, allowing parallel execution trees. |
| **Remote Execution** | `(exec "command")` | Safely evaluates physical shell commands on a materialized sandbox. Takes a string to prevent tokenizer errors on shell flags (no macro resolution required). |

---

### 3. Actor & Host Routing Syntax

To cleanly target specific AI agents or physical materialization hosts (daemons), the system extracts explicit intent from a specialized prefix schema before processing the Lisp block itself:

* **Full Explicit Routing:** `@<user>:<ai>@<host>#<turn>(<lisp-expression>)`
  * Example: `@steve:coder@MacBook#42(exec "npm test")`
* **Agent Shorthand:** `@<ai>` (Defaults to the current user and local interface).
  * Example: `@coder(get-context)`
* **Host Shorthand:** `@@<host>` (Instantly routes execution to the specified physical daemon using default actor identities).
  * Example: `@@LinuxCI(exec "make test")`

#### Edge-Native Execution (Cloudflare Target)

To execute serverless edge modules directly inside the Cloudflare backend (bypassing native OS daemons), the DSL supports specialized WebAssembly and V8 Isolate evaluation directly under the edge target.

* **TypeScript Evaluation:** `(eval-ts "code")`
  * Example: `@@CloudflareEdge(eval-ts "export default { fetch: () => new Response('Hello') }")`
* **Python (Pyodide Wasm) Evaluation:** `(eval-py "code")`
  * Example: `@@CloudflareEdge(eval-py "sum([1, 2, 3])")`

---

### 3. Core Design Principles

* **Implicit State Context:** By utilizing a dynamic variable (like `*current-chat*`), operators do not need to manually pass the session ID into every function. The DSL assumes operations apply to the active chat unless specified otherwise.
* **Functional Composition over Mutation:** Instead of altering an existing chat history, commands generate new localized contexts. `(get-context)` does not mutate the chat; it returns a slice to be fed into an actor.
* **Symbol-Driven Routing:** Lisp symbols (e.g., `'tech-writer`, `'artefact`) are used as lightweight identifiers for complex underlying system registries (e.g., agent configurations or JSON schema validators).

---

### 4. Architectural Synthesis: A Composite Workflow

This architecture allows for complex, multi-step agentic workflows to be represented as a single, readable Lisp block.

```lisp
;; Define a workflow that branches a conversation, extracts specific context, 
;; and delegates it to a specialized agent.

(let* ((branch      (fork-chat :at-turn 10))
       (context     (get-context :from 5 :to 10))
       (intent-tags (get-markers context))
       (artefact    (request 'tech-writer 
                             :input context
                             :context intent-tags
                             :expect 'artefact)))
  (save artefact :to "knowledge_base"))

```

---

Would you like me to sketch out the **execution layer** next—specifically, how an evaluator or a set of macros would actually parse and execute these S-expressions in a host language (like Python, Clojure, or Common Lisp)?