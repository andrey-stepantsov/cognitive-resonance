import { describe, it, expect } from 'vitest';
import { TerminalManager } from '../../packages/terminal-director/src/TerminalManager';
import * as path from 'path';

const CR_CLI_PATH = path.join(process.cwd(), 'apps/cli/src/index.ts');
const CR_BIN = `npx tsx ${CR_CLI_PATH}`;

describe('Auth & User Management (cr user / cr admin)', () => {
  const tm = new TerminalManager();
  const TEST_USER = 'e2e-tester@example.com';
  const TEST_NICK = 'e2etester';
  const TEST_PWD = 'securepassword123';

  let registeredUserId = '';

  it('user register: creates a new user successfully', async () => {
    const term = tm.spawn('register', CR_BIN, ['user', 'register', TEST_USER, TEST_NICK, TEST_PWD]);
    const exitCode = await term.waitForExit();
    const output = term.getBuffer();
    
    expect(exitCode).toBe(0);
    const match = output.match(/registered:\s+([a-f0-9\-]+)/i);
    if (match) {
        registeredUserId = match[1];
    }
    tm.killAll();
  });

  it('user register: blocks duplicate registration', async () => {
    const term = tm.spawn('dup-register', CR_BIN, ['user', 'register', TEST_USER, TEST_NICK, TEST_PWD]);
    const exitCode = await term.waitForExit();
    const output = term.getBuffer().toLowerCase();
    
    expect(exitCode).not.toBe(0);
    expect(output).toMatch(/already exists|duplicate|failed/);
    tm.killAll();
  });

  it('user suspend: suspends a registered user', async () => {
    const term = tm.spawn('suspend', CR_BIN, ['user', 'suspend', registeredUserId || TEST_USER]);
    const exitCode = await term.waitForExit();
    expect(exitCode).toBe(0);
    expect(term.getBuffer().toLowerCase()).toContain('suspended');
    tm.killAll();
  });

  it('user set-password: overwrites password hash', async () => {
    const term = tm.spawn('set-pw', CR_BIN, ['user', 'set-password', registeredUserId || TEST_USER, 'newpassword456']);
    const exitCode = await term.waitForExit();
    expect(exitCode).toBe(0);
    expect(term.getBuffer().toLowerCase()).toContain('password updated');
    tm.killAll();
  });

  it('user set-nick: overwrites user nickname', async () => {
    const term = tm.spawn('set-nick', CR_BIN, ['user', 'set-nick', registeredUserId || TEST_USER, 'newe2enick']);
    const exitCode = await term.waitForExit();
    expect(exitCode).toBe(0);
    expect(term.getBuffer().toLowerCase()).toContain('nick updated');
    tm.killAll();
  });

  it('admin users revoke: immediately flags user as 403 Forbidden', async () => {
    const term = tm.spawn('revoke', CR_BIN, ['admin', 'users', 'revoke', TEST_USER]);
    const exitCode = await term.waitForExit();
    // Assuming 0 is success for the CLI command
    expect(exitCode).toBe(0);
    expect(term.getBuffer().toLowerCase()).toContain('revoked');
    tm.killAll();
  });

  it('admin users restore: successfully restores a revoked user', async () => {
    const term = tm.spawn('restore', CR_BIN, ['admin', 'users', 'restore', TEST_USER]);
    const exitCode = await term.waitForExit();
    expect(exitCode).toBe(0);
    expect(term.getBuffer().toLowerCase()).toContain('restored');
    tm.killAll();
  });

  it('admin keys mint: generates tokens', async () => {
    const term = tm.spawn('mint', CR_BIN, ['admin', 'keys', 'mint', TEST_USER]);
    const exitCode = await term.waitForExit();
    expect(exitCode).toBe(0);
    expect(term.getBuffer()).toMatch(/eyJ|token|success/i); // Expect JWT or success
    tm.killAll();
  });

  it('admin bot register & link: BYOB multi-tenant setup', async () => {
    const botTerm = tm.spawn('bot-reg', CR_BIN, ['admin', 'bot', 'register', TEST_USER, '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11']);
    await botTerm.waitForExit();
    
    const linkTerm = tm.spawn('bot-link', CR_BIN, ['admin', 'bot', 'link', TEST_USER, '987654321']);
    const exitCode = await linkTerm.waitForExit();
    
    expect(exitCode).toBe(0);
    expect(linkTerm.getBuffer().toLowerCase()).toContain('link');
    tm.killAll();
  });
});
