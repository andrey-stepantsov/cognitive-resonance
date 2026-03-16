import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// Abstracted logic for testing since `index.ts` auto-runs `program.parseAsync`
function createMockCli() {
  const program = new Command();
  program.name('cr').version('1.0.0');

  program
    .command('chat <message>')
    .option('-f, --format <type>', 'Output format', 'markdown')
    .action(async (message, options) => {
      // Stub action
    });

  return program;
}

describe('CLI Argument Parser', () => {
  let originalArgv: string[];

  beforeEach(() => {
    originalArgv = process.argv;
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  it('parses chat message correctly', async () => {
    const program = createMockCli();
    let actionArgs: any;
    
    // Override action to capture arguments
    program.commands[0].action(async (message, options) => {
      actionArgs = { message, options };
    });

    await program.parseAsync(['node', 'cr.js', 'chat', 'hello world']);
    
    expect(actionArgs.message).toBe('hello world');
    expect(actionArgs.options.format).toBe('markdown');
  });

  it('respects --format json overrides', async () => {
    const program = createMockCli();
    let actionArgs: any;
    
    program.commands[0].action(async (message, options) => {
      actionArgs = { message, options };
    });

    await program.parseAsync(['node', 'cr.js', 'chat', 'diagnose', '--format', 'json']);
    
    expect(actionArgs.message).toBe('diagnose');
    expect(actionArgs.options.format).toBe('json');
  });
});
