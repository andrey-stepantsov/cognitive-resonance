import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initGemini, validateProposal } from '../GeminiService';

const mockGenerateContent = vi.fn();

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      models = {
        generateContent: mockGenerateContent
      };
      constructor() {}
    }
  };
});

describe('GeminiService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        initGemini('fake-api-key');
    });

    describe('validateProposal', () => {
        it('should return safely when the proposal is deemed safe by the model', async () => {
            mockGenerateContent.mockResolvedValueOnce({
                text: JSON.stringify({ isSafe: true, reason: 'LGTM' })
            });

            const result = await validateProposal('patch content');
            expect(mockGenerateContent).toHaveBeenCalled();
            expect(result.isSafe).toBe(true);
            expect(result.reason).toBe('LGTM');
        });

        it('should throw an error when the model API fails', async () => {
            mockGenerateContent.mockRejectedValueOnce(new Error('API quota exceeded'));
            await expect(validateProposal('bad patch')).rejects.toThrow('API quota exceeded');
        });

        it('should default to safe if the model returns an empty response', async () => {
            mockGenerateContent.mockResolvedValueOnce({ text: null });
            const result = await validateProposal('patch content');
            expect(result.isSafe).toBe(true);
            expect(result.reason).toContain('Empty response');
        });

        it('should parse non-string JSON responses properly (SDK wrapper)', async () => {
            mockGenerateContent.mockResolvedValueOnce({ text: { isSafe: false, reason: 'Direct obj' } });
            const result = await validateProposal('patch content 2');
            expect(result.isSafe).toBe(false);
            expect(result.reason).toBe('Direct obj');
        });
    });
});
