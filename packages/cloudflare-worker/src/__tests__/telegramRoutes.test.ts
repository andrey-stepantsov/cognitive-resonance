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
});
