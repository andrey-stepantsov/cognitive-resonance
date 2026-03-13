import { describe, it, expect, vi } from 'vitest';
import { searchHistory } from '../services/SearchService';
import type { IStorageProvider } from '../interfaces/IStorageProvider';

describe('searchHistory', () => {
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
    saveSession: vi.fn(),
    loadSession: vi.fn(),
    deleteSession: vi.fn(),
    renameSession: vi.fn(),
    loadAllSessions: vi.fn().mockResolvedValue(mockSessions),
    clearAll: vi.fn(),
    saveGemsConfig: vi.fn(),
    loadGemsConfig: vi.fn()
  };

  it('filters sessions by nodes (fuzzy match on label/id)', async () => {
    const results = await searchHistory('discussion', mockStorage);
    expect(results).toHaveLength(1);
    expect(results[0].sessionId).toBe('session-2'); // Should not return session-archived or session-no-nodes
  });

  it('filters sessions by nodes', async () => {
    const results = await searchHistory('auth', mockStorage);
    expect(results).toHaveLength(1);
    expect(results[0].sessionId).toBe('session-1');
  });

  it('returns empty array if query is empty', async () => {
    const results = await searchHistory('', mockStorage);
    expect(results).toHaveLength(0);
  });

  it('returns empty array if no match', async () => {
    const results = await searchHistory('xyz123', mockStorage);
    expect(results).toHaveLength(0);
  });
});

