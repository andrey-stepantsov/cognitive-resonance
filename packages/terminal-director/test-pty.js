const pty = require('node-pty');

console.log("Test 1: raw process.env");
try {
  pty.spawn('/bin/bash', [], { env: process.env });
  console.log("SUCCESS");
} catch (e) {
  console.error(e.message);
}

console.log("\nTest 2: spread process.env");
try {
  pty.spawn('/bin/bash', [], { env: { ...process.env, TEST: '1' } });
  console.log("SUCCESS");
} catch (e) {
  console.error(e.message);
}

console.log("\nTest 3: filtered env");
try {
  const safeEnv = {};
  for (const k in process.env) {
    if (process.env[k] !== undefined) safeEnv[k] = String(process.env[k]);
  }
  safeEnv.TEST = '1';
  pty.spawn('/bin/bash', [], { env: safeEnv });
  console.log("SUCCESS");
} catch (e) {
  console.error(e.message);
}
