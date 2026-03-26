import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestCluster } from './TestCluster.js';
import { Materializer } from 'cr-core-contracts';

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    exec: vi.fn((cmd, opts, cb) => cb(null, 'mocked execution output via test intercept', ''))
  };
});

describe('E2E: Daemon Sync Offline Queuing', () => {
  let cluster: TestCluster;

  beforeEach(() => {
    cluster = new TestCluster();
    
    // Silence random logger rate limiting to guarantee error capture
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    vi.spyOn(Materializer.prototype, 'computeAndMaterialize').mockResolvedValue(true as any);
  });

  afterEach(() => {
    cluster.teardown();
    vi.restoreAllMocks();
  });

  it('verifies events queue offline then flush cleanly on simulated cloud recovery', async () => {
    // 1. Setup local sqlite with out-of-sync events (user types whilst on airplane mode)
    const sessionId = cluster.db.createSession('E2E_USER');
    cluster.db.appendEvent({ session_id: sessionId, timestamp: Date.now(), actor: 'E2E_USER', type: 'USER_PROMPT', payload: '{"text":"Hello offline!"}', previous_event_id: null });
    cluster.db.appendEvent({ session_id: sessionId, timestamp: Date.now()+100, actor: 'LOCAL_AI', type: 'AI_RESPONSE', payload: '{"text":"Response"}', previous_event_id: null });

    // Assert the local DB queue is loaded
    let pending = cluster.db.getPendingEvents();
    const initialPendingCount = pending.length;
    expect(initialPendingCount).toBeGreaterThan(0);

    // 2. Simulate CLOUDFLARE API is completely offline/down
    const mockOfflineFetch = vi.fn().mockImplementation((url: string) => {
      // Simulate fetch rejection / timeout
      return Promise.reject(new Error("fetch failed"));
    });
    global.fetch = mockOfflineFetch as any;

    await cluster.triggerDaemonSync('test-node-1');

    // Assert events are STILL securely in local queue
    pending = cluster.db.getPendingEvents();
    expect(pending.length).toBe(initialPendingCount);

    // 3. Simulate CLOUDFLARE API returns to ONLINE
    const mockOnlineFetch = vi.fn().mockImplementation((url: URL | string) => {
      const urlStr = String(url);
      if (urlStr.includes('/batch')) {
         // mock successful push
         return Promise.resolve({ ok: true, json: async () => ({ events: [] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ events: [] }) });
    });
    global.fetch = mockOnlineFetch as any;

    await cluster.triggerDaemonSync('test-node-1');

    // Assert events got successfully flushed to cloud (i.e. local synced flag updated)
    pending = cluster.db.getPendingEvents();
    expect(pending.length).toBe(0);
    expect(mockOnlineFetch).toHaveBeenCalled();
  });

  it('intercepts EXECUTION_REQUESTED events and dispatches materializer shell hooks locally', async () => {
    const sessionId = cluster.db.createSession('E2E_USER');
    
    // Simulate CLOUDFLARE API returning an EXECUTION_REQUESTED event tailored for this fake host identity
    const mockOnlineFetch = vi.fn().mockImplementation((url: URL | string) => {
      const urlStr = String(url);
      if (urlStr.includes('since=')) {
         return Promise.resolve({ ok: true, json: async () => ({
             events: [
                { id: 'remote-20', session_id: sessionId, timestamp: Date.now(), type: 'EXECUTION_REQUESTED', actor: 'REMOTE_CLI', payload: JSON.stringify({ target: 'test-node-1', command: 'npm test' }), previous_event_id: null }
             ]
         }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ events: [] }) });
    });
    global.fetch = mockOnlineFetch as any;

    await cluster.triggerDaemonSync('test-node-1');

    // Yield macro-task queue for async fs/materializer hooks to resolve the mocked exec child process callback
    await new Promise(r => setTimeout(r, 200));

    // Assert that a RUNTIME_OUTPUT event was securely appended to sqlite queue 
    const capturedOutputEvents = cluster.db.query('SELECT * FROM events WHERE type = ?', ['RUNTIME_OUTPUT']) as any[];
    expect(capturedOutputEvents.length).toBe(1);
    
    const outputPayload = JSON.parse(capturedOutputEvents[0].payload);
    expect(outputPayload.text).toBe('mocked execution output via test intercept');
    expect(capturedOutputEvents[0].actor).toBe('test-node-1');
  });
});

