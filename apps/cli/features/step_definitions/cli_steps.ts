import { Given, Then, Before, After } from '@cucumber/cucumber';
import { TerminalManager, TerminalInstance } from '@cr/terminal-director';
import assert from 'node:assert';
import path from 'path';

let terminalManager: TerminalManager;
let currentTerm: TerminalInstance | undefined;

Before(() => {
  terminalManager = new TerminalManager();
});

After(() => {
  terminalManager.killAll();
  currentTerm = undefined;
});

Given('the CLI is executed with the {string} flag', async function (flag: string) {
  // We use tsx to execute the unbuilt TypeScript source from apps/cli for our tests
  const cliEntryPoint = path.resolve(__dirname, '../../src/index.ts');
  const cliCwd = path.resolve(__dirname, '../../');
  
  currentTerm = terminalManager.spawn(
    'cli-test', 
    'npx', 
    ['tsx', cliEntryPoint, flag],
    { cwd: cliCwd }
  );
  
  // Wait a moment for the process to actually boot and flush output
  // We don't strictly need this because waitForStdout will poll, but it ensures process stability
  await new Promise(resolve => setTimeout(resolve, 500));
});

Then('the terminal output should contain {string}', async function (expectedText: string) {
  assert(currentTerm, 'No terminal instance is currently running.');
  
  try {
    // We leverage our robust TerminalInstance.waitForStdout to gracefully await the output string
    const found = await currentTerm.waitForStdout(expectedText, 5000);
    assert(found, `Expected output to contain "${expectedText}".`);
  } catch (err: any) {
    const buffer = currentTerm.getBuffer();
    assert.fail(`Timeout waiting for "${expectedText}". Actual output buffer:\n\n${buffer}`);
  }
});
