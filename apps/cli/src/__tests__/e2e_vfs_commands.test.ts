import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestCluster } from './TestCluster.js';

describe('E2E VirtualFS REPL Commands', () => {
  let cluster: TestCluster;

  beforeEach(() => {
    cluster = new TestCluster();
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    cluster.teardown();
    vi.restoreAllMocks();
  });

  it('displays virtual state for an ARTEFACT using /cat', async () => {
    const sessionId = cluster.db.createSession('TEST_USER');
    
    cluster.db.appendEvent({
      session_id: sessionId,
      timestamp: Date.now(),
      actor: 'System-Importer',
      type: 'ARTEFACT_PROPOSAL',
      payload: JSON.stringify({ path: 'src/dummy.js', patch: 'console.log("cat-test");', isFullReplacement: true }),
      previous_event_id: null
    });

    await cluster.bootRepl(sessionId);
    await new Promise(r => setTimeout(r, 50));

    const printSpy = vi.spyOn(cluster.replIo, 'print');
    cluster.replIo.simulateLine('/cat src/dummy.js');
    await new Promise(r => setTimeout(r, 50));

    expect(printSpy).toHaveBeenCalledWith(expect.stringContaining('--- src/dummy.js ---'));
    expect(printSpy).toHaveBeenCalledWith(expect.stringContaining('console.log("cat-test");'));
  });

  it('injects file context directly into chat history using /read', async () => {
    const sessionId = cluster.db.createSession('TEST_USER');
    
    cluster.db.appendEvent({
      session_id: sessionId,
      timestamp: Date.now(),
      actor: 'System-Importer',
      type: 'ARTEFACT_PROPOSAL',
      payload: JSON.stringify({ path: 'docs/arch.md', patch: '# Architecture', isFullReplacement: true }),
      previous_event_id: null
    });

    await cluster.bootRepl(sessionId);
    await new Promise(r => setTimeout(r, 50));

    cluster.replIo.simulateLine('/read docs/arch.md');
    await new Promise(r => setTimeout(r, 50));

    // Assert that a USER_PROMPT was written dynamically with the file content
    const events = cluster.db.query("SELECT * FROM events WHERE session_id = ? AND type = 'USER_PROMPT' ORDER BY timestamp DESC LIMIT 1", [sessionId]) as any[];
    expect(events.length).toBe(1);
    
    const payload = JSON.parse(events[0].payload);
    expect(payload.text).toContain('[System] Injected context for docs/arch.md');
    expect(payload.text).toContain('# Architecture');
  });

  it('navigates the VirtualFS structure using /ls and /tree', async () => {
    const sessionId = cluster.db.createSession('TEST_USER');
    
    // Inject multiple artefact proposals across nested directories
    cluster.db.appendEvent({ session_id: sessionId, timestamp: Date.now(), actor: 'System', type: 'ARTEFACT_PROPOSAL', payload: JSON.stringify({ path: 'src/index.ts', patch: '//', isFullReplacement: true }), previous_event_id: null });
    cluster.db.appendEvent({ session_id: sessionId, timestamp: Date.now(), actor: 'System', type: 'ARTEFACT_PROPOSAL', payload: JSON.stringify({ path: 'src/utils/math.ts', patch: '//', isFullReplacement: true }), previous_event_id: null });
    cluster.db.appendEvent({ session_id: sessionId, timestamp: Date.now(), actor: 'System', type: 'ARTEFACT_PROPOSAL', payload: JSON.stringify({ path: 'package.json', patch: '{}', isFullReplacement: true }), previous_event_id: null });

    await cluster.bootRepl(sessionId);
    await new Promise(r => setTimeout(r, 50));

    const printSpy = vi.spyOn(cluster.replIo, 'print');
    
    // Test base /ls
    cluster.replIo.simulateLine('/ls');
    await new Promise(r => setTimeout(r, 50));
    
    let callsStr = printSpy.mock.calls.map(c => typeof c[0] === 'string' ? c[0] : JSON.stringify(c[0])).join('\n');
    expect(callsStr).toContain('src');
    expect(callsStr).toContain('package.json');
    // Ensure utils is hidden since it's nested under src
    expect(callsStr).not.toContain('utils');

    // Test nested /ls src
    printSpy.mockClear();
    cluster.replIo.simulateLine('/ls src');
    await new Promise(r => setTimeout(r, 50));
    callsStr = printSpy.mock.calls.map(c => typeof c[0] === 'string' ? c[0] : JSON.stringify(c[0])).join('\n');
    expect(callsStr).toContain('index.ts');
    expect(callsStr).toContain('utils');

    // Test /tree
    printSpy.mockClear();
    cluster.replIo.simulateLine('/tree');
    await new Promise(r => setTimeout(r, 50));
    callsStr = printSpy.mock.calls.map(c => typeof c[0] === 'string' ? c[0] : JSON.stringify(c[0])).join('\n');
    expect(callsStr).toContain('├── \x1b[36mindex.ts\x1b[0m');
    expect(callsStr).toContain('  ├── \x1b[36mmath.ts\x1b[0m');
  });

  it('restricts tab autocompletion to available commands and virtual state', async () => {
    const sessionId = cluster.db.createSession('TEST_USER');
    
    cluster.db.appendEvent({ session_id: sessionId, timestamp: Date.now(), actor: 'System', type: 'ARTEFACT_PROPOSAL', payload: JSON.stringify({ path: 'src/dummy.js', patch: '//', isFullReplacement: true }), previous_event_id: null });
    cluster.db.appendEvent({ session_id: sessionId, timestamp: Date.now(), actor: 'System', type: 'ARTEFACT_PROPOSAL', payload: JSON.stringify({ path: 'package.json', patch: '{}', isFullReplacement: true }), previous_event_id: null });

    await cluster.bootRepl(sessionId);
    await new Promise(r => setTimeout(r, 50));

    expect(cluster.replIo.activeCompleter).toBeDefined();

    // Verify command completion
    const [helpHits] = cluster.replIo.activeCompleter!('/hel');
    expect(helpHits).toContain('/help');

    // Verify VFS file completion for /cat
    const [catHits] = cluster.replIo.activeCompleter!('/cat s');
    expect(catHits).toContain('/cat src/dummy.js');
    expect(catHits).not.toContain('/cat package.json');
    
    // Test base completion for /read
    const [readHits] = cluster.replIo.activeCompleter!('/read ');
    expect(readHits).toContain('/read package.json');
    expect(readHits).toContain('/read src/dummy.js');
  });

  it('respects Semantic Focus bounds for /ls, /tree, and tab-completion', async () => {
    const sessionId = cluster.db.createSession('TEST_USER');
    
    cluster.db.appendEvent({ session_id: sessionId, timestamp: Date.now(), actor: 'System', type: 'ARTEFACT_PROPOSAL', payload: JSON.stringify({ path: 'src/index.ts', patch: '//', isFullReplacement: true }), previous_event_id: null });
    cluster.db.appendEvent({ session_id: sessionId, timestamp: Date.now(), actor: 'System', type: 'ARTEFACT_PROPOSAL', payload: JSON.stringify({ path: 'src/utils/math.ts', patch: '//', isFullReplacement: true }), previous_event_id: null });
    cluster.db.appendEvent({ session_id: sessionId, timestamp: Date.now(), actor: 'System', type: 'ARTEFACT_PROPOSAL', payload: JSON.stringify({ path: 'package.json', patch: '{}', isFullReplacement: true }), previous_event_id: null });

    await cluster.bootRepl(sessionId);
    await new Promise(r => setTimeout(r, 50));

    const printSpy = vi.spyOn(cluster.replIo, 'print');

    // Set Semantic Focus
    cluster.replIo.simulateLine('/focus src/utils');
    await new Promise(r => setTimeout(r, 50));
    
    // Verify /ls is bounded
    printSpy.mockClear();
    cluster.replIo.simulateLine('/ls');
    await new Promise(r => setTimeout(r, 50));
    let callsStr = printSpy.mock.calls.map(c => typeof c[0] === 'string' ? c[0] : JSON.stringify(c[0])).join('\n');
    expect(callsStr).toContain('src');
    expect(callsStr).not.toContain('package.json');

    // Verify /tree is bounded
    printSpy.mockClear();
    cluster.replIo.simulateLine('/tree');
    await new Promise(r => setTimeout(r, 50));
    callsStr = printSpy.mock.calls.map(c => typeof c[0] === 'string' ? c[0] : JSON.stringify(c[0])).join('\n');
    expect(callsStr).toContain('math.ts');
    expect(callsStr).not.toContain('index.ts');
    expect(callsStr).not.toContain('package.json');

    // Verify autocompletion is bounded
    const [catHits] = cluster.replIo.activeCompleter!('/cat s');
    expect(catHits).toContain('/cat src/utils/math.ts');
    expect(catHits).not.toContain('/cat src/index.ts');

    // Clear focus
    cluster.replIo.simulateLine('/focus clear');
    await new Promise(r => setTimeout(r, 50));
    
    // Autocompletion restored
    const [catHitsRestored] = cluster.replIo.activeCompleter!('/cat s');
    expect(catHitsRestored).toContain('/cat src/utils/math.ts');
    expect(catHitsRestored).toContain('/cat src/index.ts');
  });
});
