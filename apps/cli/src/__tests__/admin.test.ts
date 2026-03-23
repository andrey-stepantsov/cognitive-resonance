import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerAdminCommands } from '../commands/admin';
import { saveCliToken, clearCliToken, TOKEN_FILE_PATH } from '../utils/api';
import * as fs from 'fs';
import * as path from 'path';

describe('E2E: Admin CLI Commands', () => {
    let program: Command;
    
    // We will intercept console.log and console.error to assert output
    let consoleLog: any;
    let consoleError: any;

    beforeEach(() => {
        vi.clearAllMocks();
        consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
        consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        program = new Command();
        registerAdminCommands(program);

        // Spy on process.exit to prevent test runner termination
        vi.spyOn(process, 'exit').mockImplementation((code: any) => {
            throw new Error(`MOCKED_PROCESS_EXIT_CODE_${code}`);
        });

        saveCliToken('mock-admin-token');
    });

    afterEach(() => {
        try { fs.unlinkSync(TOKEN_FILE_PATH); } catch(e) {}
        delete process.env.CR_ENV;
        delete process.env.CR_ADMIN_VAULT;
        vi.restoreAllMocks();
    });

    it('successfully revokes a user identity', async () => {
        global.fetch = vi.fn().mockImplementation(async (url: string) => {
            if (url.includes('/api/auth/exchange')) {
                return { ok: true, json: async () => ({ token: 'mock-session-token' }) };
            }
            return {
                ok: true,
                status: 200,
                statusText: 'OK',
                json: async () => ({ ok: true }),
                text: async () => ('')
            };
        });

        await program.parseAsync(['node', 'cr', 'admin', 'users', 'revoke', 'target-user@example.com']);
        
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/admin/users/revoke'),
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ userId: 'target-user@example.com' })
            })
        );
        expect(consoleLog).toHaveBeenCalledWith('✅ Revoked access for target-user@example.com');
    });

    it('successfully restores a user identity', async () => {
        global.fetch = vi.fn().mockImplementation(async (url: string) => {
            if (url.includes('/api/auth/exchange')) {
                return { ok: true, json: async () => ({ token: 'mock-session-token' }) };
            }
            return {
                ok: true,
                status: 200,
                statusText: 'OK',
                json: async () => ({ ok: true }),
                text: async () => ('')
            };
        });

        await program.parseAsync(['node', 'cr', 'admin', 'users', 'restore', 'target-user@example.com']);
        
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/admin/users/revoke'),
            expect.objectContaining({
                method: 'DELETE',
                body: JSON.stringify({ userId: 'target-user@example.com' })
            })
        );
        expect(consoleLog).toHaveBeenCalledWith('✅ Restored access for target-user@example.com');
    });

    it('fails gracefully when a standard user attempts to revoke', async () => {
        global.fetch = vi.fn().mockImplementation(async (url: string) => {
            if (url.includes('/api/auth/exchange')) {
                return { ok: true, json: async () => ({ token: 'mock-session-token' }) };
            }
            return {
                ok: false,
                status: 403,
                statusText: 'Forbidden',
                json: async () => ({ error: 'Forbidden: Super Admin only' }),
                text: async () => ('Forbidden: Super Admin only')
            };
        });

        let thrownError;
        try {
            await program.parseAsync(['node', 'cr', 'admin', 'users', 'revoke', 'target-user@example.com']);
        } catch (e: any) {
            thrownError = e;
        }

        expect(process.exit).toHaveBeenCalledWith(1);
        expect(thrownError?.message).toBe('MOCKED_PROCESS_EXIT_CODE_1');
        expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('❌ Failed to revoke: 403 Forbidden'));
        expect(consoleError).toHaveBeenCalledWith('Forbidden: Super Admin only');
    });

    it('supports the --env flag to set admin vault path', async () => {
        global.fetch = vi.fn().mockImplementation(async () => ({ ok: true, json: async () => ({}) }));
        await program.parseAsync(['node', 'cr', 'admin', '--env', 'prod', 'sandbox', 'list']);
        expect(process.env.CR_ENV).toBe('prod');
        expect(process.env.CR_ADMIN_VAULT).toContain('.keys/prod');
    });

    it('lists cloud sandboxes', async () => {
        global.fetch = vi.fn().mockImplementation(async (url: string) => {
            if (url.includes('/api/auth/exchange')) {
                return { ok: true, json: async () => ({ token: 'mock-session-token' }) };
            }
            if (url.includes('/api/admin/sandboxes')) {
               return {
                  ok: true,
                  json: async () => ({ sessions: [{ id: '123' }] })
               };
            }
            return { ok: false };
        });

        await program.parseAsync(['node', 'cr', 'admin', 'sandbox', 'list']);
        expect(consoleLog).toHaveBeenCalledWith('✅ Active Cloud Sandboxes:');
        expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining('123'));
    });

    it('gracefully handles missing keys when minting', async () => {
        const originalVault = process.env.CR_ADMIN_VAULT;
        process.env.CR_ADMIN_VAULT = '/path/to/non/existent/vault/dir_test_42';
        let thrownError;
        try {
            await program.parseAsync(['node', 'cr', 'admin', 'keys', 'mint', 'testuser']);
        } catch (e: any) {
            thrownError = e;
        }
        expect(process.exit).toHaveBeenCalledWith(1);
        expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('Private key not found at'));
    });
});
