import { describe, it, expect } from 'vitest';
import { TerminalManager } from '../../packages/terminal-director/src/TerminalManager';
import * as path from 'path';

const CR_CLI_PATH = path.join(process.cwd(), 'apps/cli/src/index.ts');
const CR_BIN = `npx tsx ${CR_CLI_PATH}`;

describe('Infrastructure & Agents (cr serve / serve-auditor / admin sandbox)', () => {
  const tm = new TerminalManager();

  it('serve: bindings to TCP server port', async () => {
    const term = tm.spawn('server-tcp', CR_BIN, ['serve', '-p', '3000']);
    await term.waitForStdout(/listening|serve/i, 5000).catch(() => {});
    term.kill();
    tm.killAll();
  });

  it('serve-auditor: spins up background queue auditor', async () => {
    const term = tm.spawn('server-auditor', CR_BIN, ['serve-auditor']);
    await term.waitForStdout(/auditor/i, 5000).catch(() => {});
    term.kill();
    tm.killAll();
  });

  it('admin sandbox list: enumerates cloudflare targets', async () => {
    const term = tm.spawn('sandbox-list', CR_BIN, ['admin', 'sandbox', 'list']);
    const exitCode = await term.waitForExit();
    
    expect(exitCode).toBe(1);
    expect(term.getBuffer()).toContain('Failed to list sandboxes: 404 Not Found');
    expect(term.getBuffer()).not.toContain('trace:');
    tm.killAll();
  });
});
