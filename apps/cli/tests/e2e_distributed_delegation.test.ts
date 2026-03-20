import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseEngine } from '../src/db/DatabaseEngine';
import { runSyncDaemon } from '../src/commands/serve';
import { Materializer } from '@cr/core/src/services/Materializer';
import * as fs from 'fs';
import * as path from 'path';
import os from 'os';

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    exec: vi.fn((cmd, opts, cb) => {
        if (cmd === 'npm run test') {
            cb(null, 'mocked macbook npm test output', '');
        } else if (cmd === 'python worker.py') {
            cb(null, 'mocked linux python output', '');
        } else {
            cb(null, 'default mocked output', '');
        }
    })
  };
});

describe('E2E: Distributed Sandbox (Multi-Peer Delegation)', () => {
    let dbMac: DatabaseEngine;
    let dbLinux: DatabaseEngine;
    let edgeDb: DatabaseEngine; 
    let tempDir: string;
    let mockLogger: any;
    
    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-e2e-delegation-'));
        edgeDb = new DatabaseEngine(path.join(tempDir, 'edge.sqlite'));
        dbMac = new DatabaseEngine(path.join(tempDir, 'mac.sqlite'));
        dbLinux = new DatabaseEngine(path.join(tempDir, 'linux.sqlite'));
        mockLogger = { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
        
        vi.spyOn(Math, 'random').mockReturnValue(0.01);
        vi.spyOn(Materializer.prototype, 'computeAndMaterialize').mockResolvedValue(true as any);
        
        // Setup mock edge pull
        const mockFetch = vi.fn().mockImplementation((url: URL | string) => {
            const urlStr = String(url);
            if (urlStr.includes('/batch')) {
                return Promise.resolve({ ok: true, json: async () => ({ events: [] }) });
            }
            if (urlStr.includes('since=')) {
                // Return all events from the Edge DB
                const since = parseInt(new URL(urlStr).searchParams.get('since') || '0', 10);
                const events = edgeDb.query('SELECT * FROM events WHERE timestamp > ? ORDER BY timestamp ASC', [since]);
                return Promise.resolve({ ok: true, json: async () => ({ events }) });
            }
            return Promise.resolve({ ok: true, json: async () => ({ events: [] }) });
        });
        global.fetch = mockFetch as any;
    });

    afterEach(() => {
        edgeDb.close();
        dbMac.close();
        dbLinux.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it('routes concurrent execution requests to specific tagged peers using the DSL', async () => {
        const sessionId = edgeDb.createSession('E2E_USER', 'test-session-delegation');
        
        // Emit ARTEFACT_PROPOSAL (Cross-language logic)
        edgeDb.appendEvent({
            session_id: sessionId, timestamp: Date.now(), actor: 'SYSTEM', type: 'ARTEFACT_PROPOSAL', 
            payload: JSON.stringify({ path: 'worker.py', patch: 'print("hello")', isFullReplacement: true }), previous_event_id: null
        });
        edgeDb.appendEvent({
            session_id: sessionId, timestamp: Date.now()+10, actor: 'SYSTEM', type: 'ARTEFACT_PROPOSAL', 
            payload: JSON.stringify({ path: 'package.json', patch: '{}', isFullReplacement: true }), previous_event_id: null
        });

        // Emit EXECUTION_REQUESTED for MacBook peer using DSL
        edgeDb.appendEvent({
            session_id: sessionId, timestamp: Date.now()+20, actor: 'USER', type: 'EXECUTION_REQUESTED',
            payload: JSON.stringify({ target: 'all', command: '@@MacBook(exec "npm run test")' }), previous_event_id: null
        });

        // Emit EXECUTION_REQUESTED for LinuxWorker peer using DSL
        edgeDb.appendEvent({
            session_id: sessionId, timestamp: Date.now()+30, actor: 'USER', type: 'EXECUTION_REQUESTED',
            payload: JSON.stringify({ target: 'all', command: '@@LinuxWorker(exec "python worker.py")' }), previous_event_id: null
        });

        // Run sync daemon for MacBook and wait for processing
        await runSyncDaemon(dbMac, new Set(), mockLogger, 'MacBook');
        await new Promise(r => setTimeout(r, 100)); // Yield to allow async Materializer and exec to finish

        // Run sync daemon for LinuxWorker and wait for processing
        await runSyncDaemon(dbLinux, new Set(), mockLogger, 'LinuxWorker');
        await new Promise(r => setTimeout(r, 100));

        // Validate that Mac DB successfully intercepted ONLY the mac command
        const macOutputs = dbMac.query('SELECT * FROM events WHERE type = ?', ['RUNTIME_OUTPUT']) as any[];
        expect(macOutputs.length).toBe(1);
        expect(macOutputs[0].actor).toBe('MacBook');
        expect(JSON.parse(macOutputs[0].payload).text).toBe('mocked macbook npm test output');

        // Validate that Linux DB successfully intercepted ONLY the linux command
        const linuxOutputs = dbLinux.query('SELECT * FROM events WHERE type = ?', ['RUNTIME_OUTPUT']) as any[];
        expect(linuxOutputs.length).toBe(1);
        expect(linuxOutputs[0].actor).toBe('LinuxWorker');
        expect(JSON.parse(linuxOutputs[0].payload).text).toBe('mocked linux python output');
    });
});
