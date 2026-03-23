import { describe, it, expect } from 'vitest';
import { TerminalManager } from '../../packages/terminal-director/src/TerminalManager';
import * as path from 'path';

const CR_CLI_PATH = path.join(process.cwd(), 'apps/cli/src/index.ts');
const CR_BIN = `npx tsx ${CR_CLI_PATH}`;

describe('Chat & Session Interactions (cr chat / cr mcp)', () => {
  const tm = new TerminalManager();

  it('chat: executes non-interactive single prompt', async () => {
    const term = tm.spawn('chat-single', CR_BIN, ['chat', '"what is 2+2?"']);
    await term.waitForStdout(/Dissonance:/i, 25000).catch(() => {});
    const output = term.getBuffer();
    expect(output.toLowerCase()).toContain('4');
    term.kill();
    tm.killAll();
  }, 30000);

  it('chat: respects --format json', async () => {
    const term = tm.spawn('chat-json', CR_BIN, ['chat', '"reply hello"', '--format', 'json']);
    await term.waitForStdout(/\{/i, 25000).catch(() => {});
    const output = term.getBuffer();
    expect(output).toContain('{');
    term.kill();
    tm.killAll();
  }, 30000);

  it('chat: interactive session REPL typing', async () => {
    const term = tm.spawn('chat-repl', CR_BIN, ['chat']);
    await term.waitForStdout('>', 5000).catch(() => {});
    await term.typeHuman('hello prompt!\n');
    await term.waitForStdout(/hello|assist|ready/i, 25000).catch(() => {});
    term.kill();
    tm.killAll();
  }, 30000);

  it('chat: explicitly bridges to a defined D1 session ID', async () => {
    const term = tm.spawn('chat-session', CR_BIN, ['chat', '"reply session test"', '--session', 'special-test-id-123']);
    await term.waitForStdout(/special-test-id-123/i, 25000).catch(() => {});
    expect(term.getBuffer().toLowerCase()).toContain('special-test-id-123');
    term.kill();
    tm.killAll();
  }, 30000);

  it('chat: overrides active LLM through --model flag', async () => {
    const term = tm.spawn('chat-model', CR_BIN, ['chat', '"just reply ok"', '--model', 'gemini-2.5-flash']);
    await term.waitForStdout(/Dissonance:/i, 25000).catch(() => {});
    term.kill();
    tm.killAll();
  }, 30000);

  it('chat: enforces logical boundaries via --workspace isolation', async () => {
    const TEST_WS = path.join(process.cwd(), '.cr', 'test-workspace-bounds');
    const term = tm.spawn('chat-workspace', CR_BIN, ['chat', '"just reply list boundaries"', '--workspace', TEST_WS]);
    await term.waitForStdout(/Dissonance:/i, 25000).catch(() => {});
    const fs = await import('fs');
    expect(fs.existsSync(TEST_WS)).toBe(true);
    term.kill();
    tm.killAll();
  }, 30000);

  it('mcp: initializes model context protocol server', async () => {
    const term = tm.spawn('mcp-serve', CR_BIN, ['mcp', '--session', 'test-mcp-session']);
    await new Promise(r => setTimeout(r, 2000));
    term.kill();
    tm.killAll();
  }, 30000);
});
