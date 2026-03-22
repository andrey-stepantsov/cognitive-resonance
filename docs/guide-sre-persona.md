# SRE Persona: Site Reliability Engineer User Guide

The **`@SRE`** (Site Reliability Engineer) persona is a specialized, highly privileged AI agent integrated natively into Cognitive Resonance. While the `@Operator` persona acts as tactical "Air Traffic Control" for day-to-day state mutation and self-service management, the `@SRE` operates strategically, focused on deep system analysis, trend forecasting, and automated security auditing.

> [!WARNING]
> Because the SRE persona possesses access to sensitive cross-tenant telemetry and billing data, it is **strictly limited to Master Admins** who hold the `SECRET_SUPER_ADMIN_IDS` cryptographic clearance at the Edge. Standard users attempting to invoke `@SRE` will be met with a restricted agent lacking functional tool chains.

## Invoking the SRE Persona

You can invoke the SRE agent from within any CLI interactive REPL session, the browser PWA, or a bridged Telegram chat. 

Simply tag the agent in your prompt as a Master Admin:
```text
@SRE Could you please run a security audit on our inactive API keys?
```

## Core Analytical Capabilities

The `@SRE` persona natively integrates with Cloudflare D1 analytics routing via a dedicated `sreService`. It performs the following distinct functions:

### 1. Advanced Cost Forecasting (`forecastInferenceCosts`)
When requested to examine billing or infrastructure scaling, the `@SRE` leverages this tool to aggregate the total `estimated_tokens` generated platform-wide over a **trailing 30-day window**. It dynamically extrapolates baseline compute to yield a projected monthly Gemini API cost estimate, helping you stay ahead of budgeting constraints.

*Example Prompt:* `"@SRE What is our projected token spend for the month?"*

### 2. Abuse Pattern Detection (`detectAbusePatterns`)
This is a critical automated auditing function. The `@SRE` scans historical Edge traffic logs over the prevailing 24 hours, searching specifically for high-frequency failures such as continuous `401 Unauthorized` or `429 Too Many Requests` status codes. It returns a ranked list of potentially malicious or misconfigured IP addresses for admin review.

*Example Prompt:* `"@SRE Run an anomaly scan on the bot logs for the last 24 hours."*

### 3. Key Rotation Compliance (`auditZombieKeys`)
To maintain strict data security hygiene, you can ask the SRE to flag unused access credentials. This tool identifies any Edge API Key mapping sitting inactive where the `last_used_at` timestamp is null or older than 90 days, enabling aggressive pruning of legacy access vectors.

*Example Prompt:* `"@SRE Identify any zombie api keys we should deprecate."*

## AI Quality Assurance (Red Teaming)

In addition to pure telemetry, the `@SRE` acts as an automated "Red Team" against its peer architectures.

### `evaluateAgentAccuracy`
This advanced pipeline fetches recent conversational interactions conducted by the **`@Guide`** persona. The `@SRE` blindly pulls the original User Prompt, re-runs it through the actual Vectorize RAG pipeline independently to retrieve explicit ground-truth factual payload, and assesses what the Guide *actually* replied.

The SRE's LLM engine grades the Guide's accuracy on a scale of 0 to 100 as a `dissonance_score`, where `0` means perfect alignment with documentation, and `100` signifies a pure hallucination. This capability can be orchestrated via headless CI tools to historically spot-check AI alignment regressions.

*Example Prompt:* `"@SRE Can you evaluate the Guide's most recent interaction for hallucinations?"*

---
## Related References
- For an understanding of the architectural underpinnings, see [Design: Guide & Operator Personas](design-guide-operator-personas.md).
- For local system dependencies, review the central [User Guide](guide-user-guide.md).
