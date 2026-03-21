import { spawnSync } from 'child_process';
import { TerminalInstance } from '@cr/terminal-director';

// 1. Setup Phase
console.log('--- Setting up workspace ---');
spawnSync('mkdir', ['-p', '/tmp/cr-manual-test/source-repo'], { stdio: 'inherit' });
spawnSync('mkdir', ['-p', '/tmp/cr-manual-test/export-repo'], { stdio: 'inherit' });

// Clone the http-server repo into source-repo
spawnSync('git', ['clone', '--depth', '1', 'https://github.com/http-party/http-server.git', '.'], {
  cwd: '/tmp/cr-manual-test/source-repo',
  stdio: 'inherit'
});

async function main() {
  console.log('\n--- Step 1: cr import ---');
  const importInstance = new TerminalInstance('import', 'node', [
    'apps/cli/bin/cr.js',
    'import',
    '/tmp/cr-manual-test/source-repo',
    '-s',
    'manual-test-session'
  ]);

  importInstance.onData((data) => process.stdout.write(data));
  const imported = await importInstance.waitForStdout('Materialization complete', 15000)
      .catch(() => importInstance.waitForStdout('Import complete', 15000))
      .catch(() => true); // fallback

  // Give it a moment to stabilize
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('\n--- Step 2: cr chat ---');
  const chatInstance = new TerminalInstance('chat', 'node', [
    'apps/cli/bin/cr.js',
    'chat',
    '-s',
    'manual-test-session'
  ]);

  chatInstance.onData((data) => process.stdout.write(data));

  // Wait for the prompt ">>>" or similar startup prompt
  await chatInstance.waitForStdout('>>>', 10000).catch(() => {});

  // Send the AI prompt
  const focusPrompt = "Please modify @public/index.html and change the <h1> header text to read: 'Serving up files from Cognitive Resonance!'\n";
  await chatInstance.typeHuman(focusPrompt, 40);

  // Wait for the AI output to complete (e.g. back to prompt)
  await chatInstance.waitForStdout('>>>', 60000).catch(() => {});
  
  // Emulate Ctrl+C to exit chat
  chatInstance.write('\x03');
  await new Promise(resolve => setTimeout(resolve, 1000));
  chatInstance.kill();

  console.log('\n--- Step 3: cr export ---');
  const exportInstance = new TerminalInstance('export', 'node', [
    'apps/cli/bin/cr.js',
    'export',
    '/tmp/cr-manual-test/export-repo',
    '-s',
    'manual-test-session'
  ]);

  exportInstance.onData((data) => process.stdout.write(data));
  await exportInstance.waitForStdout(/Export complete|Materialization complete/, 15000).catch(() => true);
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('\n--- Demo Recording Finished ---');
}

main().catch(err => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});
