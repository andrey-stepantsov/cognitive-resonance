import * as pty from 'node-pty';
import { writeFileSync } from 'fs';
import { join } from 'path';

const command = 'node';
const args = ['bin/cr.js', '-d', 'cr-demo.sqlite'];

const ptyProcess = pty.spawn(command, args, {
    name: 'xterm-color',
    cols: 80,
    rows: 30,
    cwd: process.cwd(),
    env: process.env
});

let output = '';
let step = 0;

ptyProcess.onData((data) => {
    output += data;
    process.stdout.write(data);
    
    if (data.includes('cr> ') && step === 0) {
        step = 1;
        setTimeout(() => ptyProcess.write('Hello! Can you briefly introduce what you do?\r'), 500);
    } else if (data.includes('cr> ') && step === 1) {
        step = 2;
        setTimeout(() => ptyProcess.write('/model\r'), 500);
    } else if (data.includes('cr> ') && step === 2) {
        step = 3;
        setTimeout(() => ptyProcess.write('/exit\r'), 500);
    }
});

ptyProcess.onExit(({ exitCode }) => {
    console.log(`\n\nProcess exited with code ${exitCode}`);
    writeFileSync(join(__dirname, '../../../../.gemini/antigravity/brain/33971401-8a0a-4c4a-9d11-ad1c614f972d/cli_demo_transcript.md'), 
        '# CLI Recording Transcript\n```ansi\n' + output + '\n```\n');
    process.exit(0);
});
