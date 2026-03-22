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
});
