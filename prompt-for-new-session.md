# Objective: Phase 4 - The Unified Operating Environment (Documentation & SDK Extraction)

We are beginning **Phase 4** of the Cognitive Resonance and Phantomachine Joint Architecture Roadmap.
Through strategic analysis in the previous session, we identified a massive architectural paradigm shift: The "OS vs App" metaphor is drifting. Instead, Cognitive Resonance and Phantomachine collectively form a single, distributed **Operating Environment (OE)** separated by execution tiers:
* **Tier 1 (T1) - The Serverless Edge (CR):** Handles unstructured human inputs, prompt translations, semantic routing, and ephemeral DB state using fast Cloudflare Workers.
* **Tier 2 (T2) - The CPU Muscle (PH):** Handles CPU-intensive workloads, persistent Docker container sandboxes, heavy log processing, and physical file operations.

Because they are the same OE, they must share the exact same logic SDK.

## Key Requirements for this Session:
1. **Documentation Purge & Alignment:** Aggressively review and rewrite `cr-core-contracts/README.md`, `cr-core-contracts/ROADMAP.md`, and `phantomachine/ai-operating-environment/ARCHITECTURE.md`. You must eradicate the "OS vs App" metaphor and explicitly define the **T1/T2 Tiered Execution Architecture**. 
2. **The Unified SDK Refactoring:** Once the documentation accurately defines the OE, transition to `cognitive-resonance/packages/core`. We must surgically extract `Materializer.ts`, `EventReducers.ts`, and `ArtefactManager.ts` out of the CR boundaries and into `cr-core-contracts`, effectively turning the contract package into the universally shared Operating Environment SDK.
3. **Decouple Physical Adapters:** Ensure the extracted `Materializer.ts` uses dependency injection or is pure-math only, decoupling it from Node's explicit `fs` API so it can seamlessly compute the Virtual Filesystem map inside both the Cloudflare Worker (T1) and Phantomachine (T2).

Start by running a `find_by_name` across the ecosystem for `README.md` and `ARCHITECTURE.md` and explicitly correct the conceptual framework before writing code.
