import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchHistory, cloudSearch, localFuseSearch } from '../services/SearchService';
import type { IStorageProvider } from '../interfaces/IStorageProvider';

describe('SearchService', () => {
  const mockSessions = [
    {
      id: 'session-1',
      preview: 'First Chat',
      timestamp: 1000,
      data: {
        messages: [{
          role: 'model',
          content: 'hello world',
          internalState: {
            semanticNodes: [{ id: 'n1', label: 'Node 1' }, { id: 'auth', label: 'Auth System' }]
          }
        }]
      }
    },
    {
      id: 'session-2',
      preview: 'Second Discussion',
      timestamp: 2000,
      data: {
        messages: [{
          role: 'model',
          content: 'advanced ai topic',
          internalState: {
            semanticNodes: [{ id: 'discussion', label: 'Discussion Concept' }]
          }
        }]
      }
    },
    {
      id: 'session-archived',
      preview: 'Archived',
      isArchived: true,
      timestamp: 3000,
      data: {
        messages: [{
          role: 'model',
          content: 'archived topic discussion',
          internalState: {
            semanticNodes: [{ id: 'discussion', label: 'Discussion Concept' }]
          }
        }]
      }
    },
    {
      id: 'session-no-messages',
      preview: 'Empty',
      timestamp: 4000,
      data: {}
    },
    {
      id: 'session-no-nodes',
      preview: 'No Nodes',
      timestamp: 5000,
      data: {
        messages: [{
          role: 'model',
          content: 'no nodes here discussion',
          internalState: {}
        }]
      }
    }
  ];

  const mockStorage: IStorageProvider = {
    type: 'local',
    isReady: () => true,
    createSession: vi.fn(),
    appendEvent: vi.fn(),
    loadSession: vi.fn(),
    deleteSession: vi.fn(),
    renameSession: vi.fn(),
    loadAllSessions: vi.fn().mockResolvedValue(mockSessions),
    clearAll: vi.fn(),
    saveGemsConfig: vi.fn(),
    loadGemsConfig: vi.fn()
  };

  // --- localFuseSearch (legacy fuse.js path) ---

  describe('localFuseSearch', () => {
    it('filters sessions by nodes (fuzzy match on label/id)', async () => {
      const results = await localFuseSearch('discussion', mockStorage);
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe('session-2');
    });

    it('filters sessions by nodes', async () => {
      const results = await localFuseSearch('auth', mockStorage);
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe('session-1');
    });

    it('returns empty array if no match', async () => {
      const results = await localFuseSearch('xyz123', mockStorage);
      expect(results).toHaveLength(0);
    });
  });

  // --- searchHistory (top-level dispatcher) ---

  describe('searchHistory', () => {
    it('returns empty array if query is empty', async () => {
      const results = await searchHistory('', mockStorage);
      expect(results).toHaveLength(0);
    });

    it('returns empty array if query is whitespace', async () => {
      const results = await searchHistory('   ', mockStorage);
      expect(results).toHaveLength(0);
    });

    it('uses local Fuse.js when no cloudUrl/apiKey provided', async () => {
      const results = await searchHistory('discussion', mockStorage);
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe('session-2');
    });

    it('uses local Fuse.js when only cloudUrl is provided (no apiKey)', async () => {
      const results = await searchHistory('discussion', mockStorage, 'http://worker.test');
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe('session-2');
    });
  });

  // --- cloudSearch ---

  describe('cloudSearch', () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('calls /api/search with query and auth header', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          results: [
            { sessionId: 'cloud-1', preview: 'Cloud Result', score: 0.95, timestamp: 5000 },
          ],
        }),
      });
      globalThis.fetch = mockFetch;

      const results = await cloudSearch('test query', 'http://worker.test', 'my-api-key');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://worker.test/api/search?q=test%20query');
      expect(opts.headers.Authorization).toBe('Bearer my-api-key');

      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe('cloud-1');
      expect(results[0].sessionPreview).toBe('Cloud Result');
      expect(results[0].score).toBe(0.95);
      expect(results[0].timestamp).toBe(5000);
      expect(results[0].turnIndex).toBe(0);
      expect(results[0].matchedConcepts).toEqual([]);
    });

    it('strips trailing slash from cloudUrl', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });
      globalThis.fetch = mockFetch;

      await cloudSearch('test', 'http://worker.test/', 'key');
      const url = mockFetch.mock.calls[0][0];
      expect(url).toBe('http://worker.test/api/search?q=test');
    });

    it('returns empty array when response is not ok', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const results = await cloudSearch('query', 'http://worker.test', 'key');
      expect(results).toEqual([]);
    });

    it('returns empty array when response has no results', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: null }),
      });

      const results = await cloudSearch('query', 'http://worker.test', 'key');
      expect(results).toEqual([]);
    });

    it('handles missing fields in result items gracefully', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          results: [{ sessionId: 'x' }], // missing preview, timestamp, score
        }),
      });

      const results = await cloudSearch('query', 'http://worker.test', 'key');
      expect(results).toHaveLength(1);
      expect(results[0].sessionPreview).toBe('');
      expect(results[0].timestamp).toBe(0);
      expect(results[0].score).toBeUndefined();
    });
  });

  // --- searchHistory with cloud path ---

  describe('searchHistory (cloud + fallback)', () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('uses cloud search when cloudUrl and apiKey are provided', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          results: [
            { sessionId: 'cloud-1', preview: 'Cloud Hit', score: 0.9, timestamp: 9000 },
          ],
        }),
      });

      const results = await searchHistory('test', mockStorage, 'http://worker.test', 'my-key');
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe('cloud-1');
    });

    it('falls back to local fuse.js when cloud search returns empty', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });

      const results = await searchHistory('auth', mockStorage, 'http://worker.test', 'my-key');
      // Should fall through to local fuse.js and find session-1
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe('session-1');
    });

    it('falls back to local fuse.js when cloud search throws', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const results = await searchHistory('auth', mockStorage, 'http://worker.test', 'my-key');
      // Should catch the error and fall through to local search
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe('session-1');
    });
  });
});
