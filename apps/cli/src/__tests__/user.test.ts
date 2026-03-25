import { describe, it, expect, vi } from 'vitest';
import { Command } from 'commander';
import { registerUserCommands } from '../commands/user';

// Mock DB Engine
vi.mock('../db/DatabaseEngine.js', () => ({
  DatabaseEngine: vi.fn().mockImplementation(() => ({
    upsertUser: vi.fn(),
    getUserById: vi.fn().mockReturnValue({ id: 'test', status: 'active' }),
    createSession: vi.fn(),
    appendEvent: vi.fn(),
    close: vi.fn()
  }))
}));

// Mock API
vi.mock('../utils/api.js', () => ({
  backendFetch: vi.fn().mockResolvedValue({ ok: true })
}));

describe('User CLI Commands Unit Tests', () => {
  let originalConsoleLog: any;

  beforeAll(() => {
    originalConsoleLog = console.log;
    console.log = vi.fn();
  });

  afterAll(() => {
    console.log = originalConsoleLog;
  });

  it('device pair generates expected computational output', async () => {
    const program = new Command();
    program.exitOverride();
    registerUserCommands(program);

    await program.parseAsync(['node', 'test', 'user', 'device', 'pair', 'dev-123']);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('✅ Successfully paired new device: dev-123'));
  });

  it('device chain-recover generates expected output', async () => {
    const program = new Command();
    program.exitOverride();
    registerUserCommands(program);

    await program.parseAsync(['node', 'test', 'user', 'device', 'chain-recover']);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('✅ Chain-recovery completed!'));
  });
});
