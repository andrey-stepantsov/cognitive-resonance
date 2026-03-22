# Next Session Objective: Dynamic Memory Escalation (Semantic Graph Injection)

## Context
We have just successfully completed the Multi-Tenant BYOB architecture for the Telegram integration. The user's bot can now dynamically route Webhook traffic using D1 tokens.

The goal for this new session is to tackle the "Context Window Limits" problem for long-running conversations. We have designed a new architecture called **Dynamic Memory Escalation** where the system switches from a cheap "Sliding Window" to a dense "Semantic Knowledge Graph" once a chat gets too long.

## Architectural Design
Please review the newly created design document:
- `/Users/stepants/dev/cognitive-resonance/docs/design-dynamic-memory-escalation.md`

## The Plan & User Approvals
The user has reviewed and explicitly approved the following strategies during the last session:
1. **Threshold Tracking:** We will track `estimated_tokens` on the D1 `sessions` table (heuristically calculated via `text.length / 4` during syncs). When this hits ~6,000, we trigger graph compilation.
2. **Schema Migration:** We will run a D1 migration to add `has_graph` (BOOLEAN), `semantic_graph` (JSON text), and `estimated_tokens` (INTEGER) to the `sessions` table.
3. **Structured Output:** We will force Gemini to return the graph via its native `responseSchema` to guarantee 100% valid JSON matching the `semanticNodes` and `semanticEdges` shape.

## Next Steps for the Agent
You are now in **EXECUTION** mode for this feature. 
Please read the design document, formulate your `task.md` checklist based on the planned tasks, and begin executing the code changes in `packages/cloudflare-worker/src/index.ts` and `aiService.ts`.
