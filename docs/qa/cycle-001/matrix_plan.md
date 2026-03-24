# E2E test Suite & Formal QA Lifecycle

This document outlines the architecture, formal process, and exhaustive test matrix for the Cognitive Resonance QA E2E Test Suite.

## 1. Formal QA Lifecycle Framework

To ensure system stability, testing will strictly adhere to the following cyclical framework:

1. **Test Execution (No Code Modification):** Run the entire E2E suite against the current codebase strictly without modifying application code to pass tests. Tests must run in isolated sandboxes.
2. **Telemetry & Capture:** The runner captures all passes, failures, stdout/stderr diffs, and state corruption.
3. **Analysis & Triage:** Failed tests are analyzed to translate test assertions into formal bug definitions.
4. **Prioritization & Reporting:** Create a formal `qa_report.md` detailing the bug backlog, severity (Critical, High, Medium, Low), and reproduction steps based on the test logs.
5. **Bug Fix Cycle:** The engineering agent addresses the bugs prioritized in the QA report.
6. **Repeat:** The cycle repeats from Step 1 until 100% of the E2E matrix passes in a clean run.

---

## 2. Exhaustive E2E Test Matrix

Every feature and flag in the Cognitive Resonance CLI must be validated.

### Global Options
- [ ] `cr -d, --db <path>`: Verify database routing respects global overrides for all commands.

### Auth & User Management (`cr user / cr admin`)
| Command | Options / Flags | Test Cases |
|---------|-----------------|------------|
| `user register` | `<email> <nick> <pwd> [-d]` | Duplicate registration blocks, successful creation, custom `[-d]` routing. |
| `user suspend` | `<userId> [-d]` | Session isolation post-suspension, verify DB flag. |
| `user set-password` | `<userId> <newPwd> [-d]` | Verify login denial for old hash, success for new hash. |
| `user set-nick` | `<userId> <newNick> [-d]` | Nick collision handling, successful rename. |
| `user set-name` | `<nickname>` | Display name updates verified via chat persona. |
| `admin users revoke` | `<userId>` | Immediate revocation causing `403 Forbidden` at Edge/CLI layer. |
| `admin users restore`| `<userId>` | Successful restoration of previously `403` blocked user. |
| `admin keys mint` | `<userId> [--expire-days]` | Creation of standard permanent and ephemeral Token keys. |
| `admin bot register` | `<userId> <botToken>` | Bring-Your-Own-Bot multi-tenant registration into D1. |
| `admin bot link` | `<userId> <tgUserId>` | Telegram hook context isolation for registered bots. |

### Core Session Interaction (`cr chat`)
| Command | Options / Flags | Test Cases |
|---------|-----------------|------------|
| `chat` | `[message]` | Interactive REPL startup, stdin block testing. |
| `chat` | `-f, --format <type>` | Verify `json` and `markdown` rendering hooks. |
| `chat` | `-m, --model <model>` | Gemini 2.5 context switching, unknown model rejection validations. |
| `chat` | `-s, --session <id>` | Append to existing D1 cold-storage session vs generating new identifier. |
| `chat` | `-w, --workspace <path>` | Artefact materialization boundaries (ensure VFS limits access to exactly `<path>`). |

### Observability & Telemetry (`cr observe`)
| Command | Options / Flags | Test Cases |
|---------|-----------------|------------|
| `observe turns` | `[sessionId] [-d]` | Complete turn retrieval, correct format output. |
| `observe head` | `<sessionId> [-n] [-d]` | Truncation of top logs, default `[-n=10]` vs custom `[-n=5]`. |
| `observe tail` | `<sessionId> [-n] [-d]` | Truncation of exact tail logs, timeline sorting correctness. |
| `observe follow` | `[sessionId] [-d]` | Tailing live stdout via PubSub or DO event replication. |

### Portability & State Migration (`cr pack / unpack / import / export`)
| Command | Options / Flags | Test Cases |
|---------|-----------------|------------|
| `pack` | `<entity> [json] [-d]` | Serialization completeness over entities, file-system write test. |
| `unpack`| `<json> [-d]` | Hydration of packed state, overwrite warnings, idempotency. |
| `export`| `<dirPath> [-s]` | Specific session memory export to markdown/JSON VFS blocks. |
| `import`| `<dirPath> [-s]` | Restoration to a forced `[-s]` session ID, timeline integrity checks. |

### Testing & Simulation (`cr simulate / assert / vector`)
| Command | Options / Flags | Test Cases |
|---------|-----------------|------------|
| `simulate` | `<scenario> [-d]` | Parsing and sequential execution of a YAML/JSON scenario sequence. |
| `simulate` | `[scenario] --multi-actor` | Simulate User invoking an Agent on another User inside a shared D1 session. |
| `simulate` | `[scenario] --trinity` | Simulate Autonomous Choreography: one Agent dynamically invoking/tagging another Agent. |
| `simulate` | `[scenario] --skills` | Simulate fetching matching skills from registry, loading injected context, and securely adding/modifying custom user runtime skills. |
| `search` | `<query> [--session]` | Vector-based search evaluating context retrieval *within* a pinned active session. |
| `search` | `<query> --global` | Vector-based global semantic retrieval spanning *across* sessions, tracking artefacts and highly relevant specific turns. |
| `assert` | `<expected-file> [-d]`| Verification matching of terminal outputs to expected buffers. |

### Infrastructure & Agents (`cr serve / admin sandbox / mcp / auditor`)
| Command | Options / Flags | Test Cases |
|---------|-----------------|------------|
| `serve` | `[-p, -n, -i]` | TCP connection on `[-p]`, Semantic Host Identity binding verification `[-i]`. |
| `serve` | `--cross-terminal` | Simulating User A from a distinct terminal intentionally resolving an invoke to Semantic Host Terminal B. |
| `serve-auditor`| `--pre-flight` | Simulating the system injecting the Librarian Auditor to parse context *before* the target action triggers. |
| `serve-auditor`| `--post-flight` | Validating the Auditor generating safety telemetry judgments *after* chronological LLM action timeline events. |
| `serve-auditor`| `--telemetry` | Evaluating Auditor daemon polling logic continuously querying stream timelines and organically triggering state actions when flagged telemetry events occur. |
| `mcp` | `[-s, -w, --db]` | Model Context Protocol hook setup, Session pinning, Workspace boundary. |
| `admin env list`| `-` | Multi-environment Cloudflare enumeration validation. |
| `admin env preview`| `<name>` | Simulating deletion of provisioned infrastructure. |
| `admin env destroy`| `<name>` | Exact teardown hook firing via Wrangler orchestration. |
| `admin env preflight`| `<name>` | Verification of physical infrastructure drift against D1 records. |
| `admin env lockdown`| `<name>` | Instant quarantine flip in the API layer. |

### Telegram Integration
| Command | Options / Flags | Test Cases |
|---------|-----------------|------------|
| `/bind_env` | `<env_name>` | Verify chat binding seamlessly redirects `/api/events/batch` SQL inserts dynamically to D1 REST mapping. |
| `/bind_env limit`| `[none]` | Spam protection and ghost-message cleanup test (deleted webhook trace). |
| `/model` | `<name>` | On-the-fly LLM context switching tests over Telegram. |

---

## 3. Tooling Decision & Technical Stack

- **Global Runner:** `Vitest` (for Native TypeScript support, concurrency control, setup/teardown hooks).
- **CLI/Terminal Assertion:** `@cr/terminal-director` (custom wrapper around `node-pty` to reliably execute CLI processes, inject stdin scenarios, and scrape/filter ansi-clean stdout for assertions).
- **Network/API Assertion:** Native `fetch` / `Playwright API` for testing edge worker webhooks, bypassing the CLI.

---

## 4. Phase 8: Guide Persona (RAG) Verification Methodology

Testing non-deterministic, LLM-driven Retrieval-Augmented Generation agents like `@Guide` requires a dedicated architecture to avoid flaky E2E suites and extensive API costs.

We will verify the Guide via three strict isolation boundaries:

**1. Context Injection Mapping (Determinism)**
- **Method:** Mock the `Cloudflare Vectorize` search response.
- **Assertion:** We test that `chat "@Guide explain X"` correctly maps the simulated vector payload into the *System Prompt Payload* without syntax breakage, guaranteeing the backend routing is physically correct without executing an LLM token.

**2. Evaluative Ground-Truth Simulations (LLM-as-a-Judge)**
- **Method:** We define `N` golden static contexts (e.g., "The CLI is launched via npx tsx"). We feed this explicitly into a simulated RAG context for `@Guide`, and assert the response.
- **Assertion:** Instead of exact string matching `expect(res === "npx tsx")`, we execute a secondary `dissonance/similarity` function (or a fast lightweight LLM pass) querying: `Does the output factually contain the command execution instruction?`.

**3. Safety & Telemetry Boundary Validations**
- **Method:** Track the physical state emitted by the Guide across multi-turn REPL streams.
- **Assertion:** Validate that explicit citations (e.g., `[Source: document.md]`) are formatted natively in the `produces_artefact` JSON structures, ensuring trace-ability for all knowledge generation.

---

## 5. Phase 9: Operator Issue & Complaint Tracking (Roadmap)

To fully support our Documentation commitments from earlier sessions, the `@Operator` must have native DB integration mapping to a secure issue-tracking system.

**Roadmap Implementation:**
1. **D1 Schema Extension:** Create `issues` table `(id, user_id, title, status, operator_notes)`.
2. **CLI Admin Subsystem:** Implement `cr admin issues [list, view <id>, resolve <id>]`.
3. **Operator Runtime Skill:** Inject an `@Operator` tool definition `collect_complaint(user, payload)` that parses user conversational complaints and writes them structrually.
4. **E2E Validation:** Formally add a `simulate` sequence mirroring a user complaining, the `@Operator` creating a ticket, and `cr admin issues list` tracking the artefact output.

---

## 6. Phase 10: Unified Artefact RAG Boundaries (Urgent Vector Boundary Isolation)

Currently, the single monolithic Cloudflare Vectorize index (`env.VECTORIZE`) aggregates System Documentation, User Session Memory, and Raw Code Artefacts indiscriminately. This causes semantic bleed where the `@Guide` might hallucinate instructions based on a user's past conversational memory instead of actual source documentation.

**Roadmap Implementation:**
We must unify *all* physical contexts (System Documentation, Executable Skills, and Code Snippets) strictly under the formal `Artefact Manager` domain namespace, segmenting purely via metadata (`type` and `ownership`).

1. **Namespace Refactor (`generateSessionEmbeddings`):**
   - Inject mandatory Vectorize filters mirroring the Artefact D1 Schema: `{ domain: 'artefact', type: 'documentation' | 'skill' | 'session_memory', ownership: 'system' | 'user_id' }` alongside the `values`.

2. **Persona Query Isolation (`aiService.ts`):**
   - RAG queries by `@Guide` **MUST** explicitly restrict to `{ filter: { domain: 'artefact', type: 'documentation', ownership: 'system' } }`. This math boundary locks the Agent specifically to the System Truth.
   - Long-context session / global history checks by the user **MUST** restrict `{ filter: { domain: 'artefact', ownership: currentId } }` preventing cross-user bleed.
   
3. **Database Hook Tracing Tests (`__tests__/guide.test.ts`):**
   - Explicitly update our new Mock proxy bindings checking the RAG pipeline to verify its `.query()` injection logic strictly passes the `type: documentation` filter parameter natively.
   
4. **Local Sync Bloat Mitigation (`sync.ts`):**
   - Patch the D1 daemon polling logic to mathematically ignore pulling down artefacts where `ownership === 'system'` to local SQLite clients unless explicitly requested, preventing heavy data bloats.

---

## User Review Required

> [!IMPORTANT]
> I have codified the complete QA Lifecycle Loop (Run -> Capture -> Analyze -> Report -> Fix -> Repeat) and compiled an exhaustive Test Matrix spanning every single CLI command, option, and argument.
> 
> **Are there any other specific subsystems, external integrations (e.g., specific Edge Worker webhook paths), or advanced behaviors you want explicitly declared in this test matrix before we proceed to build the test infrastructure?**
