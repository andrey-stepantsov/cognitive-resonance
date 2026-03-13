import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalIndexedDBProvider } from '../LocalIndexedDBProvider';

// Mock localStorage since we are running in Node
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    })
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock
});

describe('LocalIndexedDBProvider', () => {
  let provider: LocalIndexedDBProvider;

  beforeEach(async () => {
    provider = new LocalIndexedDBProvider();
    await provider.init();
    await provider.clearAll();
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('initializes and is ready', () => {
    expect(provider.isReady()).toBe(true);
    expect(provider.type).toBe('local');
  });

  it('saves and loads a session', async () => {
    const sessionData = { 
        customName: 'E2E Test Session',
        messages: [{ role: 'user', content: 'Testing E2E logic locally' }],
        config: { model: 'gemini-1.5-flash', systemPrompt: 'Sys' }
    };
    
    // Save
    const sessionId = await provider.saveSession('test-1', sessionData);
    expect(sessionId).toBe('test-1');

    // Load
    const loaded = await provider.loadSession('test-1');
    expect(loaded).toBeDefined();
    expect(loaded?.id).toBe('test-1');
    expect(loaded?.customName).toBe('E2E Test Session');
    expect(loaded?.data).toEqual(sessionData);
    expect(loaded?.preview).toContain('Testing E2E logic');
  });

  it('auto-generates an ID if not provided', async () => {
    const sessionData = { messages: [], config: {} };
    const sessionId = await provider.saveSession('', sessionData);
    
    expect(sessionId).toMatch(/^session-\d+$/);
    
    const loaded = await provider.loadSession(sessionId);
    expect(loaded?.id).toBe(sessionId);
  });

  it('loads all sessions sorted by timestamp descending', async () => {
    await provider.saveSession('s1', { customName: 'First' });
    
    // Artificial delay to ensure different timestamps if test runs too fast
    await new Promise(r => setTimeout(r, 10));
    
    await provider.saveSession('s2', { customName: 'Second' });

    const all = await provider.loadAllSessions();
    expect(all).toHaveLength(2);
    expect(all[0].id).toBe('s2'); // latest first
    expect(all[1].id).toBe('s1');
  });

  it('renames a session', async () => {
    await provider.saveSession('rename-test', { customName: 'Old', messages: [], config: {} });
    
    await provider.renameSession('rename-test', 'New');
    
    const loaded = await provider.loadSession('rename-test');
    expect(loaded?.customName).toBe('New');
    expect(loaded?.data.customName).toBe('New');
  });

  it('deletes a session', async () => {
    await provider.saveSession('del-test', { messages: [], config: {} });
    await provider.deleteSession('del-test');
    
    const loaded = await provider.loadSession('del-test');
    expect(loaded).toBeUndefined();
  });

  it('saves and loads gems configuration via localStorage', async () => {
    const config = {
      defaultGemId: 'custom-1',
      savedGems: [
        { id: 'custom-1', name: 'Bot', model: 'gemini-test', systemPrompt: 'A bit' }
      ]
    };

    await provider.saveGemsConfig(config);
    expect(localStorageMock.setItem).toHaveBeenCalledWith('cognitive-resonance-gems-config', JSON.stringify(config));

    const loadedConfig = await provider.loadGemsConfig();
    expect(loadedConfig).toEqual(config);
  });

  it('handles empty gems configuration gracefully', async () => {
    const config = await provider.loadGemsConfig();
    expect(config).toBeNull();
  });

  it('archives and unarchives a session', async () => {
    await provider.saveSession('archive-test', { customName: 'To Archive', messages: [], config: {} });
    
    // Archive it
    await provider.archiveSession('archive-test', true);
    let loaded = await provider.loadSession('archive-test');
    expect(loaded?.isArchived).toBe(true);
    expect(loaded?.data.isArchived).toBe(true);

    // Unarchive it
    await provider.archiveSession('archive-test', false);
    loaded = await provider.loadSession('archive-test');
    expect(loaded?.isArchived).toBe(false);
    expect(loaded?.data.isArchived).toBe(false);
  });

  it('ignores archiving a non-existent session', async () => {
    await expect(provider.archiveSession('non-existent', true)).resolves.toBeUndefined();
  });
});
