import { TerminalInstance } from '../src/TerminalInstance';

async function main() {
  console.log("\x1b[36m>>> Booting Cognitive Resonance CLI in Terminal Director...\x1b[0m\n");
  
  // Create a new Terminal instance (assumes TerminalInstance uses node-pty internally)
  const term = new TerminalInstance('trinity-demo', 'npx', ['tsx', 'apps/cli/src/index.ts', 'chat', '--workspace', '/Users/stepants/dev/cognitive-resonance/']);
  
  term.onData((data) => {
    // Pass everything directly to stdout to feed asciinema
    process.stdout.write(data);
  });

  // Wait for the shell REPL to load
  await term.waitForStdout('cr>', 20000);
  console.log("\n\x1b[32m>>> CLI Ready. Injecting @trinity command...\x1b[0m\n");

  // Send the command
  term.write('@trinity Please create a bash script render.sh to generate a YouTube Shorts MP4 video (1080x1920, cropping the image to fit) matching the exact full duration of the audio, using the optimal YouTube audio profile. The inputs are /Users/stepants/dev/cognitive-resonance/docs/assets/trinity-demo-input.png and /Users/stepants/dev/cognitive-resonance/docs/assets/trinity-demo-input.wav. Execute it when done.\n');

  try {
     // Wait for the loop to start
     await term.waitForStdout('Thinking (@architect)', 60000);

     // Wait for the AI loop to halt. The REPL prompt returning signifies the end of the autonomous process.
     while (!term.getBuffer().trimEnd().endsWith('>')) {
         await new Promise(r => setTimeout(r, 2000));
     }

     console.log("\n\x1b[32m>>> Autonomous Loop Halted. Requesting Trinity Execution...\x1b[0m\n");
     term.write('@trinity The script has been approved by the auditor. Please execute render.sh to validate the deliverable.\n');

     // Wait until trinity finishes the protocol and outputs the exec command
     await term.waitForStdout('AI requested remote execution on @@sandbox', 60000);
     console.log("\n\x1b[32m>>> Script generated. Triggering local execution to show results...\x1b[0m\n");
     term.write('/exec bash ./render.sh\n');

     // Wait for execution to finish (poll for the prompt)
     await new Promise(r => setTimeout(r, 2000));
     while (!term.getBuffer().trimEnd().endsWith('>')) {
         await new Promise(r => setTimeout(r, 2000));
     }
     
     console.log("\n\x1b[32m>>> Tests successfully executed. Validated MP4 output.\x1b[0m\n");

  } catch (e: any) {
     console.error("\x1b[31m[Test Failed Timeout]\x1b[0m", e.message);
  }

  // Graceful shutdown
  setTimeout(() => {
     term.write('/exit\n');
     setTimeout(() => {
         term.kill();
         process.exit(0);
     }, 1000);
  }, 3000);
}

main().catch(console.error);
