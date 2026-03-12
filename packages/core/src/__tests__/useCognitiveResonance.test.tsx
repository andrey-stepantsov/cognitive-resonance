import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCognitiveResonance } from '../hooks/useCognitiveResonance';
import * as GeminiService from '../services/GeminiService';
import * as CrBackend from '@cr/backend';
import * as SearchService from '../services/SearchService';

vi.mock('../services/SearchService', () => ({
  searchHistory: vi.fn()
}));

vi.mock('../services/GeminiService', () => ({
  initGemini: vi.fn(),
  fetchModels: vi.fn(),
  generateResponse: vi.fn()
}));

vi.mock('@cr/backend', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as any,
    shareJSON: vi.fn(),
    downloadJSON: vi.fn(),
    loadApiKey: vi.fn().mockReturnValue('fake-key'),
    saveApiKey: vi.fn()
  };
});

const mockStorage = {
  loadAllSessions: vi.fn().mockResolvedValue([]),
  loadSession: vi.fn().mockResolvedValue({
    data: {
      messages: [{ role: 'user', content: 'Loaded msg' }],
      config: { model: 'gemini-test', systemPrompt: 'Loaded prompt', gemId: 'gem-test' }
    }
  }),
  loadGemsConfig: vi.fn().mockResolvedValue(null),
  saveSession: vi.fn().mockResolvedValue('fake-session-id'),
  deleteSession: vi.fn().mockResolvedValue(true),
  renameSession: vi.fn().mockResolvedValue(true),
  saveGemsConfig: vi.fn()
};

const mockAuth = { getStatus: () => 'anonymous', getUser: () => undefined };

// Mock context directly
vi.mock('../providers/CognitivePlatformContext', () => ({
  useCognitivePlatform: () => ({
    auth: mockAuth,
    storage: mockStorage,
    authStatus: 'anonymous',
    isReady: true
  })
}));

describe('useCognitiveResonance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(GeminiService.fetchModels).mockResolvedValue([{ name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' }]);
    vi.mocked(GeminiService.generateResponse).mockResolvedValue({
      reply: 'Mocked response',
      dissonanceScore: 10,
      dissonanceReason: 'Reason',
      semanticNodes: [],
      semanticEdges: []
    } as any);
  });

  it('initializes with default state', () => {
    const { result } = renderHook(() => useCognitiveResonance());
    
    expect(result.current.messages).toEqual([]);
    expect(result.current.input).toBe('');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.activeSessionId).toBeNull();
  });

  it('startNewSession resets state and sets active session to null', () => {
    const { result } = renderHook(() => useCognitiveResonance());

    act(() => {
      // simulate having some state
      result.current.setInput('hello');
    });
    
    expect(result.current.input).toBe('hello');

    act(() => {
      result.current.startNewSession();
    });

    expect(result.current.activeSessionId).toBeNull();
    expect(result.current.messages).toEqual([]);
    expect(result.current.isHistorySidebarOpen).toBe(false);
  });

  it('toggles the sidebar and loads sessions', async () => {
    const { result } = renderHook(() => useCognitiveResonance());
    
    expect(result.current.isHistorySidebarOpen).toBe(false);
    act(() => {
      result.current.setIsHistorySidebarOpen(true);
    });
    expect(result.current.isHistorySidebarOpen).toBe(true);
  });

  it('manages active gem and model changing appropriately', () => {
    const { result } = renderHook(() => useCognitiveResonance());
    
    act(() => {
      result.current.handleSelectGem('gem-coder');
    });
    
    expect(result.current.activeGemId).toBe('gem-coder');
    expect(result.current.selectedModel).toBe('gemini-2.5-pro');
    expect(result.current.sessionSystemPrompt).toContain('You are a coding assistant');
    expect(result.current.isGemSidebarOpen).toBe(false);
  });

  it('manages creating custom gems', async () => {
    const { result } = renderHook(() => useCognitiveResonance());

    act(() => {
      result.current.handleSaveGem({
        id: 'new-gem', name: 'Custom Bot', model: 'gpt-error', systemPrompt: 'Sys'
      });
    });

    expect(result.current.savedGems.length).toBeGreaterThan(3);
    expect(result.current.savedGems.find(g => g.id === 'new-gem')).toBeDefined();
    expect(result.current.creatingGem).toBe(false);
  });

  it('manages deleting custom gems', async () => {
    const { result } = renderHook(() => useCognitiveResonance());

    act(() => {
      result.current.handleSaveGem({
        id: 'to-delete', name: 'Del Bot', model: 'gpt-error', systemPrompt: 'Sys'
      });
    });

    // Make it active so we can test the fallback
    act(() => {
      result.current.handleSelectGem('to-delete');
    });

    expect(result.current.savedGems.find(g => g.id === 'to-delete')).toBeDefined();

    act(() => {
      const mockEvent = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;
      result.current.handleDeleteGem('to-delete', mockEvent);
    });

    expect(result.current.savedGems.find(g => g.id === 'to-delete')).toBeUndefined();
    // It should fallback to the default gem
    expect(result.current.activeGemId).toBe(result.current.defaultGemId);
  });

  it('submits a message successfully', async () => {
    console.log('Test start');
    vi.mocked(GeminiService.generateResponse).mockReturnValue(Promise.resolve({
      reply: 'Mocked response',
      dissonanceScore: 10,
      dissonanceReason: 'Reason',
      semanticNodes: [],
      semanticEdges: []
    }) as any);
    
    // We already mocked `fetchModels` so models filter logic passes
    vi.mocked(GeminiService.fetchModels).mockReturnValue(Promise.resolve([{ name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' }]));

    console.log('Rendering hook');
    const { result } = renderHook(() => useCognitiveResonance());
    
    console.log('Waiting for models to populate');
    await waitFor(() => {
      expect(result.current.availableModels.length).toBeGreaterThan(0);
    });

    console.log('Setting input');
    act(() => {
      result.current.setInput('Hello World');
    });

    await act(async () => {
      await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(result.current.messages.length).toBe(2);
    expect(result.current.messages[0].content).toBe('Hello World');
    expect(result.current.messages[1].content).toBe('Mocked response');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.input).toBe('');
  });

  it('handles API exceptions during message submission', async () => {
    vi.mocked(GeminiService.generateResponse).mockRejectedValue(new Error('Network error'));
    vi.mocked(GeminiService.fetchModels).mockResolvedValue([{ name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' }]);

    const { result } = renderHook(() => useCognitiveResonance());

    await waitFor(() => {
      expect(result.current.availableModels.length).toBeGreaterThan(0);
    });

    act(() => {
      result.current.setInput('Crashing message');
    });

    await act(async () => {
      await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(result.current.messages.length).toBe(2);
    expect(result.current.messages[1].isError).toBe(true);
    expect(result.current.messages[1].content).toBe('Network error');
  });

  it('exports session history using backend share interface', async () => {
    vi.mocked(CrBackend.shareJSON).mockResolvedValue(true);
    const { result } = renderHook(() => useCognitiveResonance());

    act(() => {
      result.current.setInput('History test');
    });

    // Mock an active message
    vi.mocked(GeminiService.generateResponse).mockResolvedValue({
      reply: 'Response', dissonanceScore: 0, dissonanceReason: '', semanticNodes: [], semanticEdges: []
    } as any);
    vi.mocked(GeminiService.fetchModels).mockResolvedValue([{ name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' }]);

    await waitFor(() => {
      expect(result.current.availableModels.length).toBeGreaterThan(0);
    });

    await act(async () => {
      await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    await act(async () => {
      await result.current.handleDownloadHistory();
    });

    expect(CrBackend.shareJSON).toHaveBeenCalled();
  });

  it('falls back to downloadJSON if shareJSON returns false (web fallback)', async () => {
    vi.mocked(CrBackend.shareJSON).mockResolvedValue(false);
    const { result } = renderHook(() => useCognitiveResonance());

    act(() => {
      // Simulate existing messages to bypass empty check
      result.current.setInput('History test');
    });

    vi.mocked(GeminiService.generateResponse).mockResolvedValue({
      reply: 'Response', dissonanceScore: 0, dissonanceReason: '', semanticNodes: [], semanticEdges: []
    } as any);

    await waitFor(() => {
      expect(result.current.availableModels.length).toBeGreaterThan(0);
    });

    await act(async () => {
      await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    await act(async () => {
      await result.current.handleDownloadHistory();
    });

    expect(CrBackend.shareJSON).toHaveBeenCalled();
    expect(CrBackend.downloadJSON).toHaveBeenCalled();
  });

  it('sets a default gem', () => {
    const { result } = renderHook(() => useCognitiveResonance());
    
    act(() => {
      result.current.handleSetDefaultGem('gem-coder', { stopPropagation: vi.fn() } as unknown as React.MouseEvent);
    });
    
    expect(result.current.defaultGemId).toBe('gem-coder');
    expect(mockStorage.saveGemsConfig).toHaveBeenCalled();
  });

  it('rejects sending if an invalid model is selected', async () => {
    const { result } = renderHook(() => useCognitiveResonance());

    await waitFor(() => {
      expect(result.current.availableModels.length).toBeGreaterThan(0);
    });

    act(() => {
      result.current.setSelectedModel('gpt-invalid');
      result.current.setInput('Test message');
    });

    await act(async () => {
      await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(result.current.messages[result.current.messages.length - 1].isError).toBe(true);
    expect(result.current.messages[result.current.messages.length - 1].content).toContain('Invalid model selected');
  });

  it('imports a session JSON file', async () => {
    const { result } = renderHook(() => useCognitiveResonance());

    const fakeSession = {
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'model', content: 'hi', internalState: { dissonanceScore: 10 } }
      ],
      config: { model: 'gemini-test', systemPrompt: 'Test', gemId: 'gem-coder' }
    };

    const mockFile = new File([JSON.stringify(fakeSession)], 'session.json', { type: 'application/json' });
    const mockEvent = {
        target: { files: [mockFile], value: 'fakepath/session.json' }
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    act(() => {
      result.current.handleImportSession(mockEvent);
    });

    await waitFor(() => {
      expect(result.current.messages.length).toBe(2);
    });

    expect(result.current.activeGemId).toBe('gem-coder');
    expect(result.current.selectedModel).toBe('gemini-test');
    expect(result.current.messages[1].modelTurnIndex).toBeDefined();
  });

  it('handles invalid session JSON import', async () => {
    const originalAlert = window.alert;
    window.alert = vi.fn();
    const { result } = renderHook(() => useCognitiveResonance());

    const mockFile = new File(['invalid json {'], 'session.json', { type: 'application/json' });
    const mockEvent = {
        target: { files: [mockFile], value: 'fakepath/session.json' }
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    act(() => {
      result.current.handleImportSession(mockEvent);
    });

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('Failed to parse session file.');
    });
    
    window.alert = originalAlert;
  });

  it('handles session renaming, loading, and deletion', async () => {
    const { result } = renderHook(() => useCognitiveResonance());

    act(() => {
      // Mock some sessions
      mockStorage.loadAllSessions.mockResolvedValueOnce([
        { id: 'session-1', customName: 'Old', preview: 'Old', turnCount: 1, timestamp: Date.now() }
      ]);
      result.current.setIsHistorySidebarOpen(true);
    });

    await waitFor(() => {
      expect(result.current.sessions.length).toBe(1);
    });

    // Start renaming
    act(() => {
      result.current.startRenameSession('session-1', 'Old Name', { stopPropagation: vi.fn() } as unknown as React.MouseEvent);
      result.current.setEditSessionName('New Name');
    });

    await act(async () => {
      await result.current.handleRenameSessionSubmit('session-1', { type: 'submit', preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.FormEvent);
    });

    expect(mockStorage.renameSession).toHaveBeenCalledWith('session-1', 'New Name');
    
    // Test Load
    mockStorage.saveSession.mockResolvedValueOnce('session-1');
    await act(async () => {
      await result.current.handleLoadSession('session-1');
    });
    expect(mockStorage.loadSession).toHaveBeenCalledWith('session-1');
    expect(result.current.activeSessionId).toBe('session-1');
    expect(result.current.messages.length).toBe(1);

    // Test search result load
    await act(async () => {
      await result.current.handleSearchResultClick({ sessionId: 'session-2', turnIndex: 0 });
    });
    expect(mockStorage.loadSession).toHaveBeenCalledWith('session-2');
    expect(result.current.targetTurnIndex).toBe(0);

    // Test Delete
    await act(async () => {
      await result.current.handleDeleteSession('session-2', { stopPropagation: vi.fn() } as unknown as React.MouseEvent);
    });
    expect(mockStorage.deleteSession).toHaveBeenCalledWith('session-2');
  });

  it('handles API key setting', () => {
    const { result } = renderHook(() => useCognitiveResonance());
    
    act(() => {
      result.current.setApiKeyInput('new-key');
    });

    act(() => {
      result.current.handleSetApiKey();
    });

    expect(CrBackend.saveApiKey).toHaveBeenCalledWith('new-key');
    expect(result.current.apiKey).toBe('new-key');
    expect(result.current.showApiKeyModal).toBe(false);
  });

  it('debounces history search', async () => {
    vi.useFakeTimers();
    vi.mocked(SearchService.searchHistory).mockResolvedValue([{ sessionId: 's1', turnIndex: 0 }] as any);
    const { result } = renderHook(() => useCognitiveResonance());

    act(() => {
      result.current.setHistorySearchQuery('search term');
    });

    // Fast-forward debounce timeout
    await act(async () => {
      vi.advanceTimersByTime(400);
      // Wait for promise resolution
      await Promise.resolve();
    });

    expect(SearchService.searchHistory).toHaveBeenCalledWith('search term', mockStorage);
    expect(result.current.searchResults.length).toBe(1);
    vi.useRealTimers();
  });

  it('handles file selection', async () => {
    const { result } = renderHook(() => useCognitiveResonance());

    const mockFile = new File(['hello'], 'hello.png', { type: 'image/png' });
    const mockEvent = {
        target: { files: [mockFile], value: 'fakepath/hello.png' }
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    act(() => {
      result.current.handleFileSelect(mockEvent);
    });

    // FileReader is async so we wait
    await waitFor(() => {
      expect(result.current.attachedFiles.length).toBe(1);
    });

    expect(result.current.attachedFiles[0].name).toBe('hello.png');
    expect(result.current.attachedFiles[0].mimeType).toBe('image/png');
  });
});
