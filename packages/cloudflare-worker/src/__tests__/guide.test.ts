import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processAiQueueJob } from '../aiService';

// Mock dependencies
vi.mock('../telegramRoutes', () => ({
  sendTelegramMessage: vi.fn()
}));

const mockDB = {
  prepare: vi.fn(),
  batch: vi.fn()
};

const mockAI = {
  run: vi.fn()
};

const mockVectorize = {
  query: vi.fn(),
  upsert: vi.fn()
};

const mockEnv = {
  DB: mockDB,
  AI: mockAI,
  VECTORIZE: mockVectorize,
  GEMINI_API_KEY: 'test-api-key'
};

const D1_MOCK_EVENTS = {
    results: [
        { actor: 'LOCAL_USER', payload: '{"text":"@Guide how does this app work?"}' }
    ]
};

// Mock global fetch
const originalFetch = global.fetch;

describe('Guide Persona RAG Injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default DB Mock
    mockDB.prepare.mockImplementation((query: string) => {
      return {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue(D1_MOCK_EVENTS),
        run: vi.fn().mockResolvedValue(true)
      };
    });
  });

  it('guide: deterministic RAG context payload injection', async () => {
    // 1st Fetch: Return a functionCall forcing RAG
    const firstFetchResponse = {
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              functionCall: {
                name: 'queryVectorSearch',
                args: { query: 'how does this app work?' }
              }
            }]
          }
        }]
      })
    };

    // 2nd Fetch: Return standard text from Guide
    const secondFetchResponse = {
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{ text: 'Here is how it works: [Source: mock.md]' }]
          }
        }]
      })
    };

    // Mock fetch to track request bodies
    let fetchCallCount = 0;
    let finalRequestBody: any = null;

    global.fetch = vi.fn().mockImplementation(async (url, options) => {
      fetchCallCount++;
      if (fetchCallCount === 1) return firstFetchResponse;
      
      finalRequestBody = JSON.parse(options.body);
      return secondFetchResponse;
    });

    // Mock AI vectorization
    mockAI.run.mockResolvedValue({ data: [[0.1, 0.2, 0.3]] });

    // Mock Vectorize response
    mockVectorize.query.mockResolvedValue({
      matches: [
         { score: 0.95, metadata: { content: 'This is the verified deterministic RAG block.' } },
         { score: 0.88, metadata: { content: 'Secondary info block.' } }
      ]
    });

    const job = {
       sessionId: 'test-session',
       userId: 'test-user',
       type: 'chat',
       targetAgent: 'guide'
    };

    await processAiQueueJob(job, mockEnv as any);

    // Assert that Vectorize was explicitly queried with the metadata filters matching the System Architecture
    expect(mockVectorize.query).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ topK: 5 })
    );

    // Assert that fetch was called twice (tool request + tool response)
    expect(global.fetch).toHaveBeenCalledTimes(2);

    // Assert the final payload injected into Gemini contained our exact mock RAG response
    expect(finalRequestBody).toBeDefined();
    
    // We expect the System Prompt pipeline to have safely received the toolResponse natively
    const parts = finalRequestBody.contents[finalRequestBody.contents.length - 1].parts;
    const injectedToolResponse = parts[0].functionResponse;
    
    expect(injectedToolResponse.name).toBe('queryVectorSearch');
    expect(injectedToolResponse.response.result).toContain('This is the verified deterministic RAG block.');
    expect(injectedToolResponse.response.result).toContain('Secondary info block.');
    
    // Provide cleanup
    global.fetch = originalFetch;
  });

  it('guide: evaluates factual dissonance (LLM-as-a-judge)', async () => {
    const { evaluateAgentAccuracy } = await import('../sreService');
    
    // Mock D1 to return a recent Guide and User event
    mockDB.prepare.mockImplementation((query: string) => {
      return {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({
          results: [
            { id: '1', session_id: 's1', timestamp: 200, actor: 'Guide', payload: JSON.stringify({ content: "The tool is npx tsx." }) },
            { id: '2', session_id: 's1', timestamp: 100, actor: 'Human', payload: JSON.stringify({ content: "How do I run it?" }) }
          ]
        })
      };
    });

    // Mock AI vectorization
    mockAI.run.mockResolvedValue({ data: [[0.1, 0.2, 0.3]] });

    // Mock Vectorize response
    mockVectorize.query.mockResolvedValue({
      matches: [
         { score: 0.99, metadata: { content: 'To execute the CLI, run npx tsx apps/cli/src/index.ts.' } }
      ]
    });

    // Mock Gemini LLM Evaluation Payload
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({ dissonance_score: 5, reason: "The agent effectively summarized the execution documentation accurately." })
            }]
          }
        }]
      })
    });

    const result = await evaluateAgentAccuracy(mockEnv as any, 'Guide');
    
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.error).toBeUndefined();
    expect(result.evaluation.dissonance_score).toBe(5);
    expect(result.evaluation.reason).toContain('effectively summarized');
    expect(result.user_prompt).toBe('How do I run it?');
    
    global.fetch = originalFetch;
  });

  it('guide: asserts artefact citation format generation inside D1 telemetry', async () => {
    let capturedPayload: any = null;
    
    // Override DB mock to strictly capture the INSERT INTO events payload bind
    const mockBind = vi.fn().mockImplementation((...args) => {
      // The 6th parameter of the bind in aiService is the JSON payload.
      if (args.length >= 6 && typeof args[5] === 'string' && args[5].includes('role":"agent"')) {
         capturedPayload = JSON.parse(args[5]);
      }
      return { run: vi.fn().mockResolvedValue(true), first: vi.fn(), all: vi.fn().mockResolvedValue(D1_MOCK_EVENTS) };
    });
    
    mockDB.prepare.mockReturnValue({
      bind: mockBind,
      first: vi.fn().mockResolvedValue(null),
      all: vi.fn().mockResolvedValue(D1_MOCK_EVENTS),
      run: vi.fn().mockResolvedValue(true)
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{ text: 'The orchestration layer restricts cross-host evaluation automatically. [Source: architecture.md]' }]
          }
        }]
      })
    });

    await processAiQueueJob({ sessionId: 't1', userId: 'u1', type: 'chat', targetAgent: 'guide' }, mockEnv as any);

    expect(capturedPayload).not.toBeNull();
    
    // Core Assertion: Guarantee the mathematical trace is properly forwarded into the timeline
    expect(capturedPayload.content).toMatch(/\[Source:\s(.*?)\]/);
    
    global.fetch = originalFetch;
  });
});
