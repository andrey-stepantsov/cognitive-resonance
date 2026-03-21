import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseEngine } from '../db/DatabaseEngine';
import { runSyncDaemon } from '../commands/serve';
import { saveCliToken, clearCliToken, TOKEN_FILE_PATH } from '../utils/api';
import * as fs from 'fs';
import * as path from 'path';
import os from 'os';

describe('E2E: Graceful Auth Fatal Handling', () => {
    let db: DatabaseEngine;
    const testDbPath = path.join(os.tmpdir(), `test_auth_fatal_${Date.now()}.sqlite`);
    const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn()
    };
    const mockClients = new Set<any>();

    beforeEach(() => {
        db = new DatabaseEngine(testDbPath);
        vi.clearAllMocks();
        
        // Setup a mock CLI token so fetchSessionToken triggers
        saveCliToken('mock-revoked-token');

        // Spy on process.exit to prevent the vitest runner from actually terminating!
        vi.spyOn(process, 'exit').mockImplementation((code: any) => {
            throw new Error(`MOCKED_PROCESS_EXIT_CODE_${code}`);
        });
    });

    afterEach(() => {
        try { fs.unlinkSync(testDbPath); } catch (e) {}
        try { fs.unlinkSync(TOKEN_FILE_PATH); } catch (e) {}
        vi.restoreAllMocks();
    });

    it('should intercept 403 Revoked Identity, purge the token, and terminate the client daemon cleanly', async () => {
        // 1. Mock the specific /api/auth/exchange call to return a 403
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 403,
            json: async () => ({ error: 'Identity access revoked' })
        });

        // 2. Run the Daemon iteration
        //    Because we throw MOCKED_PROCESS_EXIT_CODE_1 during process.exit(1), we must catch it
        let daemonThrownError: any;
        try {
            await runSyncDaemon(db, mockClients, mockLogger, 'test-host');
        } catch (e) {
            daemonThrownError = e;
        }

        // 3. Assertions
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/auth/exchange'), expect.any(Object));

        expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('[CRITICAL] Authentication Failed: Identity access revoked'));
        expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('[CRITICAL] Your Identity Token is invalid'));

        // Validate graceful process.exit(1) was executed natively inside the catch block
        expect(process.exit).toHaveBeenCalledWith(1);
        expect(daemonThrownError?.message).toBe('MOCKED_PROCESS_EXIT_CODE_1');

        // Validate the CLI token was securely cleared from the developer's disk
        expect(fs.existsSync(TOKEN_FILE_PATH)).toBe(false);
    });

    it('should intercept 401 Invalid Signature, purge the token, and terminate the client daemon cleanly', async () => {
        // Mock the specific /api/auth/exchange call to return a 401 Expired/Invalid
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            json: async () => ({ error: 'Invalid Identity Token signature' })
        });

        let daemonThrownError: any;
        try {
            await runSyncDaemon(db, mockClients, mockLogger, 'test-host');
        } catch (e) {
            daemonThrownError = e;
        }

        expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('[CRITICAL] Authentication Failed: Invalid Identity Token signature'));
        expect(process.exit).toHaveBeenCalledWith(1);
        expect(fs.existsSync(TOKEN_FILE_PATH)).toBe(false);
    });
});
