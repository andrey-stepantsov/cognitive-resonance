import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestCluster } from './TestCluster';

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
});
