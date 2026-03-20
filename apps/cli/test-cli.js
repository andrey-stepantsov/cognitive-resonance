const { execSync } = require('child_process');
const tempDir = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'cr-e2e-'));
const dbPath = tempDir + '/test.sqlite';
const DatabaseEngine = require('./src/db/DatabaseEngine').DatabaseEngine;
const db = new DatabaseEngine(dbPath);
const sessionId = db.createSession('E2E_USER', 'test-session');
db.appendEvent({ session_id: sessionId, timestamp: Date.now(), actor: 'SYSTEM', type: 'INIT', payload: '{}', previous_event_id: null });
console.log('db contents:', db.query('SELECT * FROM events'));
console.log('running node bin/cr.js audit test-session --db ' + dbPath);
try {
  let out = execSync(`node bin/cr.js audit test-session --db ${dbPath}`, { encoding: 'utf8' });
  console.log(out);
} catch(e) { console.log(e.stdout, e.stderr); }
