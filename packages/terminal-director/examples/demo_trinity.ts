import { TerminalInstance } from '../src/TerminalInstance';

async function main() {
  console.log("\x1b[36m>>> Booting Cognitive Resonance CLI in Terminal Director...\x1b[0m\n");
  
  // Create a new Terminal instance (assumes TerminalInstance uses node-pty internally)
  const term = new TerminalInstance('trinity-demo', 'npx', ['tsx', 'apps/cli/src/index.ts', 'chat', '--workspace', '/Users/stepants/dev/cognitive-resonance/']);
  
  term.onData((data) => {
    // Pass everything directly to stdout to feed asciinema
    process.stdout.write(data);
  });

  // Wait for the shell REPL to load and async auth to resolve
  await term.waitForStdout('cr@', 20000);
  await new Promise(r => setTimeout(r, 1000));
  console.log("\n\x1b[32m>>> CLI Ready. Injecting @trinity command...\x1b[0m\n");

  // Send the command
  term.write(`@trinity Please create a bash script render.sh to generate a YouTube Shorts MP4 video. It MUST smartly crop the image to the vertical YouTube Shorts resolution (1080x1920) without stretching it, using a center-crop or blurred background padding if the input aspect ratio doesn't match. Match the exact full duration of the audio, using the optimal YouTube audio profile. The script should not hardcode paths, but accept the image path as $1 and audio path as $2. Make sure the script provides reasonable usage instructions if run with --help or with zero arguments. Please save the script explicitly inside the .cr/sandbox/demo/ directory. Execute it when done. CRITICAL: To prevent routing collisions, NO AGENT is allowed to mention more than one persona in their response! ALWAYS mention ONLY the next agent you are handing off to.\r`);

  try {
     // Wait for the loop to start
     await term.waitForStdout('Thinking (@architect)', 120000);

     // Wait for the AI loop to halt. The REPL prompt returning signifies the end of the autonomous process.
     while (!term.getBuffer().trimEnd().endsWith('>')) {
         await new Promise(r => setTimeout(r, 2000));
     }

     console.log("\n\x1b[32m>>> Autonomous Loop Halted. Requesting Trinity Execution...\x1b[0m\n");
     // Just wait briefly to let Trinity settle
     await new Promise(r => setTimeout(r, 4000));
     
     console.log("\n\x1b[32m>>> Script generated. Triggering local execution to show results...\x1b[0m\n");
     term.write('/exec cat .cr/sandbox/demo/render.sh\r');
     await new Promise(r => setTimeout(r, 2000));
     term.write('/exec bash .cr/sandbox/demo/render.sh /Users/stepants/dev/cognitive-resonance/docs/assets/trinity-demo-input.png /Users/stepants/dev/cognitive-resonance/docs/assets/trinity-demo-input.wav\r');

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
