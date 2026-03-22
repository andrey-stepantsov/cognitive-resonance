# Cognitive Resonance: SRE Persona & Operator Enhancements

In the previous session, we successfully designed the architecture for the `@SRE` (Site Reliability Engineer) persona and finalized the remaining observability requirements for the `@Operator` persona. Our previous CI/CD provisioning work was also successfully merged and tested on the edge.

Your goal for this session is to step straight into **EXECUTION** mode to implement the SRE roadmap we just designed.

## 1. Operator Observability Finalization
- Implement the `flushEdgeCache` tool in `packages/cloudflare-worker/src/aiService.ts`.
- Ensure it is strictly bound to the `SECRET_SUPER_ADMIN_IDS` RBAC check inside `processAiQueueJob`.

## 2. SRE Persona Initialization
- Create a dedicated `packages/cloudflare-worker/src/sreService.ts` to house complex analytical D1 queries (preventing bloat in `aiService.ts`).
- Implement the following core SRE capabilities:
  - `forecastInferenceCosts()`: Aggregate the `estimated_tokens` column from `sessions` over a 30-day trailing window.
  - `detectAbusePatterns()`: Scan `bot_logs` for high-frequency 401/429 status codes to flag potential abuse.
  - `auditZombieKeys()`: Identify unused API keys in `api_keys` where `last_used_at < (Now - 90 Days)`.
- **Router Integration:** Update the Sync Daemon in `index.ts` to intercept `@sre` mentions in Human messages, pushing them to the AI Queue just like `@guide` and `@operator`.

## 3. SRE AI Quality Assurance (Red Teaming)
- Implement `evaluateAgentAccuracy(agentId)`: Have the SRE fetch recent `events` where the actor is the `@Guide`. The SRE should blindly re-run the user's prompt through the Vectorize DB (getting the factual RAG payload) and then have its LLM instance compare the actual Guide's response against the true RAG payload to generate a dissonance/accuracy score.

## Resources to Review
- The full architectural and systemic design specifications are located in `docs/design-guide-operator-personas.md` (specifically Section 3 regarding the `@SRE`).
- Write robust D1 mock unit tests in `src/__tests__/sreService.test.ts` to validate the analytical queries.

Please read the design document and begin implementation!
