const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-temp-'));
const dbPath = path.join(tempDir, 'test.sqlite');
const DatabaseEngine = require('./src/db/DatabaseEngine').DatabaseEngine;

let db = new DatabaseEngine(dbPath);
const sessionId = db.createSession('E2E_USER', 'test-session');
db.appendEvent({ session_id: sessionId, timestamp: Date.now(), actor: 'SYSTEM', type: 'INIT', payload: '{}', previous_event_id: null });

// Print db options
console.log('db size:', fs.statSync(dbPath).size);
let out1 = execSync(`node bin/cr.js turns ${sessionId} -d ${dbPath}`, { encoding: 'utf8', stdio: 'pipe' });
console.log('out1:', out1);

db.close();

let out2 = execSync(`node bin/cr.js turns ${sessionId} -d ${dbPath}`, { encoding: 'utf8', stdio: 'pipe' });
console.log('out2:', out2);
