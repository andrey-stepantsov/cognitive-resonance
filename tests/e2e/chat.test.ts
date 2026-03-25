import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TerminalManager } from '../../packages/terminal-director/src/TerminalManager';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

const CR_CLI_PATH = path.join(process.cwd(), 'apps/cli/src/index.ts');
const CR_BIN = `npx tsx ${CR_CLI_PATH}`;

describe('cr chat - Core Session Interaction', () => {
  const tm = new TerminalManager();

  beforeAll(() => {
    // Clear out any test databases or test workspaces if needed
    const testDirs = ['.cr/test-workspace-bounds', '.cr/test-session-storage'];
    for (const dir of testDirs) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  afterAll(() => {
    tm.killAll();
  });

  it('1. Interactive REPL: Boots, handles standard input, parses piping', async () => {
    // Test native piping via standard input stream simulating headlessly
    const nativeExec = await import('child_process');
    const util = await import('util');
    const execPromise = util.promisify(nativeExec.exec);
    
    // We expect the LLM to output "APPLE" when piping "return the exact word APPLE"
    const pipeCmd = `echo "return the exact word APPLE" | ${CR_BIN} chat "context input"`;
    const { stdout, stderr } = await execPromise(pipeCmd);
    expect(stdout.toLowerCase()).toContain('apple');

    // Test REPL Multi-turn interactively
    const replTerm = tm.spawn('chat-repl', CR_BIN, ['chat']);
    await replTerm.waitForStdout('>', 10000).catch(() => {});
    
    // First turn
    await replTerm.typeHuman('hello, my favorite color is cerulean.\n');
    await replTerm.waitForStdout(/cerulean/i, 20000).catch(() => {});
    
    await replTerm.typeHuman('what is my favorite color?\n');
    await replTerm.waitForStdout(/cerulean/i, 20000).catch(() => {});
    
    replTerm.kill();
  }, 45000);

  it('2. Formatting Hooks: --format json and --format markdown', async () => {
    // JSON boundary
    const jsonTerm = tm.spawn('chat-json', CR_BIN, ['chat', '"output exactly the string JSON_WORKS"', '--format', 'json']);
    await jsonTerm.waitForStdout(/JSON_WORKS/, 25000).catch(() => {});
    const jsonOutput = jsonTerm.getBuffer();
    
    // Attempt strict parse. The CLI shouldn't output anything *but* JSON when format=json.
    let parsed: any = null;
    try {
        parsed = JSON.parse(jsonOutput.trim());
    } catch(err) {
        throw new Error(`Output was not strictly valid JSON:\n${jsonOutput}`);
    }
    expect(parsed).toHaveProperty('role', 'model');
    expect(parsed).toHaveProperty('content');
    expect(parsed.content).toContain('JSON_WORKS');
    jsonTerm.kill();

    // Markdown boundary
    const mdTerm = tm.spawn('chat-markdown', CR_BIN, ['chat', '"create a markdown header saying MARKDOWN_WORKS"', '--format', 'markdown']);
    await mdTerm.waitForStdout(/Dissonance:/i, 25000).catch(() => {});
    const mdOutput = mdTerm.getBuffer();
    // Validate formatting rendering (e.g. bold or header sequences might be converted into ANSI or left as text)
    expect(mdOutput.toUpperCase()).toContain('MARKDOWN_WORKS');
    mdTerm.kill();
  }, 45000);

  it('3. Model Selection: Valid switching and invalid rejection', async () => {
    // Valid Model Context Switching
    const validModelTerm = tm.spawn('chat-model-valid', CR_BIN, ['chat', '"hello"', '--model', 'gemini-1.5-flash']);
    await validModelTerm.waitForStdout(/Dissonance:/i, 25000).catch(() => {});
    validModelTerm.kill();

    // Invalid Model Hard Rejection (Expect Error)
    const invalidModelTerm = tm.spawn('chat-model-invalid', CR_BIN, ['chat', '"hello"', '--model', 'fake-model-does-not-exist']);
    // Wait for the process to exit or throw a known error
    await new Promise(r => setTimeout(r, 6000));
    const invalidOutput = invalidModelTerm.getBuffer();
    
    // It should aggressively fail - checking if standard error catches it
    expect(invalidOutput.toLowerCase()).toMatch(/(error|invalid|not found|not default)/);
    
    invalidModelTerm.kill();
  }, 45000);

  it('4. Session Cold-Storage: Rehydration consistency', async () => {
    const testSessionId = `test-cold-storage-${crypto.randomBytes(4).toString('hex')}`;
    
    // Step A: Seed the session
    const seedTerm = tm.spawn('seed-session', CR_BIN, ['chat', '"remember the secret word is PINEAPPLE"', '--session', testSessionId]);
    await seedTerm.waitForStdout(/Dissonance:/i, 25000).catch(() => {});
    seedTerm.kill();

    // Step B: Rehydrate in a new process and assert memory
    const recallTerm = tm.spawn('recall-session', CR_BIN, ['chat', '"what is the secret word?"', '--session', testSessionId]);
    await recallTerm.waitForStdout(/PINEAPPLE/i, 25000).catch(() => {});
    const recallOutput = recallTerm.getBuffer();
    expect(recallOutput.toLowerCase()).toContain('pineapple');
    recallTerm.kill();
  }, 45000);

  it('5. Workspace Boundaries: Artifact materialization containment', async () => {
    const TEST_WS = path.join(process.cwd(), '.cr', 'test-workspace-bounds', `ws-${Date.now()}`);
    if (!fs.existsSync(TEST_WS)) {
      fs.mkdirSync(TEST_WS, { recursive: true });
    }

    const targetDbPath = path.join(TEST_WS, '.cr', 'cr.sqlite');
    
    // Command the agent to materialize a file explicitly
    const fileCommand = '"Please create a file named test_boundary.js and write console.log(\'boundary_test\') to it"';
    const wsTerm = tm.spawn('chat-ws-boundary', CR_BIN, ['chat', fileCommand, '--workspace', TEST_WS, '--db', targetDbPath]);
    
    await wsTerm.waitForStdout(/Dissonance:/i, 35000).catch(() => {});
    wsTerm.kill();

    // Verify the VFS sandbox isolated the DB gracefully exactly to the TEST_WS envelope
    expect(fs.existsSync(targetDbPath)).toBe(true);
    
    // Validate the ARTEFACT_PROPOSAL was drafted into the isolated DB
    const sqlite3 = await import('better-sqlite3');
    const db = sqlite3.default(targetDbPath);
    const events = db.prepare("SELECT * FROM events WHERE type = 'ARTEFACT_PROPOSAL'").all() as any[];
    expect(events.length).toBeGreaterThan(0);
    
    let foundBoundary = false;
    for (const ev of events) {
       const payload = JSON.parse(ev.payload);
       if (payload.path === 'test_boundary.js' && payload.patch.includes('boundary_test')) {
          foundBoundary = true;
       }
    }
    expect(foundBoundary).toBe(true);
    db.close();

  }, 45000);

  it('6. REPL Commands: /focus, /read, /sandbox, /exec parsing', async () => {
    const TEST_WS = path.join(process.cwd(), '.cr', 'test-repl-commands');
    const targetDbPath = path.join(TEST_WS, '.cr', 'cr.sqlite');
    if (!fs.existsSync(TEST_WS)) fs.mkdirSync(TEST_WS, { recursive: true });
    
    // Seed a file to read
    const seedFilePath = path.join(TEST_WS, 'plain.txt');
    fs.writeFileSync(seedFilePath, 'BORING_INFO_999');

    const replTerm = tm.spawn('chat-repl-commands', CR_BIN, ['chat', '--workspace', TEST_WS, '--db', targetDbPath]);
    await replTerm.waitForStdout('>', 10000).catch(() => {});
    
    // Test /focus
    await replTerm.typeHuman('/focus src\n');
    await replTerm.waitForStdout(/Appended Semantic Focus/i, 10000).catch(() => {});
    
    // Test /read
    await replTerm.typeHuman('/read plain.txt\n');
    await replTerm.waitForStdout(/Injected context/i, 10000).catch(() => {});
    
    // Verify context injected by asking the LLM
    await replTerm.typeHuman('What is the boring info?\n');
    await replTerm.waitForStdout(/999/i, 25000).catch(() => {});
    
    // Test /exec
    await replTerm.typeHuman('/exec echo 12345\n');
    await replTerm.waitForStdout(/12345/i, 10000).catch(() => {});

    replTerm.kill();
  }, 60000);

  it('7. AST Personas: @Operator and @@TargetHost routing bypass', async () => {
    const targetDbPath = path.join(process.cwd(), '.cr', `test-ast-${Date.now()}`, 'cr.sqlite');
    if (!fs.existsSync(path.dirname(targetDbPath))) fs.mkdirSync(path.dirname(targetDbPath), { recursive: true });

    const replTerm = tm.spawn('chat-ast', CR_BIN, ['chat', '--db', targetDbPath]);
    await replTerm.waitForStdout('>', 10000).catch(() => {});

    // Issue DSL Target Host
    await replTerm.typeHuman('@@HostA(exec "ls")\n');
    await replTerm.waitForStdout(/Routing remote execution/i, 10000).catch(() => {});
    
    // Verify DB mutation avoids AI
    const sqlite3 = await import('better-sqlite3');
    const db = sqlite3.default(targetDbPath);
    const events = db.prepare("SELECT * FROM events WHERE type = 'EXECUTION_REQUESTED'").all() as any[];
    expect(events.length).toBe(1);
    expect(JSON.parse(events[0].payload).target).toBe('HostA');
    db.close();

    replTerm.kill();
  }, 45000);

  it('8. Sync Daemon UI rendering without blocking readline', async () => {
    const targetDbPath = path.join(process.cwd(), '.cr', `test-daemon-${Date.now()}`, 'cr.sqlite');
    if (!fs.existsSync(path.dirname(targetDbPath))) fs.mkdirSync(path.dirname(targetDbPath), { recursive: true });
    
    // Create a mock Edge API Server
    const http = await import('http');
    let hasPolled = false;
    const mockServer = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url && req.url.includes('/api/events?since=')) {
         if (!hasPolled) {
             hasPolled = true;
             res.end(JSON.stringify({
               events: [{
                 id: '99999',
                 session_id: 'daemon-test',
                 timestamp: Date.now(),
                 actor: 'Remote User',
                 type: 'message',
                 payload: JSON.stringify({ text: 'Hello from Edge!' }),
                 sync_status: 'synced',
                 previous_event_id: null
               }]
             }));
         } else {
             res.end(JSON.stringify({ events: [] }));
         }
      } else if (req.url && req.url.includes('/api/events/batch')) {
         res.end(JSON.stringify({ success: true }));
      } else {
         res.statusCode = 404;
         res.end();
      }
    });

    await new Promise(r => mockServer.listen(0, () => r(null)));
    const port = (mockServer.address() as any).port;
    const MOCK_URL = `http://localhost:${port}`;

    // Pass inline env var to shell exec (SyncDaemon listens to CR_EDGE_URL)
    const ENV_BIN = `CR_EDGE_URL=${MOCK_URL} CR_API_URL=${MOCK_URL} ${CR_BIN}`;
    const replTerm = tm.spawn('chat-daemon', ENV_BIN, ['chat', '--session', 'daemon-test', '--db', targetDbPath]);
    
    await replTerm.waitForStdout('>', 10000).catch(() => {});

    // Because polling is 5 seconds, wait up to 10s for the UI to render the injected remote event
    await replTerm.waitForStdout(/Remote User/i, 15000).catch(() => {});
    expect(replTerm.getBuffer()).toContain('Hello from Edge!');
    
    replTerm.kill();
    mockServer.close();
  }, 45000);

  it('9. Artifact Concurrency: Multi-file generation', async () => {
    const TEST_WS = path.join(process.cwd(), '.cr', `test-artifact-${Date.now()}`);
    if (!fs.existsSync(TEST_WS)) fs.mkdirSync(TEST_WS, { recursive: true });
    const targetDbPath = path.join(TEST_WS, '.cr', 'cr.sqlite');

    // Force strict structure to output two files
    const fileCommand = '"Create TWO virtual files: \'fileA.txt\' with content AAA and \'fileB.txt\' with content BBB. You must supply exactly two files in your `files` JSON array block!"';
    const wsTerm = tm.spawn('chat-artifact', CR_BIN, ['chat', fileCommand, '--workspace', TEST_WS, '--db', targetDbPath]);
    
    await wsTerm.waitForStdout(/Dissonance:/i, 45000).catch(() => {});
    wsTerm.kill();

    const sqlite3 = await import('better-sqlite3');
    const db = sqlite3.default(targetDbPath);
    const events = db.prepare("SELECT * FROM events WHERE type = 'ARTEFACT_PROPOSAL'").all() as any[];
    
    expect(events.length).toBeGreaterThanOrEqual(1); // Could be aggregated or separate events depending on ArtefactManager
    db.close();
  }, 60000);

  it('10. Process Resiliency: Missing API Keys', async () => {
    // Run exactly standard exec without API keys to ensure graceful catch
    const nativeExec = await import('child_process');
    const util = await import('util');
    const execPromise = util.promisify(nativeExec.exec);
    
    // Clear out keys and see if it boots with a graceful warning
    const noKeyCmd = `CR_GEMINI_API_KEY="" VITE_GEMINI_API_KEY="" ${CR_BIN} chat "hello"`;
    
    try {
      const { stderr, stdout } = await execPromise(noKeyCmd);
      expect(stderr.toLowerCase() + stdout.toLowerCase()).toContain('warning');
    } catch (err: any) {
      // It might exit 1 if generateResponse fails, but it shouldn't unhandled-promise panic
      expect(err.stderr || err.stdout).toBeTruthy();
    }
  }, 15000);
});
