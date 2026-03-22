import { TerminalInstance } from '../src/TerminalInstance';

async function main() {
  console.log("Starting Trinity Test...");
  const term = new TerminalInstance('trinity-1', 'npx', ['tsx', 'apps/cli/src/index.ts', 'chat', '--workspace', '/tmp/cr-trinity-test']);
  
  term.onData((data) => {
    process.stdout.write(data);
  });

  await term.waitForStdout('cr> ', 15000);
  console.log("\n>>> Terminal Ready. Injecting Prompt...");

  term.write('@architect Create a bash script that takes a .wav file and a .png file and uses FFmpeg to render a perfectly compressed YouTube video. Please use libx264, yuv420p, and the optimal YouTube audio encoding profile.\n');

  // Let it run for 120 seconds to allow the agents to chat
  setTimeout(() => {
     console.log("\n>>> Test timeout reached. Exiting.");
     term.write('/exit\n');
     term.kill();
     process.exit(0);
  }, 120000);
}

main().catch(console.error);
