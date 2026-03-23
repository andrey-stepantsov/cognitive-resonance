# Context
We are progressing through the phases of the 100% physically decoupled Admin Management Application for Cognitive Resonance.

In the previous session, we successfully accomplished the following:
1.  **`cr-admin login` Implementation**: We fully implemented the CLI login loop inside `apps/admin-cli/src/index.ts`. It securely prompts for the user's Vault Passphrase, mathematically signs a stateless JWT challenge (`nonce`) using Native Node `crypto` (`ed25519`), and retrieves a Zero-Trust Session JWT from the Admin Worker, saving it locally in `~/.cr-admin/vault/session.jwt` with strict file permissions.
2.  **Environment Backend Scaffolding**: We created `apps/admin-worker/src/environments.ts` and set up the `/api/environments` endpoints (GET, POST, DELETE). We introduced a highly-optimized Web Crypto `verifyJwt` middleware that actively guards these endpoints ensuring only admins with `superadmin` or `env_admin` RBAC roles can manipulate environment states in the D1 database.
3.  **Flaky Test Remediation**: We resolved intermittent locking issues in `tests/e2e/portability.test.ts` across the `tests/e2e` suite by configuring `vitest` to disable file parallelism, preventing test workers from sharing the `e2e-test.sqlite` database simultaneously.

# Objective
Our immediate next steps in Phase 3 of the Execution Plan are:

1.  **Implement CLI Environment Commands**: We need to expand `apps/admin-cli/src/index.ts` (or create a dedicated `commands/env.ts` module) to allow the root administrator to interact with the backend API. 
    * Add commands for: `cr-admin env list`, `cr-admin env provision <name> <type>`, and `cr-admin env destroy <name>`.
    * Ensure the CLI securely reads the `session.jwt` from the Vault and passes it as a Bearer token in the Authorization header.

2.  **Cloudflare API Action Handlers**: Navigate back to `apps/admin-worker/src/environments.ts` and modify the endpoints to run real infrastructure orchestrations using the Cloudflare API. We need it to natively spin up (or tear down) actual D1 databases, Vectorize indexes, and KV namespaces per environment.

3.  **Comprehensive E2E Testing**: Construct robust `TerminalManager`-based tests encompassing both the `cr-admin login` command flow and the new `cr-admin env` operations safely locally. Ensure the test coverage remains safely above 95%.

Please begin by reviewing the `apps/admin-cli/src/index.ts` file and jump into implementing the `env` CLI commands!
