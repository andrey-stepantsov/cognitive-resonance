# Objective: Implement the Trinity Facade and Skill Library

## Context
In the previous session, we successfully engineered the foundational Multi-Agent Handoff sequence (`@Architect` -> `@Coder` -> `@Auditor`) for executing complex FFmpeg video generations, and verified the local loop logic. 

We then holistically designed the next architectural step: **The Orchestrator Facade**. 
1. **The `@trinity` Facade:** Abstracting the agent hierarchy so the user only interacts with a single project manager.
2. **Deliverables over Drafts:** Ensuring the AI natively executes the draft (e.g. `@@sandbox(exec...)`) to physically produce testing deliverables, rather than just virtual proposals.
3. **Declarative Skills:** Moving cumbersome `while-loop` orchestration state machines out of the CLI engine (`chat.ts`) and defining them natively in a `.agents/skills/` paradigm.
4. **Continuous Learning:** Providing `@trinity` with Pre-Flight RAG discovery targeting existing skills, and Post-Flight synthesis to write new `.agents/blueprints/` when novel solutions are generated.

The architecture for this was deeply formalized and committed in `docs/design-trinity-architecture.md` and Phase 15 of `docs/proj-roadmap.md`.

## Next Steps for the New Session
1. **Initialize the Skill Library:** Author `.agents/skills/trinity_genesis/SKILL.md` to formally define the phase-gated execution protocol.
2. **The Facade Profile:** Update `apps/cli/src/services/GemRegistry.ts` to implement the `@trinity` persona, instructing it to utilize the Skill library.
3. **Pre-Flight Discovery:** Wire the CLI's existing semantic Vectorize search pipeline into `chat.ts` so `@trinity` passively queries local skills before bouncing context to the Architect.
4. **Validate Delivery:** End-to-end test a complex generation where Trinity actually *executes* and validates the resulting deliverable prior to returning completion.
