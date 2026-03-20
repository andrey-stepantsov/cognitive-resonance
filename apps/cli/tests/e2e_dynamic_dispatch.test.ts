import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseEngine } from '../src/db/DatabaseEngine';
import { runSyncDaemon } from '../src/commands/serve';
import { Materializer } from '@cr/core/src/services/Materializer';
import { DynamicDispatch } from '@cr/core/src/services/DynamicDispatch';
import * as fs from 'fs';
import * as path from 'path';
import os from 'os';

vi.mock('@cr/core/src/services/DynamicDispatch', () => {
    const DynamicDispatchMock = vi.fn();
    DynamicDispatchMock.prototype.deploy = vi.fn().mockImplementation(async () => 'https://mock-worker.subdomain.workers.dev');
    DynamicDispatchMock.prototype.teardown = vi.fn().mockImplementation(async () => {});
    return { DynamicDispatch: DynamicDispatchMock };
});

describe('E2E: Edge Dynamic Dispatch', () => {
    let dbEdge: DatabaseEngine;
    let tempDir: string;
    let mockLogger: any;
    
    beforeEach(() => {
        process.env.CF_ACCOUNT_ID = 'mock-account';
        process.env.CF_API_TOKEN = 'mock-token';
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-e2e-dispatch-'));
        dbEdge = new DatabaseEngine(path.join(tempDir, 'edge.sqlite'));
        mockLogger = { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
        
        vi.spyOn(Math, 'random').mockReturnValue(0.01);
        vi.spyOn(Materializer.prototype, 'computeAndMaterialize').mockImplementation(async (events, target) => {
            fs.mkdirSync(target, { recursive: true });
            fs.writeFileSync(path.join(target, 'my-sub-worker.ts'), 'export default { fetch: () => new Response("Hello Edge") }');
            return true as any;
        });
        
        const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) });
        global.fetch = mockFetch as any;
    });

    afterEach(() => {
        dbEdge.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.clearAllMocks();
    });

    it('intercepts CloudflareEdge deploy commands and routes to DynamicDispatch', async () => {
        const sessionId = dbEdge.createSession('E2E_USER', 'test-session-dispatch');

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                events: [{
                    id: 'mock-deploy-event',
                    session_id: sessionId, 
                    timestamp: Date.now(), 
                    actor: 'USER', 
                    type: 'EXECUTION_REQUESTED',
                    payload: JSON.stringify({ target: 'all', command: '@@CloudflareEdge(deploy "my-sub-worker")' }), 
                    previous_event_id: null
                }]
            })
        }) as any;
        
        await runSyncDaemon(dbEdge, new Set(), mockLogger, 'OrchestrationHost');
        
        await new Promise(r => setTimeout(r, 100)); // Yield to allow async Materializer and deploy to finish

        // Verify output event
        const outputs = dbEdge.query('SELECT * FROM events WHERE type = ?', ['RUNTIME_OUTPUT']) as any[];
        expect(outputs.length).toBe(1);
        expect(outputs[0].actor).toBe('CloudflareEdge');
        expect(JSON.parse(outputs[0].payload).text).toContain('Successfully deployed');
        expect(JSON.parse(outputs[0].payload).url).toBe('https://mock-worker.subdomain.workers.dev');
    });

    it('intercepts CloudflareEdge teardown commands and routes to DynamicDispatch', async () => {
        const sessionId = dbEdge.createSession('E2E_USER', 'test-session-teardown');
        
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                events: [{
                    id: 'mock-teardown-event',
                    session_id: sessionId, 
                    timestamp: Date.now(), 
                    actor: 'USER', 
                    type: 'EXECUTION_REQUESTED',
                    payload: JSON.stringify({ target: 'all', command: '@@CloudflareEdge(teardown "my-sub-worker")' }), 
                    previous_event_id: null
                }]
            })
        }) as any;

        await runSyncDaemon(dbEdge, new Set(), mockLogger, 'OrchestrationHost');

        await new Promise(r => setTimeout(r, 100));

        const outputs = dbEdge.query('SELECT * FROM events WHERE type = ?', ['RUNTIME_OUTPUT']) as any[];
        console.log("OUTPUTS:", outputs, "ERRORS:", mockLogger.error.mock.calls);
        expect(outputs.length).toBe(1);
        expect(outputs[0].actor).toBe('CloudflareEdge');
        expect(JSON.parse(outputs[0].payload).text).toContain('Successfully destroyed');
    });
});
