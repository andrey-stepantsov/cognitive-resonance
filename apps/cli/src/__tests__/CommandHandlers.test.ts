import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleInteractiveCommand, CLIControllerContext } from '../controllers/CommandHandlers.js';
import { CommandAction } from '@cr/core/src/services/CommandParser.js';
import * as api from '../utils/api.js';

vi.mock('../utils/api', () => ({
  backendFetch: vi.fn(),
  saveCliToken: vi.fn(),
  getCliToken: vi.fn(),
}));

describe('CommandHandlers', () => {
    let mockCtx: any;
    
    beforeEach(() => {
        vi.clearAllMocks();
        mockCtx = {
            state: { sessionId: 'test-session', currentModel: 'test-model', chatHistory: [] },
            db: { query: vi.fn().mockReturnValue([]) },
            rl: { question: vi.fn(), questionHidden: vi.fn() },
            io: { print: vi.fn(), write: vi.fn() },
            updatePrompt: vi.fn(),
            loadSessionFromDB: vi.fn(),
            text: '',
            command: { action: CommandAction.UNKNOWN, raw: '', args: [] }
        };
    });

    it('handles LOGIN successfully', async () => {
        mockCtx.command = { action: CommandAction.LOGIN, args: ['test@user.com', 'password123'] };
        vi.mocked(api.backendFetch).mockResolvedValue({
            ok: true, json: async () => ({ token: 'mock-token', user: { name: 'TestUser' } })
        } as any);

        await handleInteractiveCommand(mockCtx);

        expect(api.backendFetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST' }));
        expect(api.saveCliToken).toHaveBeenCalledWith('mock-token');
        expect(mockCtx.updatePrompt).toHaveBeenCalledWith('TestUser');
        expect(mockCtx.io.print).toHaveBeenCalledWith('Success! Logged in as TestUser');
    });

    it('handles SIGNUP successfully', async () => {
        mockCtx.command = { action: CommandAction.SIGNUP, args: ['new@user.com', 'password123', 'NewUser'] };
        vi.mocked(api.backendFetch).mockResolvedValue({
            ok: true, json: async () => ({ token: 'mock-token' })
        } as any);

        await handleInteractiveCommand(mockCtx);

        expect(api.backendFetch).toHaveBeenCalledWith('/api/auth/signup', expect.objectContaining({ method: 'POST' }));
        expect(api.saveCliToken).toHaveBeenCalledWith('mock-token');
        expect(mockCtx.updatePrompt).toHaveBeenCalledWith('NewUser');
        expect(mockCtx.io.print).toHaveBeenCalledWith('Success! Account created for new@user.com');
    });

    it('handles WHOAMI successfully', async () => {
        mockCtx.command = { action: CommandAction.WHOAMI, args: [] };
        vi.mocked(api.backendFetch).mockResolvedValue({
            ok: true, json: async () => ({ user: { name: 'CurrentUser', email: 'current@user.com' } })
        } as any);

        await handleInteractiveCommand(mockCtx);

        expect(api.backendFetch).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({ method: 'GET' }));
        expect(mockCtx.io.print).toHaveBeenCalledWith(expect.stringContaining('Logged in as:'));
    });

    it('handles HOST_LS with no hosts', async () => {
        mockCtx.command = { action: CommandAction.HOST_LS, args: [] };
        mockCtx.db.query.mockReturnValue([]);

        await handleInteractiveCommand(mockCtx);

        expect(mockCtx.io.print).toHaveBeenCalledWith('  No hosts have announced presence yet.');
    });

    it('handles HOST_LS with active hosts', async () => {
        mockCtx.command = { action: CommandAction.HOST_LS, args: [] };
        const mockPayload = JSON.stringify({ capabilities: { os: 'linux', arch: 'x64', node: true } });
        mockCtx.db.query.mockReturnValue([
           { actor: 'Host-1', payload: mockPayload, timestamp: Date.now() }
        ]);

        await handleInteractiveCommand(mockCtx);

        expect(mockCtx.io.print).toHaveBeenCalledWith(expect.stringContaining('HOST IDENTITY'));
        expect(mockCtx.io.print).toHaveBeenCalledWith(expect.stringContaining('Host-1'));
    });

    it('handles HOST_INFO for existing host', async () => {
        mockCtx.command = { action: CommandAction.HOST_INFO, args: ['Host-1'] };
        const mockPayload = JSON.stringify({ capabilities: { os: 'mac', arch: 'arm64', python: true } });
        mockCtx.db.query.mockReturnValue([
           { actor: 'Host-1', payload: mockPayload, timestamp: Date.now() }
        ]);

        await handleInteractiveCommand(mockCtx);

        expect(mockCtx.db.query).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM events'), ['Host-1']);
        expect(mockCtx.io.print).toHaveBeenCalledWith(expect.stringContaining('[Host Info: Host-1]'));
    });

    it('handles SESSION_DELETE graceful degradation', async () => {
        mockCtx.command = { action: CommandAction.SESSION_DELETE, args: [] };
        await handleInteractiveCommand(mockCtx);
        expect(mockCtx.io.print).toHaveBeenCalledWith('[System] Hard deletion is disabled. Please use /archive instead.');
    });

    it('handles INVITE graceful degradation', async () => {
        mockCtx.command = { action: CommandAction.INVITE, args: [] };
        await handleInteractiveCommand(mockCtx);
        expect(mockCtx.io.print).toHaveBeenCalledWith('[System] Invite is a PWA cloud feature (not supported in local SQLite yet).');
    });
});
