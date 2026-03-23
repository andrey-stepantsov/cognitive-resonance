import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TerminalManager } from '../../packages/terminal-director/src/TerminalManager';
import * as path from 'path';
import * as fs from 'fs';

const CR_ADMIN_BIN = path.join(process.cwd(), 'apps/admin-cli/src/index.ts');
// Hermetic Vault injection
const TEST_VAULT = path.join(process.cwd(), '.cr-admin-e2e-vault');

describe('Decoupled Admin Core Engine E2E', () => {
  const tm = new TerminalManager();

  beforeAll(() => {
    if (fs.existsSync(TEST_VAULT)) fs.rmSync(TEST_VAULT, { recursive: true, force: true });
  });

  afterAll(() => {
    tm.killAll();
    if (fs.existsSync(TEST_VAULT)) fs.rmSync(TEST_VAULT, { recursive: true, force: true });
  });

  it('cr-admin genesis: strictly provisions cryptographic root safely offline', async () => {
    // We strictly use npx direct invocation to bypass bash -c hang issues in node-pty
    const term = tm.spawn('admin-genesis', 'npx', ['tsx', CR_ADMIN_BIN, 'genesis', '--email', 'e2e@cr.local', '--passphrase', 'hermetic_passphrase'], {
      env: { ...process.env, CR_ADMIN_VAULT: TEST_VAULT }
    });
    
    // Fallback to 3000ms ensures we don't hold the test worker hostage forever on fail
    const exitCode = await term.waitForExit(30000);
    const output = term.getBuffer();
    console.log('DIAGNOSTIC OUTPUT:', output);
    
    expect(exitCode).toBe(0);
    expect(output).toContain('GENESIS BOOTSTRAP');
    expect(output).toContain('YOUR 2FA SECRET');
    expect(output).toContain('INSERT INTO global_admins');
    
    // Evaluate exact side-effects
    const keyFile = path.join(TEST_VAULT, 'id_ed25519.enc');
    expect(fs.existsSync(keyFile)).toBe(true);
    
    const fileStats = fs.statSync(keyFile);
    // Strict linux permissions check (if supported by OS)
    if (process.platform === 'linux' || process.platform === 'darwin') {
        const mode = fileStats.mode & 0o777;
        expect(mode).toBe(0o600); // Owner r/w exclusively
    }
  });
});
