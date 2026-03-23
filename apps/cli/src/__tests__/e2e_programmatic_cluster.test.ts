import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.hoisted(() => {
  process.env.CR_SYNC_INTERVAL = '100';
});

import { TestCluster } from './TestCluster.js';

describe('Programmatic Multi-Node Cluster E2E', () => {
  let cluster: TestCluster;

  beforeEach(() => {
    cluster = new TestCluster();
    
    // Disable process.exit globally in case REPL tries to close
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    // Mock the Cloudflare Edge API so runSyncDaemon processes local CLI SQLite events.
    vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
        const url = input.toString();
        if (url.includes('/api/events/batch')) {
             return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        if (url.includes('/api/events?since=')) {
             const searchString = url.split('?')[1];
             const params = new URLSearchParams(searchString);
             const since = params.get('since') || '0';
             // The edge returns events that were appended locally by REPL
             const newEvents = cluster.db.query('SELECT * FROM events WHERE timestamp >= ? ORDER BY timestamp ASC', [since]);
             console.log("Edge Sync Pulled", newEvents.length, "events since", since);
             return new Response(JSON.stringify({ events: newEvents }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('Not Found', { status: 404 });
    });
  });

  afterEach(() => {
    cluster.teardown();
    vi.restoreAllMocks();
  });

  it('can boot a daemon and REPL in the same process, passing DSL routing successfully', async () => {
    // 1. Boot daemon targeted as TestNode
    await cluster.bootDaemon('TestNode');
    
    // 2. Boot REPL
    await cluster.bootRepl();
    
    // 3. Wait a beat to ensure Date.now() progresses so timestamps are monotonic
    await new Promise(res => setTimeout(res, 50));
    
    // 4. In REPL, Type exactly: @@TestNode(exec "echo programmatic_hello")
    cluster.replIo.simulateLine('@@TestNode(exec "echo programmatic_hello")');
    
    // 5. Trigger Daemon Edge Sync Programmatically
    // Wait a tick for the REPL to write the EXECUTION_REQUESTED event
    await new Promise(res => setTimeout(res, 50));
    await cluster.triggerDaemonSync('TestNode');
    
    // Wait for Daemon to spawn the local process and write the output event (Node exec takes ~100-200ms)
    let found = false;
    for (let i = 0; i < 40; i++) {
        const events = cluster.db.query("SELECT * FROM events WHERE type = 'RUNTIME_OUTPUT'");
        for (const ev of events as any[]) {
            const payload = JSON.parse(ev.payload);
            if (payload.text && payload.text.includes('programmatic_hello')) {
                found = true;
                break;
            }
        }
        if (found) break;
        await new Promise(res => setTimeout(res, 100)); // poll explicitly
    }
    
    console.log("DB EVENTS DUMP:");
    const allEvents = cluster.db.query("SELECT id, type, actor FROM events");
    console.log(allEvents);
    
    expect(found).toBe(true);
  });
});
