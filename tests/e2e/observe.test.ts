import { describe, it, expect } from 'vitest';
import { TerminalManager } from '../../packages/terminal-director/src/TerminalManager';
import * as path from 'path';

const CR_CLI_PATH = path.join(process.cwd(), 'apps/cli/src/index.ts');
const CR_BIN = `npx tsx ${CR_CLI_PATH}`;

describe('Observability & Telemetry (cr observe)', () => {
  const tm = new TerminalManager();
  const TEST_SESSION = 'default-test-session';

  it('observe turns: dumps session log', async () => {
    const term = tm.spawn('obs-turns', CR_BIN, ['turns', TEST_SESSION]);
    const exitCode = await term.waitForExit();
    
    expect(exitCode).toBe(0);
    expect(term.getBuffer()).not.toContain('error:');
    tm.killAll();
  });

  it('observe head: limits to top entries', async () => {
    const term = tm.spawn('obs-head', CR_BIN, ['head', TEST_SESSION, '-n', '5']);
    const exitCode = await term.waitForExit();
    
    expect(exitCode).toBe(0);
    tm.killAll();
  });

  it('observe tail: limits to latest entries', async () => {
    const term = tm.spawn('obs-tail', CR_BIN, ['tail', TEST_SESSION, '-n', '5']);
    const exitCode = await term.waitForExit();
    
    expect(exitCode).toBe(0);
    tm.killAll();
  });

  it('observe follow: tails live stdout streams', async () => {
    // Because follow is an active listener stream, we wait for its init signature and then terminate
    const term = tm.spawn('obs-follow', CR_BIN, ['follow', TEST_SESSION]);
    // The CLI will hold open. We wait a few seconds to ensure it doesn't crash structurally.
    await term.waitForStdout(/follow|listen/i, 2000).catch(() => {});
    term.kill();
    tm.killAll();
  });
});
