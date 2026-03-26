import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processAiQueueJob } from '../aiService';
import { validateEventSequence, ExecutionRequestedPayloadSchema } from 'cr-core-contracts';

describe('Trinity Persona & Vectorization (Phase 5 E2E)', () => {
    let env: any;
    let mockFetch: any;
    let originalFetch: any;

    beforeEach(() => {
        originalFetch = global.fetch;
        mockFetch = vi.fn();
        global.fetch = mockFetch;
        const mockBind = vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ has_graph: 1, semantic_graph: '{"semanticNodes":[],"semanticEdges":[]}' }),
            all: vi.fn().mockResolvedValue({ results: [{ actor: 'Human', payload: '{"content":"compile and run this code"}' }] }),
            run: vi.fn().mockResolvedValue({ success: true })
        });

        env = {
            GEMINI_API_KEY: 'test-key',
            VECTORIZE: {
                insert: vi.fn().mockResolvedValue({}),
                query: vi.fn().mockResolvedValue({ matches: [] })
            },
            AI: {
                run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2]] }) // Mock embedding
            },
            DB: {
                prepare: vi.fn().mockReturnValue({ bind: mockBind }),
                batch: vi.fn()
            },
            mockBind // expose mockBind for assertions
        };
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('injects Trinity system prompt and requires EXECUTION_REQUESTED schema', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockResolvedValue({
                candidates: [{ content: { parts: [{ text: '{"command":["echo", "hello"]}' }] } }]
            }),
            text: vi.fn().mockResolvedValue('ok')
        });

        await processAiQueueJob({ sessionId: 'session-123', userId: 'user-1', type: 'reply', targetAgent: 'trinity' }, env);

        expect(mockFetch).toHaveBeenCalled();
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);

        // Verify TRINITY Prompt Initialization
        expect(reqBody.system_instruction.parts[0].text).toContain('You are the @Trinity persona');
        expect(reqBody.generationConfig.responseMimeType).toBe('application/json');
        
        // Verify output schema targets EXECUTION_REQUESTED JSON structure
        expect(reqBody.generationConfig.responseSchema.properties.command).toBeDefined();

        // Verify the DB insertion intercepted the trinity output and casted to EXECUTION_REQUESTED event
        const bindCalls = env.mockBind.mock.calls;
        // Find the bind call for events insertion (it binds 7 args, index 3 is 'Agent')
        const insertBindCall = bindCalls.find((call: any[]) => call.length >= 7 && call[3] === 'Agent'); 
        
        expect(insertBindCall).toBeDefined();
        // args: eventId, sessionId, timestamp, 'Agent', eventType, JSON.stringify(finalPayload), userId
        expect(insertBindCall[4]).toBe('EXECUTION_REQUESTED');
        
        const storedPayload = JSON.parse(insertBindCall[5]);
        
        // Validate against cr-core-contracts
        expect(() => {
            ExecutionRequestedPayloadSchema.parse(storedPayload);
        }).not.toThrow();
        expect(storedPayload.command).toEqual(["echo", "hello"]);
    });

    it('embeds incrementally added semantic nodes into Vectorize when graph mutates', async () => {
        // Mock DB to trace session writes mapping
        env.DB.prepare = vi.fn().mockImplementation((query) => {
            return {
                bind: vi.fn().mockReturnValue({
                    first: vi.fn().mockResolvedValue({ has_graph: 1, semantic_graph: '{"semanticNodes":[],"semanticEdges":[]}' }),
                    all: vi.fn().mockResolvedValue({ results: [{ actor: 'Human', payload: 'msg' }] }),
                    run: vi.fn().mockResolvedValue({ success: true })
                })
            };
        });

        // Gemini replies with new addedNodes
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockResolvedValue({
                candidates: [{ content: { parts: [{ text: '{"replyText":"I updated the graph", "addedNodes":[{"id":"chunk1","label":"User explained authentication."}]}' }] } }]
            }),
            text: vi.fn().mockResolvedValue('ok')
        });

        // Trigger native process (which triggers incremental graph build)
        await processAiQueueJob({ sessionId: 'session-123', userId: 'user-1', type: 'reply', targetAgent: 'base' }, env);

        // Verify Vectorize insertion was called
        expect(env.AI.run).toHaveBeenCalledWith('@cf/baai/bge-base-en-v1.5', { text: ['User explained authentication.'] });
        expect(env.VECTORIZE.insert).toHaveBeenCalledTimes(1);

        const insertArgs = env.VECTORIZE.insert.mock.calls[0][0];
        expect(insertArgs[0].id).toBe('chunk1');
        expect(insertArgs[0].metadata.domain).toBe('marker');
        expect(insertArgs[0].metadata.sessionId).toBe('session-123');
    });
});
