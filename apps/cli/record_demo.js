const { spawn } = require('child_process');
const { writeFileSync, existsSync, mkdirSync } = require('fs');
const { join } = require('path');

const command = process.execPath;
const args = ['bin/cr.js', '-d', 'cr-demo.sqlite'];

const term = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe']
});

let output = '';
let step = 0;

const handleData = (data) => {
    const text = data.toString();
    output += text;
    process.stdout.write(text);
    
    if (text.includes('cr> ')) {
        if (step === 0) {
            step = 1;
            setTimeout(() => {
                output += 'Hello Cognitive Resonance! Please give me a 1-sentence introduction of who you are.\n';
                process.stdout.write('Hello Cognitive Resonance! Please give me a 1-sentence introduction of who you are.\n');
                term.stdin.write('Hello Cognitive Resonance! Please give me a 1-sentence introduction of who you are.\n');
            }, 1000);
        } else if (step === 1) {
            step = 2;
            setTimeout(() => {
                output += '/model\n';
                process.stdout.write('/model\n');
                term.stdin.write('/model\n');
            }, 2000);
        } else if (step === 2) {
            step = 3;
            setTimeout(() => {
                output += '/exit\n';
                process.stdout.write('/exit\n');
                term.stdin.write('/exit\n');
            }, 2000);
        }
    }
};

term.stdout.on('data', handleData);
term.stderr.on('data', handleData);

term.on('close', (code) => {
    console.log(`\n\nProcess exited with code ${code}`);
    const artifactPath = '/Users/stepants/.gemini/antigravity/brain/33971401-8a0a-4c4a-9d11-ad1c614f972d/cli_demo_transcript.md';
    writeFileSync(artifactPath, '# CLI Recording Transcript\n\n```text\n' + output + '\n```\n');
    process.exit(0);
});
