# Context
In our previous session, we successfully completed the **Exhaustive E2E Test Matrix** for the **Core Session Interaction (`cr chat`)** module. We constructed rigorously isolated programmatic tests for the `TerminalManager` E2E pipeline, and verified operational boundaries including Interactive REPL (`stdin` pipe parsing), Formatting Hooks (`--format`), Model Selection (`--model`), Session Cold-Storage (`--session`), and Workspace VFS Bounding (`--workspace`). We also resolved headless bug leaks around `child_process` pipe consuming and SQLite sandbox isolation constraints, achieving a 100% pass rate for the `chat` suite. 

# Objective
Our objective for this session is to continue executing the Exhaustive E2E Test Matrix outlined in `docs/qa/cycle-001/matrix_plan.md`. The next contiguous module to mathematically verify is **Observability & Telemetry (`cr observe`)**.

**Testing Requirements:**
You must build programmatic E2E test suites (likely in `tests/e2e/observe.test.ts`) that precisely validate the following operational boundaries:
1. **Turn Retrieval (`cr observe turns`)**: Assert complete turn retrieval from a known initialized session, validating standard JSON and string formatting mechanisms.
2. **Head Truncation (`cr observe head`)**: Validate chronological truncation of the top logs, asserting the baseline default (`-n=10`) against bounds override limits (`-n=5`).
3. **Tail Truncation (`cr observe tail`)**: Validate chronological truncation of exact tail logs, explicitly asserting timeline sorting correctness (Ascending vs Descending output).
4. **Live Tailing (`cr observe follow`)**: Validate continuous polling/tailing of live stdout event streams (likely via Edge DO webhook replication).

**Next Steps:**
Please initiate this run by briefly examining the current `apps/cli/src/commands/observe.ts` implementation, then drafting a fully detailed `task.md` mapping out the `cr observe` QA test construction plan. When ready, propose an `implementation_plan.md` to scaffold `tests/e2e/observe.test.ts` and begin the QA failure/fix loop.
