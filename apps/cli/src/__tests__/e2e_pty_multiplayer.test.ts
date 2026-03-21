import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseEngine } from '../db/DatabaseEngine';
import { runSyncDaemon } from '../commands/serve';
import { Materializer } from '@cr/core/src/services/Materializer';
import * as fs from 'fs';
import * as path from 'path';
import os from 'os';
import * as pty from 'node-pty';

vi.mock('../utils/api', () => ({
    fetchSessionToken: vi.fn().mockResolvedValue('mock-token'),
    getCliToken: vi.fn().mockReturnValue('mock-token')
}));

vi.mock('node-pty', () => {
    let mockOnDataCb: any = null;
    return {
        spawn: vi.fn((shell, args, options) => {
            return {
                onData: (cb: any) => { mockOnDataCb = cb; },
                write: vi.fn((data: string) => {
                    if (mockOnDataCb) {
                        mockOnDataCb(data); // typical PTY echo
                        if (data.includes('echo ')) {
                            // Extract what was echoed safely
                            const match = data.match(/echo '(.*)'/);
                            if (match) mockOnDataCb(`\r\n${match[1]}\r\n`);
                        }
                    }
                })
            };
        })
    };
});

// Mock fetch to simulate cloud push/pull
global.fetch = vi.fn();

describe('E2E: PTY Multiplayer Terminal Sync', () => {
    let db: DatabaseEngine;
    const testDbPath = path.join(os.tmpdir(), `test_pty_sync_${Date.now()}.sqlite`);
    const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn()
    };
    const mockClients = new Set<any>();

    beforeEach(() => {
        db = new DatabaseEngine(testDbPath);
        vi.clearAllMocks();
        vi.spyOn(Materializer.prototype, 'computeAndMaterialize').mockResolvedValue();
        
        // Mock fetch to always succeed with no incoming generic events
        (global.fetch as any).mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ events: [] })
        });
    });

    afterEach(() => {
        try { fs.unlinkSync(testDbPath); } catch (e) {}
    });

    it('should intercept TERMINAL_SPAWN, boot PTY, and stream TERMINAL_INPUT to TERMINAL_OUTPUT', async () => {
        const sessionId = 'pty-multiplayer-session';
        const hostname = 'test-host';

        // 1. Simulate Cloud sending a TERMINAL_SPAWN event targeting this host
        (global.fetch as any).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                events: [{
                    id: '11111111-1111-1111-1111-111111111111',
                    session_id: sessionId,
                    timestamp: Date.now(),
                    actor: 'Cloud-User',
                    type: 'TERMINAL_SPAWN',
                    payload: JSON.stringify({ target: hostname }),
                    previous_event_id: null,
                    sync_status: 'SYNCED'
                }]
            })
        });

        // Run daemon to pull the spawn event
        await runSyncDaemon(db, mockClients, mockLogger, hostname);
        
        // Wait for materializer promise and pty boot
        await new Promise(r => setTimeout(r, 50));
        
        expect(pty.spawn).toHaveBeenCalled();
        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Spawning new PTY terminal'));

        // 2. Simulate User A sending a TERMINAL_INPUT event
        (global.fetch as any).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                events: [{
                    id: '22222222-2222-2222-2222-222222222222',
                    session_id: sessionId,
                    timestamp: Date.now(),
                    actor: 'User-A',
                    type: 'TERMINAL_INPUT',
                    payload: JSON.stringify({ target: hostname, input: "echo 'Hello Multiplayer'\n" }),
                    previous_event_id: '11111111-1111-1111-1111-111111111111',
                    sync_status: 'SYNCED'
                }]
            })
        });

        await runSyncDaemon(db, mockClients, mockLogger, hostname);

        // Wait for the debouncer chunking to fire (100ms)
        await new Promise(r => setTimeout(r, 150));

        // 3. Assert Output streamed to local DB correctly
        const outgoingOutputs = db.query('SELECT * FROM events WHERE type = ?', ['TERMINAL_OUTPUT']) as any[];
        expect(outgoingOutputs.length).toBeGreaterThan(0);
        
        // Combined payload text should contain the echo response
        const fullTerminalText = outgoingOutputs.map(e => JSON.parse(e.payload).text).join('');
        expect(fullTerminalText).toContain("echo 'Hello Multiplayer'");
        expect(fullTerminalText).toContain("Hello Multiplayer"); // The computed response
    });
});
