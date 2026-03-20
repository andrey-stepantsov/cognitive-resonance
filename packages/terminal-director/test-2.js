const pty = require('node-pty');

console.log("Test 0: No env override");
try {
  pty.spawn('/bin/bash', [], { name: 'xterm-color', cols: 80, rows: 24, cwd: process.cwd() });
  console.log("SUCCESS");
} catch (e) {
  console.error(e.message);
}
