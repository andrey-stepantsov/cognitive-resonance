# Cognitive Resonance: Phase 9 Handover

You are taking over the **Cognitive Resonance** project at the beginning of **Phase 9: Observability Improvements**. 

## Context & Recent Achievements
In the previous session, we successfully completed **Phase 8 (Asynchronous Cloud Relay)**. 
- We built a local CLI daemon (`serve.ts`) that runs a background sync loop every 5 seconds.
- We added an `events` table to the Cloudflare D1 edge database (`packages/cloudflare-worker/schema.sql`).
- We implemented robust `GET /api/events` and `POST /api/events/batch` REST endpoints securely behind our Cloudflare Worker using the `.cr-cli-token` authentication header.
- The `DatabaseEngine.ts` natively tracks and synchronizes `EventRecord`s efficiently. The SQLite and Cloudflare test suites all pass.

We also conducted an **Observability Architecture Analysis**:
- **Traceability** is solid via the immutable Event-Sourced architecture.
- **CLI Support** is extremely powerful via the `cr observe` commands.
- **Log Retrieval** is currently the weakest link, relying entirely on raw `console.log` output. 

## Your Goal for this Session
You will be implementing **Phase 9**, addressing the observability gaps with structured logging, file rotation, and distributed trace correlation. 

Please review to `implementation_plan.md` in your artifacts directory (which the user has approved) for the detailed step-by-step required. Your tasks are:

**Step 1: Structured Logging & Rotation (CLI)**
1. Install `pino` and `pino-roll` into the `apps/cli` workspace.
2. Implement a `logger.ts` utility that wraps `pino`.
3. Update `serve.ts` and background daemon fetch calls to use the structured JSON logger. Configure it to write to a localized `cr-daemon.log` in the CWD, matching the SQLite database location, with rotation enabled.

**Step 2: Edge Logging & Distributed Tracing**
1. Update `packages/cloudflare-worker/src/index.ts` with a wrapper that normalizes Cloudflare `console.log()` calls so they output strings of JSON payloads, ensuring Cloudflare Log Drains can parse them.
2. Update the CLI daemon background `fetch` loops to generate a `crypto.randomUUID()` and inject it as the `X-Request-Id` header.
3. Update the Cloudflare worker to extract this `X-Request-Id` header and inject it into all contextual edge logs, effectively creating 1:1 trace correlation from local CLI execution to the edge.

Begin execution on Step 1. Ensure `npm run test` remains green!
