# Design: The `@Guide` & `@Operator` Personas

## Architectural Philosophy: The Ecosystem of Specialists
Cognitive Resonance treats AI as distinct, specialized "Gems" rather than a single monolithic entity. Following our Multi-Agent router logic (Phase 15), we are introducing two new system-level agent personas to assist both end-users and administrators: the **`@Guide`** and the **`@Operator`**. 

This separates *Knowledge Retrieval* from *State Mutation*.

---

## 1. The `@Guide` Persona
**Role:** Knowledge Retrieval & User Onboarding
**Focus:** The system's conceptual educator and documentation expert.
**Access:** Read-Only. Available to all users.

### Core Capabilities
- **Proactive Onboarding:** Triggers automatically on `SESSION_STARTED` to greet new users, offering a brief summary of how to use the CLI/PWA.
- **RAG via Cloudflare Vectorize:** The Guide is equipped with a `queryVectorize` tool that searches embeddings built from the project's `docs/` directory. It can explain architectures, commands, and project history accurately.
- **Conceptual Configuration:** It can output `VFS` diffs proposing changes to local `.env` setups or CLI configurations to help users fix misconfigured environments.

*(Crucially, the `@Guide` cannot perform destructive actions or modify the Cloudflare D1 backend state; it focuses strictly on helping the user navigate the platform and their local setup).*

---

## 2. The `@Operator` Persona
**Role:** System Administration & State Mutation
**Focus:** Managing the database, access keys, and infrastructure. 
**Access:** Available to all users, but *action tools are dynamically injected based on cryptographic RBAC (Role-Based Access Control).*

### The Dynamic Tool Injection Strategy
Every incoming request to the Edge contains the user's Ed25519 identity token (from the Multi-Tenant BYOB architecture). The `@Operator` uses this identity to evaluate what tools to inject into its system prompt before generating a response.

#### A. Standard User Access (Self-Service Administration)
When a regular user summons `@Operator`, the agent receives tools heavily scoped to *only* their `user_id`.
- **`getMyUsageStats()`:** Returns the total tokens consumed, session counts, and memory thresholds for their specific account.
- **`flushMyMemory()`:** Allows the user to ask the system to forcibly clear their session context graph or rewrite their D1 history.
- **`rotateMyApiKeys()`:** Automatically rotates the user's specific LLM keys or Telegram Webhook connections within the D1 `users` table.

#### B. Master Admin Access (Global Administration)
When the system's cryptographically confirmed Master Administrator (the owner) summons `@Operator`, the system prompt expands significantly, injecting highly privileged global tools:
- **`getGlobalMetrics()`:** Returns platform-wide analytics, total inference costs, active user counts, and error rates.
- **`revokeUserAccess(userId)`:** Modifies the `revoked_identities` table to instantly cut off a destructive or compromised user at the Edge.
- **`triggerSystemBackup()` / `flushEdgeCache()`:** Direct infrastructure manipulation, managing the D1 backups or KV configurations.

### Security by Design
This architecture ensures that the LLM generating responses for a regular user physically lacks the JSON schema or execution pathways needed to invoke global admin functions. Even if maliciously jailbroken, the standard user's `@Operator` persona simply does not "know" the `revokeUserAccess` tool exists.

---

## Implementation Roadmap
1. **Vectorize Sinker:** Build a one-off script to parse the Markdown in `docs/` into chunks, embed them via Gemini, and upload them to a Cloudflare Vectorize index.
2. **Setup `@Guide` Gem:** Create `GuideAgent.ts`, providing the `queryVectorize` tool and setting the welcoming System Prompt.
3. **Setup `@Operator` Gem:** Create `OperatorAgent.ts`. Implement the RBAC middleware that parses the inbound `user_id` and selectively pushes either the `AdminTools` array or the `UserTools` array into the model's `tools` payload.
4. **Router Integration:** Hook the new `@` mentions up to the CLI parser to route traffic to these new agents.
