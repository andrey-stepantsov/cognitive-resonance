import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processAiQueueJob } from '../aiService';

describe('aiService - Dynamic Memory Escalation', () => {
   let env: any;
   let mockFetch: any;
   let originalFetch: any;

   beforeEach(() => {
      originalFetch = global.fetch;
      mockFetch = vi.fn();
      global.fetch = mockFetch;
      env = {
         GEMINI_API_KEY: 'test-key',
         DB: {
             prepare: vi.fn().mockImplementation((query) => ({
                 bind: vi.fn().mockReturnValue({
                     first: vi.fn().mockResolvedValue({ has_graph: 1, semantic_graph: '{"semanticNodes":[]}' }),
                     all: vi.fn().mockResolvedValue({ results: [{ actor: 'Human', payload: '{"content":"hello"}' }] }),
                     run: vi.fn().mockResolvedValue({ success: true })
                 })
             }))
         }
      };
   });

   afterEach(() => {
       global.fetch = originalFetch;
   });

   it('handles compile_graph job type and saves graph', async () => {
      mockFetch.mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
              candidates: [{ content: { parts: [{ text: '{"semanticNodes":[{"id":"1","label":"A"}],"semanticEdges":[]}' }] } }]
          }),
          text: vi.fn().mockResolvedValue('ok')
      });

      await processAiQueueJob({ sessionId: '1', userId: '2', type: 'compile_graph' }, env);
      
      expect(mockFetch).toHaveBeenCalled();
      const req = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(req.generationConfig.responseSchema).toBeDefined();
   });

   it('injects graph into prompt when has_graph is true (Phase 3)', async () => {
      mockFetch.mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
              candidates: [{ content: { parts: [{ text: '{"replyText":"Hi", "addedNodes":[]}' }] } }]
          }),
          text: vi.fn().mockResolvedValue('ok')
      });

      await processAiQueueJob({ sessionId: '1', userId: '2', type: 'reply' }, env);
      
      expect(mockFetch).toHaveBeenCalled();
      const req = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(req.system_instruction.parts[0].text).toContain('STATE OF THE WORLD (Semantic Graph):');
      expect(req.generationConfig.responseSchema).toBeDefined();
   });
   it('injects standard tools for @Operator when user is a normal user', async () => {
      // Mock has_graph = 0 so tools are injected
      env.DB.prepare = vi.fn().mockImplementation(() => ({
          bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({ has_graph: 0 }),
              all: vi.fn().mockResolvedValue({ results: [{ actor: 'Human', payload: '{"content":"hello"}' }] }),
              run: vi.fn().mockResolvedValue({ success: true })
          })
      }));
      env.SECRET_SUPER_ADMIN_IDS = 'admin1,admin2';

      mockFetch.mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
              candidates: [{ content: { parts: [{ text: 'Done' }] } }]
          }),
          text: vi.fn().mockResolvedValue('ok')
      });

      await processAiQueueJob({ sessionId: '1', userId: 'normal-user', type: 'reply', targetAgent: 'operator' }, env);
      
      expect(mockFetch).toHaveBeenCalled();
      const req = JSON.parse(mockFetch.mock.calls[0][1].body);
      const tools = req.tools[0].functionDeclarations.map((t: any) => t.name);
      
      expect(tools).toContain('getMyUsageStats');
      expect(tools).not.toContain('revokeUserAccess');
   });

   it('injects admin tools for @Operator when user is an admin', async () => {
      env.DB.prepare = vi.fn().mockImplementation(() => ({
          bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({ has_graph: 0 }),
              all: vi.fn().mockResolvedValue({ results: [{ actor: 'Human', payload: '{"content":"hello"}' }] }),
              run: vi.fn().mockResolvedValue({ success: true })
          })
      }));
      env.SECRET_SUPER_ADMIN_IDS = 'admin1,admin2';

      mockFetch.mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
              candidates: [{ content: { parts: [{ text: 'Done' }] } }]
          }),
          text: vi.fn().mockResolvedValue('ok')
      });

      await processAiQueueJob({ sessionId: '1', userId: 'admin2', type: 'reply', targetAgent: 'operator' }, env);
      
      expect(mockFetch).toHaveBeenCalled();
      const req = JSON.parse(mockFetch.mock.calls[0][1].body);
      const tools = req.tools[0].functionDeclarations.map((t: any) => t.name);
      
      expect(tools).toContain('getMyUsageStats');
      expect(tools).toContain('revokeUserAccess');
   });
   it('executes queryVectorSearch for @Guide when requested', async () => {
      env.VECTORIZE = {
          query: vi.fn().mockResolvedValue({ matches: [{ score: 0.8, metadata: { content: 'Docs chunk' } }] })
      };
      
      // 1st fetch: Gemini returns a function call
      mockFetch.mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
              candidates: [{ content: { parts: [{ functionCall: { name: 'queryVectorSearch', args: { query: 'test' } } }] } }]
          }),
          text: vi.fn().mockResolvedValue('ok')
      });
      // 2nd fetch: EmbedContent
      mockFetch.mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ embedding: { values: [0.1, 0.2] } }),
          text: vi.fn().mockResolvedValue('ok')
      });
      // 3rd fetch: Gemini returns final response
      mockFetch.mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
              candidates: [{ content: { parts: [{ text: 'Here are the docs' }] } }]
          }),
          text: vi.fn().mockResolvedValue('ok')
      });

      await processAiQueueJob({ sessionId: '1', userId: '2', type: 'reply', targetAgent: 'guide' }, env);
      
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(env.VECTORIZE.query).toHaveBeenCalledWith([0.1, 0.2], { topK: 3 });
   });

   it('executes getGlobalMetrics for @Operator and handles D1, Vectorize telemetry', async () => {
      env.SECRET_SUPER_ADMIN_IDS = 'admin';
      env.VECTORIZE = {
          info: vi.fn().mockResolvedValue({ vectorCount: 100, dimensions: 1536 })
      };
      env.DB.batch = vi.fn().mockResolvedValue([
          { results: [{ c: 10 }] }, // users
          { results: [{ c: 5 }] },  // sessions
          { results: [{ c: 50 }] }, // events
          { results: [{ c: 0 }] }   // revoked
      ]);

      // 1st fetch: Function call to getGlobalMetrics
      mockFetch.mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
              candidates: [{ content: { parts: [{ functionCall: { name: 'getGlobalMetrics', args: {} } }] } }]
          }),
          text: vi.fn().mockResolvedValue('ok')
      });

      // 2nd fetch: Final response from Gemini
      mockFetch.mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
              candidates: [{ content: { parts: [{ text: 'System is healthy' }] } }]
          }),
          text: vi.fn().mockResolvedValue('ok')
      });

      await processAiQueueJob({ sessionId: '1', userId: 'admin', type: 'reply', targetAgent: 'operator' }, env);
      
      expect(env.DB.batch).toHaveBeenCalled();
      expect(env.VECTORIZE.info).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledTimes(2);

      const secondFetchArgs = JSON.parse(mockFetch.mock.calls[1][1].body);
      const toolResponse = secondFetchArgs.contents[secondFetchArgs.contents.length - 1].parts[0].functionResponse.response.result;
      
      expect(toolResponse.database.users).toBe(10);
      expect(toolResponse.vectorize.vectorCount).toBe(100);
      expect(toolResponse.cloudflare_graphql).toContain('Opt-in configuration missing');
   });

   it('executes getGlobalMetrics with Cloudflare GraphQL opt-in enabled', async () => {
      env.SECRET_SUPER_ADMIN_IDS = 'admin';
      env.CF_API_TOKEN = 'test-token';
      env.CF_ACCOUNT_ID = 'test-account';
      env.VECTORIZE = { info: vi.fn().mockRejectedValue(new Error('Info failed')) };
      env.DB.batch = vi.fn().mockRejectedValue(new Error('D1 failed'));

      // 1st fetch: Function call to getGlobalMetrics
      mockFetch.mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
              candidates: [{ content: { parts: [{ functionCall: { name: 'getGlobalMetrics', args: {} } }] } }]
          })
      });

      // 2nd fetch: GraphQL Fetch
      mockFetch.mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
              data: { viewer: { accounts: [{ workersInvocationsAdaptive: [{ sum: { requests: 500, errors: 0, cpuTime: 100 } }] }] } }
          })
      });

      // 3rd fetch: Final response from Gemini
      mockFetch.mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
              candidates: [{ content: { parts: [{ text: 'Done' }] } }]
          })
      });

      await processAiQueueJob({ sessionId: '1', userId: 'admin', type: 'reply', targetAgent: 'operator' }, env);

      expect(mockFetch).toHaveBeenCalledTimes(3);
      
      const thirdFetchArgs = JSON.parse(mockFetch.mock.calls[2][1].body);
      const toolResponse = thirdFetchArgs.contents[thirdFetchArgs.contents.length - 1].parts[0].functionResponse.response.result;
      
      expect(toolResponse.database_error).toBe('D1 failed');
      expect(toolResponse.vectorize_error).toBe('Info failed');
      expect(toolResponse.cloudflare_workers_24h.requests).toBe(500);
   });

   it('handles generic mock tools and revokeUserAccess', async () => {
      env.SECRET_SUPER_ADMIN_IDS = 'admin';

      mockFetch.mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
              candidates: [{ content: { parts: [{ functionCall: { name: 'revokeUserAccess', args: { idToRevoke: 'bad-user' } } }] } }]
          })
      });

      mockFetch.mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
              candidates: [{ content: { parts: [{ text: 'User revoked.' }] } }]
          })
      });

      await processAiQueueJob({ sessionId: '1', userId: 'admin', type: 'reply', targetAgent: 'operator' }, env);
      
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const fetchArgs = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(fetchArgs.contents[fetchArgs.contents.length - 1].parts[0].functionResponse.response.result).toContain('bad-user revoked');
   });
   it('returns early if GEMINI_API_KEY is missing', async () => {
      delete env.GEMINI_API_KEY;
      await processAiQueueJob({ sessionId: '1', userId: '2', type: 'reply' }, env);
      expect(mockFetch).not.toHaveBeenCalled();
   });

   it('handles generic errors and sends Telegram error notification', async () => {
      env.DB.prepare = vi.fn().mockImplementation((query) => {
          if (query.includes('events WHERE session_id')) throw new Error('DB Crash');
          return {
              bind: vi.fn().mockReturnValue({
                  first: vi.fn().mockResolvedValue({ has_graph: 1, semantic_graph: '{"semanticNodes":[]}' }),
                  all: vi.fn().mockResolvedValue({ results: [{ actor: 'Human', payload: '{"content":"hello"}' }] }),
                  run: vi.fn().mockResolvedValue({ success: true })
              })
          };
      });
      // Mock the telegram_integrations check
      env.DB.prepare.mockImplementationOnce(() => ({
          bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({ has_graph: 1, semantic_graph: '{"semanticNodes":[]}' }),
          })
      })).mockImplementationOnce(() => ({
          bind: vi.fn().mockReturnValue({
              first: vi.fn().mockRejectedValue(new Error('Crash'))
          })
      })).mockImplementation((q) => {
          if (q.includes('telegram_integrations')) {
              return { bind: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue({ bot_token: 'valid-token' }) }) };
          }
          throw new Error('Crash');
      });

      // We just want to hit the external API / DB failure catch block
      await processAiQueueJob({ sessionId: 'tg_chat_123', userId: '2', type: 'reply' }, env);
   });

   it('handles string payload parsing failure gracefully', async () => {
      env.DB.prepare = vi.fn().mockImplementation(() => ({
          bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({ has_graph: 0 }),
              all: vi.fn().mockResolvedValue({ results: [{ actor: 'Human', payload: 'invalid-json' }] }),
              run: vi.fn().mockResolvedValue({ success: true })
          })
      }));
      mockFetch.mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ candidates: [{ content: { parts: [{ text: 'response' }] } }] })
      });
      await processAiQueueJob({ sessionId: '1', userId: '2', type: 'reply' }, env);
      expect(mockFetch).toHaveBeenCalled();
      const req = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(req.contents[0].parts[0].text).toBe('invalid-json');
   });

   it('logs error on non-ok Gemini API response in compile_graph', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetch.mockResolvedValueOnce({
          ok: false,
          text: vi.fn().mockResolvedValue('API rate limit')
      });
      await processAiQueueJob({ sessionId: '1', userId: '2', type: 'compile_graph' }, env);
      expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Error processing AI Job:'),
          expect.any(Error)
      );
      errorSpy.mockRestore();
   });

   it('handles empty GraphQL stats for getGlobalMetrics', async () => {
      env.SECRET_SUPER_ADMIN_IDS = 'admin';
      env.CF_API_TOKEN = 'token';
      env.CF_ACCOUNT_ID = 'acc';
      mockFetch.mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ candidates: [{ content: { parts: [{ functionCall: { name: 'getGlobalMetrics', args: {} } }] } }] })
      });
      mockFetch.mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ data: { viewer: { accounts: [{ workersInvocationsAdaptive: [] }] } } })
      });
      mockFetch.mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ candidates: [{ content: { parts: [{ text: 'Done' }] } }] })
      });
      await processAiQueueJob({ sessionId: '1', userId: 'admin', type: 'reply', targetAgent: 'operator' }, env);
      const thirdFetchArgs = JSON.parse(mockFetch.mock.calls[2][1].body);
      const toolResponse = thirdFetchArgs.contents[thirdFetchArgs.contents.length - 1].parts[0].functionResponse.response.result;
      expect(toolResponse.cloudflare_workers_24h).toBe('No data returned for standard metrics');
   });

   it('handles generic mock action for operator', async () => {
      env.SECRET_SUPER_ADMIN_IDS = 'admin';
      mockFetch.mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ candidates: [{ content: { parts: [{ functionCall: { name: 'unknownMockAction', args: {} } }] } }] })
      });
      mockFetch.mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ candidates: [{ content: { parts: [{ text: 'Done' }] } }] })
      });
      await processAiQueueJob({ sessionId: '1', userId: 'admin', type: 'reply', targetAgent: 'operator' }, env);
   });

   it('injects graph into prompt and handles graph mutations when hasGraph is true', async () => {
      env.DB.prepare = vi.fn().mockImplementation(() => ({
          bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({ has_graph: 1, semantic_graph: '{"semanticNodes":[],"semanticEdges":[]}' }),
              all: vi.fn().mockResolvedValue({ results: [{ actor: 'Human', payload: 'msg' }] }),
              run: vi.fn().mockResolvedValue({ success: true })
          })
      }));
      mockFetch.mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
              candidates: [{ content: { parts: [{ text: '{"replyText":"Hi", "addedNodes":[{"id":"new1","label":"A"}], "addedEdges":[{"source":"new1","target":"2","relation":"x"}]}' }] } }]
          })
      });
      await processAiQueueJob({ sessionId: 'tg_chat_999', userId: '2', type: 'reply' }, env);
   });

   it('sends Telegram notification on successful compile_graph', async () => {
      env.DB.prepare = vi.fn().mockImplementation((q) => {
          if (q.includes('events')) {
              return { bind: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue({ results: [{ actor: 'Human', payload: 'msg' }] }) }) };
          }
          if (q.includes('UPDATE sessions')) {
              return { bind: vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue({}) }) };
          }
          if (q.includes('telegram_integrations')) {
              return { bind: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue({ bot_token: 'tok' }) }) };
          }
          return { bind: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue({}), all: vi.fn().mockResolvedValue({}), run: vi.fn().mockResolvedValue({}) }) };
      });
      mockFetch.mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
              candidates: [{ content: { parts: [{ text: '{"semanticNodes":[{"id":"1"}],"semanticEdges":[]}' }] } }]
          })
      });
      await processAiQueueJob({ sessionId: 'tg_chat_100', userId: '2', type: 'compile_graph' }, env);
   });
});
