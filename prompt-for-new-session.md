# Next Session Objective: CLI Live Artefact Integration & Feature Specific E2E

## Current State
We have successfully completed the foundational components of **Phase 15: CLI Completeness & Multi-Agent Routing**. 
- The `@` Mention DSL parser was built into `@cr/core`.
- The CLI (`apps/cli/src/commands/chat.ts`) was refactored to support distinct AI "Gem" profiles (`Architect`, `Coder`) and autonomous **AI-to-AI Hand-offs**.
- We added the **`/exec [cmd]`** runtime capability.
- The programmatic 3-player E2E test (`e2e_multi_agent_runtime.test.ts`) covering these mechanisms passes successfully.

## Next Steps
In this new session, we need to implement the **Live Artefact Generation** flow so the 3-player generative setup can be run live by a user in the terminal, bridging the AI's logic strictly to the local repository. 

Please refer to the updated architecture plans to execute the following:
1. **Artefact Translation**: Update the Gemini schema in `chat.ts` to allow the Coder to output a `files` array. When files are received iteratively, save them to the workspace and automatically trigger `ArtefactManager.createDraft()` to commit the proposal.
2. **Promote Command**: Implement a `/promote` command in the CLI to merge the AI's drafts.
3. **Feature-Specific E2E Scripts**: Build explicit, modular test scenarios for:
   - The Artefact Lifecycle (`e2e_artefact_lifecycle.test.ts`)
   - Session Forking / Cloning logic (`e2e_session_forking.test.ts`)
   - The Daemon Sync offline queuing (`e2e_daemon_sync.test.ts`).
