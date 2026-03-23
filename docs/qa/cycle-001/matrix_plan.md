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
| `admin sandbox list` | `-` | Multi-environment Cloudflare enumeration validation. |
| `admin sandbox preview delete`| `<name>` | Exact teardown hook firing via Wrangler orchestration. |

---

## 3. Tooling Decision & Technical Stack

- **Global Runner:** `Vitest` (for Native TypeScript support, concurrency control, setup/teardown hooks).
- **CLI/Terminal Assertion:** `@cr/terminal-director` (custom wrapper around `node-pty` to reliably execute CLI processes, inject stdin scenarios, and scrape/filter ansi-clean stdout for assertions).
- **Network/API Assertion:** Native `fetch` / `Playwright API` for testing edge worker webhooks, bypassing the CLI.

---

## User Review Required

> [!IMPORTANT]
> I have codified the complete QA Lifecycle Loop (Run -> Capture -> Analyze -> Report -> Fix -> Repeat) and compiled an exhaustive Test Matrix spanning every single CLI command, option, and argument.
> 
> **Are there any other specific subsystems, external integrations (e.g., specific Edge Worker webhook paths), or advanced behaviors you want explicitly declared in this test matrix before we proceed to build the test infrastructure?**
