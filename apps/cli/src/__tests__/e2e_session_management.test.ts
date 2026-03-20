import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestCluster } from './TestCluster';

describe('E2E Session Management', () => {
  let cluster: TestCluster;

  beforeEach(() => {
    cluster = new TestCluster();
    // Disable process.exit globally in case REPL tries to close
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    cluster.teardown();
    vi.restoreAllMocks();
  });

  it('handles /archive and /recover commands correctly', async () => {
    const sessionId = cluster.db.createSession('TEST_USER');
    // Ensure one prompt exists so the session isn't empty on boot
    cluster.db.appendEvent({ session_id: sessionId, timestamp: Date.now(), type: 'USER_PROMPT', actor: 'test', payload: JSON.stringify({ text: 'dummy text' }), previous_event_id: null });

    await cluster.bootRepl(sessionId);
    await new Promise(r => setTimeout(r, 50));

    cluster.replIo.simulateLine('/archive');
    await new Promise(r => setTimeout(r, 50));

    // Verify PWA_ARCHIVE_TOGGLE event
    const events = cluster.db.query("SELECT * FROM events WHERE session_id = ? AND type = 'PWA_ARCHIVE_TOGGLE' ORDER BY timestamp DESC LIMIT 1", [sessionId]) as any[];
    expect(events.length).toBe(1);
    expect(JSON.parse(events[0].payload).archived).toBe(true);

    const printSpy = vi.spyOn(cluster.replIo, 'print');
    
    // Typing /session ls should hide the archived session
    cluster.replIo.simulateLine('/session ls');
    await new Promise(r => setTimeout(r, 50));
    let callsStr = printSpy.mock.calls.map(c => typeof c[0] === 'string' ? c[0] : JSON.stringify(c[0])).join('\n');
    expect(callsStr).not.toContain(sessionId);

    // Try --all
    cluster.replIo.simulateLine('/session ls --all');
    await new Promise(r => setTimeout(r, 50));
    callsStr = printSpy.mock.calls.map(c => typeof c[0] === 'string' ? c[0] : JSON.stringify(c[0])).join('\n');
    expect(callsStr).toContain(sessionId);
    
    // Recover
    cluster.replIo.simulateLine('/recover');
    await new Promise(r => setTimeout(r, 50));
    
    const eventsRec = cluster.db.query("SELECT * FROM events WHERE session_id = ? AND type = 'PWA_ARCHIVE_TOGGLE' ORDER BY timestamp DESC LIMIT 1", [sessionId]) as any[];
    expect(eventsRec.length).toBe(1);
    expect(JSON.parse(eventsRec[0].payload).archived).toBe(false);
  });

  it('filters /session ls with wildcards', async () => {
    const sessionId1 = cluster.db.createSession('TEST_USER', 'tmp-sess-1');
    const sessionId2 = cluster.db.createSession('TEST_USER', 'prod-sess-1');
    
    // Add baseline events so they show up as active
    cluster.db.appendEvent({ session_id: sessionId1, timestamp: Date.now(), type: 'USER_PROMPT', actor: 'test', payload: JSON.stringify({ text: 'dummy text' }), previous_event_id: null });
    cluster.db.appendEvent({ session_id: sessionId2, timestamp: Date.now(), type: 'USER_PROMPT', actor: 'test', payload: JSON.stringify({ text: 'dummy text' }), previous_event_id: null });

    const sessionId3 = cluster.db.createSession('LOCAL_USER');
    await cluster.bootRepl(sessionId3);
    await new Promise(r => setTimeout(r, 50));

    const printSpy = vi.spyOn(cluster.replIo, 'print');
    cluster.replIo.simulateLine('/session ls tmp*');
    await new Promise(r => setTimeout(r, 50));

    const calls = printSpy.mock.calls.map(c => typeof c[0] === 'string' ? c[0] : JSON.stringify(c[0])).join('\n');
    expect(calls).toContain('tmp-sess-1');
    expect(calls).not.toContain('prod-sess-1');
  });

  it('outputs detailed session metadata on bare /session command', async () => {
    const sessionId = cluster.db.createSession('TEST_USER');
    cluster.db.appendEvent({ session_id: sessionId, timestamp: Date.now(), type: 'USER_PROMPT', actor: 'test', payload: JSON.stringify({ text: 'dummy text' }), previous_event_id: null });
    
    await cluster.bootRepl(sessionId);
    await new Promise(r => setTimeout(r, 50));

    const printSpy = vi.spyOn(cluster.replIo, 'print');
    cluster.replIo.simulateLine('/session');
    await new Promise(r => setTimeout(r, 50));

    // Verify metadata dump output
    expect(printSpy).toHaveBeenCalledWith(expect.stringContaining('[Active Session Info]'));
    expect(printSpy).toHaveBeenCalledWith(expect.stringContaining('Total Events: 1'));
  });
});
