import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestCluster } from './TestCluster';

describe('E2E Edge Orchestration DSL', () => {
  let cluster: TestCluster;

  beforeEach(() => {
    cluster = new TestCluster();
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    
    // Mock fetch for Cloudflare Edge logic (similar to daemon_sync & cluster tests)
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
             return new Response(JSON.stringify({ events: newEvents }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('Not Found', { status: 404 });
    });
  });

  afterEach(() => {
    cluster.teardown();
    vi.restoreAllMocks();
  });

  it('routes execution natively via @@CloudflareEdge DSL and resolves RUNTIME_OUTPUT', async () => {
    // Boot daemon representing Cloudflare Edge mock worker
    await cluster.bootDaemon('CloudflareEdge');
    
    // Boot REPL locally
    const sessionId = cluster.db.createSession('TEST_USER');
    await cluster.bootRepl(sessionId);
    await new Promise(r => setTimeout(r, 50));

    // Send orchestrator request
    cluster.replIo.simulateLine('@@CloudflareEdge(exec "echo deployment_success")');
    await new Promise(r => setTimeout(r, 50));
    
    // Trigger sync to get the payload over "Edge"
    await cluster.triggerDaemonSync('CloudflareEdge');
    
    // Wait for the mock node child_process to settle
    let found = false;
    for (let i = 0; i < 20; i++) {
        const events = cluster.db.query("SELECT * FROM events WHERE type = 'RUNTIME_OUTPUT'") as any[];
        for (const ev of events) {
            const p = JSON.parse(ev.payload);
            if (p.text && p.text.includes('deployment_success')) {
                found = true;
                break;
            }
        }
        if (found) break;
        await new Promise(r => setTimeout(r, 100));
    }
    
    expect(found).toBe(true);
  });
});
