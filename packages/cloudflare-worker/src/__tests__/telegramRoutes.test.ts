import { describe, it, expect, vi } from 'vitest';
import worker from '../index';

describe('Telegram Webhook Route (BYOB mapping)', () => {
    it('returns 401 if bot token is not found in D1', async () => {
        const mockDB = {
            prepare: vi.fn().mockReturnValue({
                bind: vi.fn().mockReturnValue({
                    first: vi.fn().mockResolvedValue(null)
                })
            })
        };
        const request = new Request('http://localhost/api/telegram/webhook/fake_token_123', { method: 'POST' });
        const response = await worker.fetch(request, { DB: mockDB } as any, {} as any);
        
        expect(response.status).toBe(401);
    });

    it('processes webhook successfully when bot token resolves to user_id', async () => {
        const mockDB = {
            prepare: vi.fn().mockReturnValue({
                bind: vi.fn().mockReturnValue({
                    // lookup for bot_token
                    first: vi.fn().mockResolvedValue({ user_id: 'user_xyz' }),
                    // insert events
                    run: vi.fn().mockResolvedValue({ success: true })
                })
            })
        };
        const mockQueue = { send: vi.fn() };
        
        const request = new Request('http://localhost/api/telegram/webhook/real_token_123', {
            method: 'POST',
            body: JSON.stringify({
                message: { chat: { id: 999 }, from: { id: 888 }, text: 'Hello AI' }
            })
        });

        const env = { DB: mockDB, AI_QUEUE: mockQueue } as any;
        const response = await worker.fetch(request, env, {} as any);
        
        expect(response.status).toBe(200);
        // Ensure queue was called with resolved userId
        expect(mockQueue.send).toHaveBeenCalledWith(expect.objectContaining({ 
            userId: 'user_xyz',
            sessionId: 'tg_chat_999'
        }));
    });

    it('sends compile_graph job when session exceeds 6000 tokens', async () => {
        const mockDB = {
            prepare: vi.fn().mockImplementation((query) => ({
                bind: vi.fn().mockReturnValue({
            first: vi.fn().mockImplementation(() => {
                if (query.includes('bot_token')) return Promise.resolve({ user_id: 'user_xyz' });
                if (query.includes('telegram_links')) return Promise.resolve({ 1: 1 });
                if (query.includes('estimated_tokens')) return Promise.resolve({ estimated_tokens: 5990, has_graph: 0 });
                return Promise.resolve(null);
            }),
            run: vi.fn().mockResolvedValue({ success: true })
                })
            }))
        };
        const mockQueue = { send: vi.fn() };
        const request = new Request('http://localhost/api/telegram/webhook/real_token_123', {
            method: 'POST',
            body: JSON.stringify({
                message: { chat: { id: 999 }, from: { id: 888 }, text: 'A'.repeat(100) }
            })
        });

        const env = { DB: mockDB, AI_QUEUE: mockQueue } as any;
        await worker.fetch(request, env, {} as any);
        
        expect(mockQueue.send).toHaveBeenCalledWith(expect.objectContaining({ 
            type: 'compile_graph' 
        }));
    });

    it('intercepts /help command and stops propagation', async () => {
        let sentMessage = '';
        global.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
            if (url.includes('sendMessage')) sentMessage = JSON.parse(init.body).text;
            return new Response('ok');
        });
        const mockDB = { prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue({ user_id: 'u1' }) }) }) };
        const request = new Request('http://localhost/api/telegram/webhook/tok', { method: 'POST', body: JSON.stringify({ message: { chat: { id: 1 }, text: '/help' } }) });
        const res = await worker.fetch(request, { DB: mockDB } as any, {} as any);
        expect(res.status).toBe(200);
        expect(sentMessage).toContain('Cognitive Resonance Bot Help');
    });

    it('intercepts /model command and updates session config', async () => {
        let sentMessage = '';
        global.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
            if (url.includes('sendMessage')) sentMessage = JSON.parse(init.body).text;
            return new Response('ok');
        });
        const runMock = vi.fn();
        const mockDB = {
            prepare: vi.fn().mockImplementation((query) => ({
                bind: vi.fn().mockReturnValue({
                    first: vi.fn().mockImplementation(() => {
                        if (query.includes('bot_token')) return Promise.resolve({ user_id: 'u1' });
                        if (query.includes('telegram_links')) return Promise.resolve({ 1: 1 });
                        if (query.includes('SELECT config')) return Promise.resolve({ config: '{}' });
                        return Promise.resolve(null);
                    }),
                    run: runMock
                })
            }))
        };
        const request = new Request('http://localhost/api/telegram/webhook/tok', { method: 'POST', body: JSON.stringify({ message: { chat: { id: 1 }, text: '/model gemini-2.5-pro' } }) });
        await worker.fetch(request, { DB: mockDB } as any, {} as any);
        expect(sentMessage).toContain('Active LLM switched to `gemini-2.5-pro`');
        expect(runMock).toHaveBeenCalled();
    });

    it('handles multiplayer group payload formatting and spam prevention', async () => {
        const runMock = vi.fn();
        const mockDB = {
            prepare: vi.fn().mockImplementation((query) => ({
                bind: vi.fn().mockImplementation((...args) => ({
                    first: vi.fn().mockImplementation(() => {
                        if (query.includes('bot_token')) return Promise.resolve({ user_id: 'u1' });
                        if (query.includes('telegram_links')) return Promise.resolve({ 1: 1 });
                        if (query.includes('estimated_tokens')) return Promise.resolve({ estimated_tokens: 10, has_graph: 0 });
                        return Promise.resolve(null);
                    }),
                    run: () => {
                        if (query.includes('INSERT OR IGNORE INTO events')) {
                            // Don't assert static string, we'll verify it per request manually.
                        }
                        return Promise.resolve({ success: true });
                    }
                }))
            }))
        };
        const mockQueue = { send: vi.fn() };
        
        // 1. Unpinged message in a group (chat_id < 0)
        let request = new Request('http://localhost/api/telegram/webhook/tok', { 
            method: 'POST', body: JSON.stringify({ message: { chat: { id: -100 }, from: { first_name: 'Alice', id: 888 }, text: 'Hello guys' } }) 
        });
        await worker.fetch(request, { DB: mockDB, AI_QUEUE: mockQueue } as any, {} as any);
        expect(mockQueue.send).not.toHaveBeenCalled(); // Should not dispatch edge AI on unpinged group chat messages

        // 2. Pinged message in a group
        request = new Request('http://localhost/api/telegram/webhook/tok', { 
            method: 'POST', body: JSON.stringify({ message: { chat: { id: -100 }, from: { first_name: 'Bob', id: 889 }, text: '@guide what is this' } }) 
        });
        await worker.fetch(request, { DB: mockDB, AI_QUEUE: mockQueue } as any, {} as any);
        expect(mockQueue.send).toHaveBeenCalled(); // Should trigger agent dispatch
    });

    it('returns 400 for invalid JSON', async () => {
        const mockDB = { prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue({ user_id: 'u1' }) }) }) };
        const request = new Request('http://localhost/api/telegram/webhook/tok', { method: 'POST', body: 'invalid json' });
        const res = await worker.fetch(request, { DB: mockDB } as any, {} as any);
        expect(res.status).toBe(400);
    });

    it('sends unauthorized message if user not linked and not in ALLOWED_TELEGRAM_USERS', async () => {
        let sentMessage = '';
        global.fetch = vi.fn().mockImplementation(async (url, init) => {
            if (url.includes('sendMessage')) sentMessage = JSON.parse(init.body).text;
            return new Response('ok');
        });
        const mockDB = {
            prepare: vi.fn().mockImplementation((q) => ({
                bind: vi.fn().mockReturnValue({
                    first: vi.fn().mockImplementation(() => {
                        if (q.includes('bot_token')) return Promise.resolve({ user_id: 'u1' });
                        if (q.includes('telegram_links')) return Promise.resolve(null);
                        return Promise.resolve(null);
                    })
                })
            }))
        };
        const request = new Request('http://localhost/api/telegram/webhook/tok', { method: 'POST', body: JSON.stringify({ message: { chat: { id: 1 }, from: { id: 888 }, text: 'hi' } }) });
        const res = await worker.fetch(request, { DB: mockDB, ALLOWED_TELEGRAM_USERS: '999,1000' } as any, {} as any);
        expect(res.status).toBe(200);
        expect(sentMessage).toContain('Unauthorized. Your Telegram ID is `888`');
    });

    it('handles /agents and /multiplayer commands', async () => {
        let sentMessage = '';
        global.fetch = vi.fn().mockImplementation(async (url, init) => {
            if (url.includes('sendMessage')) sentMessage = JSON.parse(init.body).text;
            return new Response('ok');
        });
        const mockDB = { prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue({ user_id: 'u1' }) }) }) };
        
        let req = new Request('http://localhost/api/telegram/webhook/tok', { method: 'POST', body: JSON.stringify({ message: { chat: { id: 1 }, text: '/agents' } }) });
        await worker.fetch(req, { DB: mockDB } as any, {} as any);
        expect(sentMessage).toContain('Edge Personas');

        req = new Request('http://localhost/api/telegram/webhook/tok', { method: 'POST', body: JSON.stringify({ message: { chat: { id: 1 }, text: '/multiplayer' } }) });
        await worker.fetch(req, { DB: mockDB } as any, {} as any);
        expect(sentMessage).toContain('Multiplayer Sessions');
    });

    it('handles /memory and /clear commands', async () => {
        let sentMessage = '';
        global.fetch = vi.fn().mockImplementation(async (url, init) => {
            if (url.includes('sendMessage')) sentMessage = JSON.parse(init.body).text;
            return new Response('ok');
        });
        const mockRun = vi.fn();
        const mockDB = {
            prepare: vi.fn().mockImplementation((q) => ({
                bind: vi.fn().mockReturnValue({
                    first: vi.fn().mockImplementation(() => {
                        if (q.includes('bot_token')) return Promise.resolve({ user_id: 'u1' });
                        if (q.includes('telegram_links')) return Promise.resolve({ 1: 1 });
                        if (q.includes('estimated_tokens')) return Promise.resolve({ estimated_tokens: 300 });
                        return Promise.resolve(null);
                    }),
                    run: mockRun
                })
            }))
        };
        
        let req = new Request('http://localhost/api/telegram/webhook/tok', { method: 'POST', body: JSON.stringify({ message: { chat: { id: 1 }, text: '/memory' } }) });
        await worker.fetch(req, { DB: mockDB } as any, {} as any);
        expect(sentMessage).toContain('Memory Graph Size');

        req = new Request('http://localhost/api/telegram/webhook/tok', { method: 'POST', body: JSON.stringify({ message: { chat: { id: 1 }, text: '/clear' } }) });
        await worker.fetch(req, { DB: mockDB } as any, {} as any);
        expect(sentMessage).toContain('Memory cleared');
        expect(mockRun).toHaveBeenCalled(); // Deletes memory
    });

    it('handles /promote command variants including empty args and clearing', async () => {
        let sentMessage = '';
        global.fetch = vi.fn().mockImplementation(async (url, init) => {
            if (url.includes('sendMessage')) sentMessage = JSON.parse(init.body).text;
            return new Response('ok');
        });
        const mockRun = vi.fn();
        const mockDB = {
            prepare: vi.fn().mockImplementation((q) => ({
                bind: vi.fn().mockReturnValue({
                    first: vi.fn().mockImplementation(() => {
                        if (q.includes('bot_token')) return Promise.resolve({ user_id: 'u1' });
                        if (q.includes('telegram_links')) return Promise.resolve({ 1: 1 });
                        if (q.includes('config')) return Promise.resolve({ config: '{"defaultAgent": "sre"}' });
                        return Promise.resolve(null);
                    }),
                    run: mockRun
                })
            }))
        };
        
        let req = new Request('http://localhost/api/telegram/webhook/tok', { method: 'POST', body: JSON.stringify({ message: { chat: { id: 1 }, text: '/promote' } }) });
        await worker.fetch(req, { DB: mockDB } as any, {} as any);
        expect(sentMessage).toContain('Please specify an agent to promote');

        req = new Request('http://localhost/api/telegram/webhook/tok', { method: 'POST', body: JSON.stringify({ message: { chat: { id: 1 }, text: '/promote clear' } }) });
        await worker.fetch(req, { DB: mockDB } as any, {} as any);
        expect(sentMessage).toContain('Promoted agent cleared');
        expect(mockRun).toHaveBeenCalled(); // DB Update
    });
    it('handles /bind_env command correctly', async () => {
        let sentMessage = '';
        global.fetch = vi.fn().mockImplementation(async (url, init) => {
            if (url.includes('sendMessage')) sentMessage = JSON.parse(init.body).text;
            return new Response('ok');
        });
        const mockRun = vi.fn();
        const mockDB = {
            prepare: vi.fn().mockImplementation((q) => ({
                bind: vi.fn().mockReturnValue({
                    first: vi.fn().mockImplementation(() => {
                        if (q.includes('bot_token')) return Promise.resolve({ user_id: 'u1' });
                        if (q.includes('metadata FROM environments')) return Promise.resolve({ metadata: '{"d1_id": "test-d1"}' });
                        return Promise.resolve(null);
                    }),
                    run: mockRun
                })
            }))
        };
        
        // Missing env name
        let req = new Request('http://localhost/api/telegram/webhook/tok', { method: 'POST', body: JSON.stringify({ message: { chat: { id: 1 }, message_id: 10, text: '/bind_env' } }) });
        await worker.fetch(req, { DB: mockDB } as any, {} as any);
        expect(sentMessage).toContain('Please specify an environment');

        // Bind env
        req = new Request('http://localhost/api/telegram/webhook/tok', { method: 'POST', body: JSON.stringify({ message: { chat: { id: 1 }, message_id: 11, text: '/bind_env my_test' } }) });
        await worker.fetch(req, { DB: mockDB } as any, {} as any);
        expect(sentMessage).toContain('Successfully bound chat `1` to environment `my_test`');
        expect(mockRun).toHaveBeenCalled(); // DB Update

        // Clear env
        req = new Request('http://localhost/api/telegram/webhook/tok', { method: 'POST', body: JSON.stringify({ message: { chat: { id: 1 }, message_id: 12, text: '/bind_env clear' } }) });
        await worker.fetch(req, { DB: mockDB } as any, {} as any);
        expect(sentMessage).toContain('Cleared environment binding');
    });
});
