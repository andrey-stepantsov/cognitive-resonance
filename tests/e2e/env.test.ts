import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TerminalManager } from '../../packages/terminal-director/src/TerminalManager';
import * as path from 'path';
import * as fs from 'fs';

const CR_ADMIN_BIN = path.join(process.cwd(), 'apps/admin-cli/src/index.ts');
// Hermetic Vault injection
const TEST_VAULT = path.join(process.cwd(), '.cr-admin-env-e2e-vault');

describe('CLI Environment Commands E2E', () => {
  const tm = new TerminalManager();

  beforeAll(() => {
    if (fs.existsSync(TEST_VAULT)) fs.rmSync(TEST_VAULT, { recursive: true, force: true });
    // Provision an offline vault to bypass genesis requirement
    fs.mkdirSync(TEST_VAULT, { recursive: true });
    fs.writeFileSync(path.join(TEST_VAULT, 'id_ed25519.enc'), 'dummy-encrypted-key-for-test', { mode: 0o600 });
  });

  afterAll(() => {
    tm.killAll();
    if (fs.existsSync(TEST_VAULT)) fs.rmSync(TEST_VAULT, { recursive: true, force: true });
  });

  it('cr-admin env list: gracefully fails when no session exists', async () => {
    const term = tm.spawn('env-list-fail', 'npx', ['tsx', CR_ADMIN_BIN, 'env', 'list'], {
      env: { ...process.env, CR_ADMIN_VAULT: TEST_VAULT }
    });
    
    const exitCode = await term.waitForExit(15000);
    const output = term.getBuffer();
    
    expect(exitCode).not.toBe(0);
    expect(output).toContain('No active session found');
  });

  it('cr-admin env provision: gracefully fails when no session exists', async () => {
    const term = tm.spawn('env-prov-fail', 'npx', ['tsx', CR_ADMIN_BIN, 'env', 'provision', 'test-env', 'standard'], {
      env: { ...process.env, CR_ADMIN_VAULT: TEST_VAULT }
    });
    
    const exitCode = await term.waitForExit(15000);
    const output = term.getBuffer();
    
    expect(exitCode).not.toBe(0);
    expect(output).toContain('No active session found');
  });

  it('cr-admin env list: attempts to contact worker when session exists (handles network error)', async () => {
    // Inject a dummy session token
    fs.writeFileSync(path.join(TEST_VAULT, 'session.jwt'), 'dummy.xyz.123', { mode: 0o600 });

    const term = tm.spawn('env-list-net', 'npx', ['tsx', CR_ADMIN_BIN, 'env', 'list', '--url', 'http://localhost:8787'], {
      env: { ...process.env, CR_ADMIN_VAULT: TEST_VAULT }
    });
    
    const exitCode = await term.waitForExit(15000);
    const output = term.getBuffer();
    
    // It should fail due to dummy token / network err, but the CLI should parse the command normally
    expect(output).toMatch(/Network error|Failed to list environments/);
  });
  it('cr-admin env preflight: attempts to contact worker when session exists (handles network error)', async () => {
    const term = tm.spawn('env-preflight', 'npx', ['tsx', CR_ADMIN_BIN, 'env', 'preflight', 'test-env', '--url', 'http://localhost:8787'], {
      env: { ...process.env, CR_ADMIN_VAULT: TEST_VAULT }
    });
    
    const exitCode = await term.waitForExit(15000);
    const output = term.getBuffer();
    
    expect(output).toMatch(/Network error|Preflight check failed/);
  });

  it('cr-admin env lockdown: attempts to contact worker when session exists (handles network error)', async () => {
    const term = tm.spawn('env-lockdown', 'npx', ['tsx', CR_ADMIN_BIN, 'env', 'lockdown', 'test-env', '--url', 'http://localhost:8787'], {
      env: { ...process.env, CR_ADMIN_VAULT: TEST_VAULT }
    });
    
    const exitCode = await term.waitForExit(15000);
    const output = term.getBuffer();
    
    expect(output).toMatch(/Network error|Lockdown failed/);
  });
});
