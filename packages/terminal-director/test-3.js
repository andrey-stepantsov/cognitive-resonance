const pty = require('node-pty');

console.log("Test 4: process.execPath");
try {
  pty.spawn(process.execPath, ['-e', 'console.log("SUCCESS")'], { name: 'xterm-color', cols: 80, rows: 24, cwd: process.cwd() });
  console.log("SPAWN WORKED");
} catch (e) {
  console.error(e.message);
}
