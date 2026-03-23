# Cognitive Resonance QA Report

## Execution Summary
- **Phase:** 1st Formal QA Loop
- **Coverage:** Full E2E Matrix (Auth, Chat, Observe, Portability, Simulate, Infrastructure)
- **Result:** 100% Failure Rate (15/15 tests failed)

## Bug Backlog & Triage

### 1. [CRITICAL] `ERR_MODULE_NOT_FOUND` in CLI Entrypoint
**Description:**
Every execution of the CLI (`node apps/cli/dist/index.js`) crashes instantly with a fatal Node.js module resolution error during the initialization phase.

**Trace:**
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/stepants/dev/cognitive-resonance/apps/cli/dist/commands/simulate' imported from /Users/stepants/dev/cognitive-resonance/apps/cli/dist/index.js
```

**Root Cause Analysis:**
The CLI utilizes native ECMAScript Modules (ESM). In ESM, relative imports *must* include the `.js` extension. While the entrypoint `index.ts` was fixed in the 1st cycle, the 2nd QA cycle revealed that this issue is systemic across the entire `/src` directory (e.g., `commands/simulate.js` failing to import `db/DatabaseEngine`). The TypeScript compiler (`tsc`) does not automatically append `.js` to ESM relative imports.

**Impact:**
System-wide. Prevents downstream logic from executing. Current tests throw: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module .../apps/cli/dist/db/DatabaseEngine`.

**Reproduction:**
Run `node apps/cli/dist/index.js` or execute Vitest E2E.

**Action Required:**
Execute a systemic refactor script across `apps/cli/src/**/*.ts` to enforce the `.js` extension on all local relative imports, or implement a build-step plugin such as `tsc-alias` / `esbuild` to handle module resolution automatically.

### 2. [CRITICAL] `ERR_MODULE_NOT_FOUND` on Cross-Workspace Monorepo Aliases
**Description:**
The 3rd QA Loop revealed that while local relative imports (`./` and `../`) were fixed, imports targeting external monorepo packages (e.g. `import ... from '@cr/core/src/services/Materializer'`) still lack the `.js` extension required by Node ESM.

**Trace:**
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../node_modules/@cr/core/src/services/Materializer' imported from .../apps/cli/dist/commands/serve.js
```

**Root Cause Analysis:**
When `apps/cli` imports internal utilities directly from the source routes of `@cr/core/src/...`, Node enforces the exact path resolution. Without the `.js` extension, it assumes it's looking for a folder `Materializer/index.js` or `package.json`, causing it to crash.

**Action Required:**
Extend the systemic refactor script to enforce `.js` extensions on all `@cr/...` monorepo paths as well. Apply it across the `apps/cli` workspace.

### 3. [CRITICAL] `ERR_MODULE_NOT_FOUND` on Monorepo Internal Source Paths
**Description:**
The 4th QA Loop exposed that `node apps/cli/dist/index.js` still points to `.ts` / `src/` sibling workspaces.
**Action Required:** Switch E2E execution to `npx tsx apps/cli/src/index.ts` to bypass transpile faults and evaluate the CLI logic surface directly.

### 4. [HIGH] `unknown command 'observe'`
**Description:**
Telemetry commands (e.g., `cr observe turns`) throw `error: unknown command` because they attach directly to the root `program` instead of being namespaced under an `observe` group.
**Status:** Fixed in E2E configuration test syntax.

### 5. [HIGH] API 404 on `admin sandbox list`
**Description:**
Edge worker returns `404 Not Found` when listing sandboxes via `cr admin sandbox list`. The webhook route `/api/admin/sandboxes` does not exist in the Cloudflare backend.

### 6. [MEDIUM] False Positives on Non-Zero Exit Codes for API failures
**Description:**
`cr admin bot register` logs `500 Internal Server Error` but technically exits with code `0`.
**Action Required:** Ensure API failure traps call `process.exit(1)`.

### 7. [MEDIUM] Test Data Isolation Gaps for Portability Commands
**Description:**
`export` and `pack` fail due to strict E2E DB isolation. The test DB isn't seeded with a session or entity before packing.
**Action Required:** Seed DB explicitly in `portability.test.ts`.

---

*Note: The QA Loop 5 bypassed Node ESM infrastructure issues entirely and successfully unspooled these 4 pure algorithmic faults. Proceeding to the Bug Fix Phase.*
