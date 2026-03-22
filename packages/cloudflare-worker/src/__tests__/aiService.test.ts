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
});
