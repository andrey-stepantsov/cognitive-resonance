# Context
We are tracking the continuous development of the Cognitive Resonance framework. In our previous session (spanning Phase 6, 7, and 8), we successfully implemented the Admin CLI Advanced operations (`lockdown`, `preflight`), codified the "Telegram Single-Bot Hat-Switching Architecture" allowing dynamic multi-tenant proxy routing to physical D1 databases, and secured local development with an HTTP Cloudflare proxy that completely bypassed local firewall inspection. The entire 45+ suite of QA regression and simulated E2E tests are 100% stable.

# Objective
We will execute **Phase 9** and **Phase 10** of the structural roadmap explicitly documented inside `docs/qa/cycle-001/matrix_plan.md`:

### 1. Phase 10: Unified Artefact RAG Boundaries (Priority: Urgent)
Currently, our `Vectorize` index lumps all user histories and system documentation together globally.
- [ ] Refactor `generateSessionEmbeddings` inside the Cloudflare Worker to enforce strict metadata boundaries via vector labels (e.g., `domain: 'artefact', type: 'session_memory' | 'documentation'`).
- [ ] Update the `@Guide` persona RAG mechanism inside `aiService.ts` to rigorously filter queries exactly matching `type: 'documentation'`. This mathematically prevents the agent from hallucinating instructions based on individual conversational contexts.
- [ ] Update the local desktop `SyncDaemon` (inside `packages/core` or `apps/cli`) to gracefully ignore aggressively pulling down global/system artifacts into the local user `.cr` folder, preventing severe disk bloat on the client side.

### 2. Phase 9: Operator Issue & Complaint Tracking
The `@Operator` persona requires the ability to formally track complaints when a user mentions an issue across multi-tenant sessions.
- [ ] Extend the core D1 schema with a new `issues` table `(id, user_id, title, status, operator_notes)`.
- [ ] Implement a sub-routing CLI controller: `cr-admin issues [list, view <id>, resolve <id>]` (inside `apps/admin-cli` or similar) to interface with the Edge worker.
- [ ] Inject a native `collect_complaint(user, payload)` tool/skill functionally into the `@Operator` context to parse complaints mid-conversation and structurally write them to the D1 endpoint.

**Next Steps:**
Please initiate this run by drafting a fully detailed `task.md` encompassing both phases. Then read `docs/qa/cycle-001/matrix_plan.md` if you require further verification of the roadmap steps. When ready, propose the `implementation_plan.md` for the Vectorize Refactor (Phase 10) first.
