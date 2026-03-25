import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TerminalManager } from '../../packages/terminal-director/src/TerminalManager';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

const CR_CLI_PATH = path.join(process.cwd(), 'apps/cli/src/index.ts');
const CR_BIN = `npx tsx ${CR_CLI_PATH}`;

describe('cr observe - Telemetry & Artefact Monitoring', () => {
  const tm = new TerminalManager();

  beforeAll(async () => {
    const testDirs = ['.cr/test-observe-bounds'];
    for (const dir of testDirs) {
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    tm.killAll();
  });

  it('1. Turn Retrieval & Truncation (head, tail, turns)', async () => {
    const TEST_WS = path.join(process.cwd(), '.cr', 'test-observe-bounds', 'turns');
    if (!fs.existsSync(TEST_WS)) fs.mkdirSync(TEST_WS, { recursive: true });
    const targetDbPath = path.join(TEST_WS, 'cr.sqlite');

    // Seed the database with 10 exact conversational boundaries
    const sqlite3 = await import('better-sqlite3');
    const db = sqlite3.default(targetDbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        actor TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        previous_event_id TEXT,
        sync_status TEXT DEFAULT 'pending'
      );
    `);

    const sessionId = 'test-session-head-tail';
    let prevId: string | null = null;
    let baseTime = Date.now() - 10000;

    for (let i = 1; i <= 5; i++) { // 5 turns = 10 events (USER + AI)
      const uId = `event-u-${i}`;
      db.prepare(`INSERT INTO events (id, session_id, timestamp, actor, type, payload, previous_event_id) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        uId, sessionId, baseTime++, 'USER', 'USER_PROMPT', JSON.stringify({ text: `User turn ${i}` }), prevId
      );
      prevId = uId;

      const aId = `event-a-${i}`;
      db.prepare(`INSERT INTO events (id, session_id, timestamp, actor, type, payload, previous_event_id) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        aId, sessionId, baseTime++, 'System', 'AI_RESPONSE', JSON.stringify({ text: `AI response ${i}`, dissonance: 0 }), prevId
      );
      prevId = aId;
    }
    db.close();

    // Test HEAD (Should get turn 1 and 2, which equals 4 events)
    // Wait, -n 2 means 2 *turns*, so 4 limits in SQL!
    const headExec = await import('child_process').then(cp => require('util').promisify(cp.exec));
    const { stdout: headOut } = await headExec(`${CR_BIN} head ${sessionId} -n 2 -d ${targetDbPath}`);
    expect(headOut).toContain('User turn 1');
    expect(headOut).toContain('AI response 2');
    expect(headOut).not.toContain('User turn 3'); // Truncated!

    // Test TAIL (Should get turn 5)
    const { stdout: tailOut } = await headExec(`${CR_BIN} tail ${sessionId} -n 1 -d ${targetDbPath}`);
    expect(tailOut).toContain('User turn 5');
    expect(tailOut).toContain('AI response 5');
    expect(tailOut).not.toContain('AI response 4');

  }, 15000);

  it('2. Artifact VFS State Analysis (status, ls)', async () => {
    const TEST_WS = path.join(process.cwd(), '.cr', 'test-observe-bounds', 'vfs');
    if (!fs.existsSync(TEST_WS)) fs.mkdirSync(TEST_WS, { recursive: true });
    const targetDbPath = path.join(TEST_WS, 'cr.sqlite');

    const sqlite3 = await import('better-sqlite3');
    const db = sqlite3.default(targetDbPath);
    db.exec(`CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, session_id TEXT, timestamp INTEGER, actor TEXT, type TEXT, payload TEXT, previous_event_id TEXT, sync_status TEXT DEFAULT 'pending');`);

    db.prepare(`INSERT INTO events (id, session_id, timestamp, actor, type, payload, previous_event_id, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'event-art', 'vfs-session', Date.now(), 'System', 'ARTEFACT_PROPOSAL', JSON.stringify({ path: 'virtual_only.txt', patch: 'virtual_text', isFullReplacement: true }), null, 'pending'
    );
    db.close();
    
    const nativeExec = await import('child_process');
    const util = await import('util');
    const execPromise = util.promisify(nativeExec.exec);

    fs.writeFileSync(path.join(TEST_WS, 'rogue_file.txt'), 'rogue content');

    // CR Observe commands compute materializations relative to process.cwd(), so we MUST run natively in the TEST_WS for physical mapping
    const { stdout: statusOut } = await execPromise(`cd ${TEST_WS} && ${CR_BIN} status -d ${targetDbPath}`);
    
    expect(statusOut).toContain('Pending Create (Virtual Only)');
    expect(statusOut).toContain('virtual_only.txt');
    
    // Test LS (which prints the purely virtual tree of the session payload memory)
    const { stdout: lsOut } = await execPromise(`cd ${TEST_WS} && ${CR_BIN} ls vfs-session -d ${targetDbPath}`);
    expect(lsOut).toContain('virtual_only.txt');
    expect(lsOut).not.toContain('rogue_file.txt'); // Because rogue physical file never touched the SQLite events tape

  }, 15000);

  it('3. Event Graph Auditing (Temporal Paradox catch)', async () => {
     const TEST_WS = path.join(process.cwd(), '.cr', 'test-observe-bounds', 'audit');
     if (!fs.existsSync(TEST_WS)) fs.mkdirSync(TEST_WS, { recursive: true });
     const targetDbPath = path.join(TEST_WS, 'cr.sqlite');
 
     const sqlite3 = await import('better-sqlite3');
     const db = sqlite3.default(targetDbPath);
     db.exec(`CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, session_id TEXT, timestamp INTEGER, actor TEXT, type TEXT, payload TEXT, previous_event_id TEXT, sync_status TEXT DEFAULT 'pending');`);

     // Event 1
     db.prepare(`INSERT INTO events (id, session_id, timestamp, actor, type, payload, previous_event_id, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'event-1', 'audit-session', 1000, 'USER', 'USER_PROMPT', '{}', null, 'pending'
     );
     // Event 2 (Paradox! The previous_event_id points to 'missing-event')
     db.prepare(`INSERT INTO events (id, session_id, timestamp, actor, type, payload, previous_event_id, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'event-2', 'audit-session', 1001, 'AI', 'AI_RESPONSE', '{"dissonance":0}', 'missing-event', 'pending'
     );
     // Event 3 (Invalid Payload JSON)
     db.prepare(`INSERT INTO events (id, session_id, timestamp, actor, type, payload, previous_event_id, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'event-3', 'audit-session', 1002, 'AI', 'RUNTIME_OUTPUT', '{"unclosed":0', 'event-2', 'pending'
     );
     db.close();

     const headExec = await import('child_process').then(cp => require('util').promisify(cp.exec));
     const { stdout: auditOut } = await headExec(`${CR_BIN} audit audit-session -d ${targetDbPath}`);
     
     expect(auditOut).toContain('Audit Failed');
     expect(auditOut).toContain('1 temporal paradoxes'); // Event 2 is orphaned mathematically
     expect(auditOut).toContain('1 invalid payloads'); // Event 3 JSON string parses bad
     expect(auditOut).toMatch(/graph TD/); // Mermaid DAG assertion

  }, 15000);

  it('4. Live Execution Stream Tailing (logs)', async () => {
     const TEST_WS = path.join(process.cwd(), '.cr', 'test-observe-bounds', 'logs');
     if (!fs.existsSync(TEST_WS)) fs.mkdirSync(TEST_WS, { recursive: true });
     const targetDbPath = path.join(TEST_WS, 'cr.sqlite');
 
     const sqlite3 = await import('better-sqlite3');
     const db = sqlite3.default(targetDbPath);
     db.exec(`CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, session_id TEXT, timestamp INTEGER, actor TEXT, type TEXT, payload TEXT, previous_event_id TEXT, sync_status TEXT DEFAULT 'pending');`);
     db.close();

     // Boot the persistent continuous tail locally headlessly (poll is 500ms)
     const logsTerm = tm.spawn('observe-logs', CR_BIN, ['logs', 'logs-session', '-d', targetDbPath]);
     await logsTerm.waitForStdout('logs-session', 5000).catch(() => {});

     // Wait explicitly to ensure interval initializes successfully before emitting to SQLite
     await new Promise(r => setTimeout(r, 1000));

     const dbOpen = sqlite3.default(targetDbPath);
     dbOpen.prepare(`INSERT INTO events (id, session_id, timestamp, actor, type, payload, previous_event_id, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'event-log-1', 'logs-session', Date.now(), 'PythonScript', 'RUNTIME_OUTPUT', JSON.stringify({text: 'LIVE_PYTHON_OUTPUT_99'}), null, 'pending'
     );
     dbOpen.close();

     // Validate payload was asynchronously fetched and dumped out of standard output
     await logsTerm.waitForStdout(/LIVE_PYTHON_OUTPUT_99/i, 10000).catch(() => {});
     expect(logsTerm.getBuffer()).toContain('LIVE_PYTHON_OUTPUT_99');
     
     logsTerm.kill();
  }, 15000);
});
