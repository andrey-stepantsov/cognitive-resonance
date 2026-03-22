import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { forecastInferenceCosts, detectAbusePatterns, auditZombieKeys, evaluateAgentAccuracy } from '../sreService';

describe('sreService', () => {
    let env: any;
    let mockFetch: any;
    let originalFetch: any;

    beforeEach(() => {
        originalFetch = global.fetch;
        mockFetch = vi.fn();
        global.fetch = mockFetch;
        env = {
            GEMINI_API_KEY: 'test-key',
            VECTORIZE: {
                query: vi.fn().mockResolvedValue({
                    matches: [{ score: 0.9, metadata: { content: 'doc chunk' } }]
                })
            },
            DB: {
                prepare: vi.fn().mockReturnValue({
                    bind: vi.fn().mockReturnValue({
                        first: vi.fn(),
                        all: vi.fn()
                    })
                })
            }
        };
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('forecastInferenceCosts calculates costs based on estimated_tokens', async () => {
        env.DB.prepare = vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue({ total_tokens: 100000 })
            })
        });

        const result = await forecastInferenceCosts(env);
        expect(result.trailing_30_days_tokens).toBe(100000);
        expect(result.forecasted_cost_usd).toBe(7.5);
    });

    it('detectAbusePatterns flags IPs with high 401/429 errors', async () => {
        const mockResults = [{ ip_address: '1.2.3.4', error_count: 50 }];
        env.DB.prepare = vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnValue({
                all: vi.fn().mockResolvedValue({ results: mockResults })
            })
        });

        const result = await detectAbusePatterns(env);
        expect(result.flagged_ips).toEqual(mockResults);
    });

    it('detectAbusePatterns handles missing bot_logs table', async () => {
        env.DB.prepare = vi.fn().mockImplementation(() => {
            throw new Error('no such table: bot_logs');
        });

        const result = await detectAbusePatterns(env);
        expect(result.error).toBe('bot_logs table not found');
        expect(result.flagged_ips).toEqual([]);
    });

    it('auditZombieKeys identifies unused API keys', async () => {
        const mockResults = [{ user_id: 'user1', last_used_at: 100 }];
        env.DB.prepare = vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnValue({
                all: vi.fn().mockResolvedValue({ results: mockResults })
            })
        });

        const result = await auditZombieKeys(env);
        expect(result.zombie_keys).toEqual(mockResults);
    });

    it('evaluateAgentAccuracy runs RAG and LLM evaluation on recent Guide interactions', async () => {
        const mockEvents = [
            { id: '1', session_id: 's1', timestamp: 200, actor: 'Guide', payload: '{"content":"guide reply"}' },
            { id: '2', session_id: 's1', timestamp: 100, actor: 'Human', payload: '{"content":"user question"}' }
        ];

        env.DB.prepare = vi.fn().mockReturnValue({
            all: vi.fn().mockResolvedValue({ results: mockEvents })
        });

        // 1st fetch: embedding
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockResolvedValue({ embedding: { values: [0.1, 0.2] } })
        });

        // 2nd fetch: llm evaluation
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockResolvedValue({
                candidates: [{ content: { parts: [{ text: '{"dissonance_score": 10, "reason": "mostly accurate"}' }] } }]
            })
        });

        const result = await evaluateAgentAccuracy(env, 'sre');
        
        expect(env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT id, session_id, timestamp, actor, payload FROM events'));
        expect(mockFetch).toHaveBeenCalledTimes(2);
        
        const embedCall = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(embedCall.content.parts[0].text).toBe('user question');

        expect(env.VECTORIZE.query).toHaveBeenCalledWith([0.1, 0.2], { topK: 3 });

        const llmCall = JSON.parse(mockFetch.mock.calls[1][1].body);
        expect(llmCall.contents[0].parts[0].text).toContain('guide reply');
        expect(llmCall.contents[0].parts[0].text).toContain('doc chunk');

        expect(result.evaluated_session).toBe('s1');
        expect(result.evaluation.dissonance_score).toBe(10);
        expect(result.evaluation.reason).toBe('mostly accurate');
    });

    it('evaluateAgentAccuracy handles case with no paired Guide/Human events', async () => {
        env.DB.prepare = vi.fn().mockReturnValue({
            all: vi.fn().mockResolvedValue({ results: [{ id: '1', session_id: 's1', timestamp: 200, actor: 'Human', payload: 'foo' }] })
        });

        const result = await evaluateAgentAccuracy(env, 'sre');
        expect(result.error).toBe('Could not pair a Guide response with a User prompt for evaluation');
    });
});
