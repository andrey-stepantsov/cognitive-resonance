import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCognitiveResonance } from '../hooks/useCognitiveResonance';
import * as GeminiService from '../services/GeminiService';
import * as CrBackend from '@cr/backend';
import * as SearchService from '../services/SearchService';

vi.mock('../services/SearchService', () => ({
  searchHistory: vi.fn(),
  searchGoogle: vi.fn()
}));

const mockGitContextManager = {
  initRepo: vi.fn().mockResolvedValue(true),
  initGlobalRepo: vi.fn().mockResolvedValue(true),
  getStatusMatrix: vi.fn().mockResolvedValue([]),
  getGlobalStatusMatrix: vi.fn().mockResolvedValue([]),
  fs: { promises: { readFile: vi.fn() } },
  dir: '/session',
  globalDir: '/global'
};

vi.mock('../services/GitContextManager', () => ({
  GitContextManager: vi.fn().mockImplementation(function() { return mockGitContextManager; }),
  vfs: { promises: { readFile: vi.fn().mockResolvedValue('') } }
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

  it('manages isSearchEnabled and showSystemMessages state', () => {
    const { result } = renderHook(() => useCognitiveResonance());

    expect(result.current.isSearchEnabled).toBe(false);
    expect(result.current.showSystemMessages).toBe(true);

    act(() => {
      result.current.setIsSearchEnabled(true);
      result.current.setShowSystemMessages(false);
    });

    expect(result.current.isSearchEnabled).toBe(true);
    expect(result.current.showSystemMessages).toBe(false);
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

  it('ignores submission if loading', async () => {
    const { result } = renderHook(() => useCognitiveResonance());
    act(() => {
      result.current.setInput('test');
    });
    
    // Forcibly set loading to true (need to trigger a fetch or mock it)
    vi.mocked(GeminiService.generateResponse).mockImplementation(() => new Promise(() => {})); // hang forever
    vi.mocked(GeminiService.fetchModels).mockResolvedValue([{ name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' }]);

    await waitFor(() => {
      expect(result.current.availableModels.length).toBeGreaterThan(0);
    });

    // Start first submit
    act(() => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(result.current.isLoading).toBe(true);

    // Try second submit
    const mockEvent = { preventDefault: vi.fn() };
    await act(async () => {
      await result.current.handleSubmit(mockEvent as unknown as React.FormEvent);
    });

    // Messages should only have 1 user message, not 2
    expect(result.current.messages.length).toBe(1);
    expect(mockEvent.preventDefault).toHaveBeenCalled();
  });

  it('handles AbortError during message submission', async () => {
    vi.mocked(GeminiService.generateResponse).mockRejectedValue(Object.assign(new Error('AbortError'), { name: 'AbortError' }));
    vi.mocked(GeminiService.fetchModels).mockResolvedValue([{ name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' }]);

    const { result } = renderHook(() => useCognitiveResonance());

    await waitFor(() => {
      expect(result.current.availableModels.length).toBeGreaterThan(0);
    });

    act(() => {
      result.current.setInput('Interrupt me');
    });

    await act(async () => {
      await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(result.current.messages[1].content).toBe('[Generation Interrupted]');
  });

  it('injects git context and mentions into payload', async () => {
    vi.mocked(GeminiService.generateResponse).mockResolvedValue({
      reply: 'Mocked response with git context', dissonanceScore: 0, dissonanceReason: '', semanticNodes: [], semanticEdges: []
    } as any);
    vi.mocked(GeminiService.fetchModels).mockResolvedValue([{ name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' }]);
    
    // Setup git matrix mocks
    mockGitContextManager.getStatusMatrix.mockResolvedValue([['local.txt', 1, 1, 0]]);
    mockGitContextManager.getGlobalStatusMatrix.mockResolvedValue([['global.txt', 0, 1, 0]]);
    mockGitContextManager.fs.promises.readFile.mockImplementation((path: string) => {
      if (path.includes('local.txt')) return Promise.resolve('Local Content');
      if (path.includes('global.txt')) return Promise.resolve('Global Content');
      return Promise.resolve('');
    });

    const { result } = renderHook(() => useCognitiveResonance());

    // Mock an active session to trigger the logic
    act(() => {
      mockStorage.saveSession.mockResolvedValueOnce('active-123');
      result.current.startNewSession(); // Set initial state
    });

    // We must manually trigger loadSession logic to set activeSessionId since save/load is complex to fake instantly
    await act(async () => {
      await result.current.handleLoadSession('active-123'); // Assume this sets activeSessionId = active-123
    });

    await waitFor(() => {
      expect(result.current.availableModels.length).toBeGreaterThan(0);
    });

    // Send input to trigger git context fetching
    act(() => {
      result.current.setSelectedModel('gemini-2.5-flash');
      result.current.setInput('Please review local.txt');
    });

    await act(async () => {
      await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(GeminiService.generateResponse).toHaveBeenCalled();
    const payloadMessages = vi.mocked(GeminiService.generateResponse).mock.calls[0][1];
    const payloadPassed = payloadMessages[payloadMessages.length - 1].content;
    
    // Check for git injected texts
    expect(payloadPassed).toContain('Current Session Virtual Repository Status');
    expect(payloadPassed).toContain('Global Workspace Repository Status');
    expect(payloadPassed).toContain('Local Content');
    expect(payloadPassed).toContain('Global Content');
  });

  it('intercepts @mentions and injects semantic markers into the payload', async () => {
    let payloadPassed = '';
    vi.mocked(GeminiService.generateResponse).mockImplementation(async (...args: any[]) => {
      payloadPassed = args[1][args[1].length - 1].content;
      return { reply: 'Mocked', dissonanceScore: 0, dissonanceReason: '', semanticNodes: [], semanticEdges: [] };
    });
    vi.mocked(GeminiService.fetchModels).mockResolvedValue([{ name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' }]);

    const { result } = renderHook(() => useCognitiveResonance());

    await waitFor(() => {
      expect(result.current.availableModels.length).toBeGreaterThan(0);
    });

    // Mock an active state with some markers via setMessages
    act(() => {
        result.current.setMessages([{
          role: 'model',
          content: 'Here is some state',
          internalState: {
            dissonanceScore: 0,
            dissonanceReason: '',
            semanticNodes: [{ id: 'node1', label: 'AuthSystem', weight: 5 }],
            semanticEdges: []
          }
        }]);
    });

    act(() => {
      result.current.setInput('Fix the bug in @AuthSystem');
    });

    await act(async () => {
      await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(payloadPassed).toContain('AuthSystem');
    expect(payloadPassed).toContain('<system_directive>');
    expect(payloadPassed).toContain('(Weight: 5)');
  });

  it('handles mention selection', () => {
    const { result } = renderHook(() => useCognitiveResonance());
    
    act(() => {
      result.current.handleInputChange({ target: { value: 'Hello @aut', selectionStart: 10 } } as any);
    });

    act(() => {
      result.current.handleMentionSelect('AuthSystem');
    });

    expect(result.current.input).toBe('Hello @AuthSystem ');
    expect(result.current.mentionSearchQuery).toBeNull();
    expect(result.current.mentionSuggestions).toEqual([]);
  });

  it('ignores mention selection if cursor is null', () => {
    const { result } = renderHook(() => useCognitiveResonance());
    
    act(() => {
      // Cursor is null by default until typing, we just set input directly
      result.current.setInput('Hello @aut');
    });

    act(() => {
      result.current.handleMentionSelect('AuthSystem');
    });

    expect(result.current.input).toBe('Hello @aut');
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
    
    // Polyfill navigator.share to trigger the AbortError branch as well
    const orgNavigatorShare = navigator.share;
    const orgNavigatorCanShare = navigator.canShare;
    Object.assign(navigator, {
      canShare: vi.fn().mockReturnValue(true),
      share: vi.fn().mockRejectedValue(Object.assign(new Error('AbortError'), { name: 'AbortError' }))
    });

    const { result } = renderHook(() => useCognitiveResonance());

    act(() => {
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
    expect(navigator.share).toHaveBeenCalled();
    expect(CrBackend.downloadJSON).not.toHaveBeenCalled(); // Because it aborted

    // Restore navigator
    if (orgNavigatorShare) Object.assign(navigator, { share: orgNavigatorShare });
    else delete (navigator as any).share;
    if (orgNavigatorCanShare) Object.assign(navigator, { canShare: orgNavigatorCanShare });
    else delete (navigator as any).canShare;
  });

  it('calls downloadJSON if share throws a non-abort error', async () => {
    vi.mocked(CrBackend.shareJSON).mockResolvedValue(false);
    
    const orgNavigatorShare = navigator.share;
    const orgNavigatorCanShare = navigator.canShare;
    Object.assign(navigator, {
      canShare: vi.fn().mockReturnValue(true),
      share: vi.fn().mockRejectedValue(new Error('Some Other Error'))
    });

    const { result } = renderHook(() => useCognitiveResonance());

    act(() => { result.current.setInput('History test'); });
    vi.mocked(GeminiService.generateResponse).mockResolvedValue({ reply: 'R', dissonanceScore: 0, dissonanceReason: '', semanticNodes: [], semanticEdges: [] } as any);
    await waitFor(() => expect(result.current.availableModels.length).toBeGreaterThan(0));
    await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent); });
    
    await act(async () => {
      await result.current.handleDownloadHistory();
    });

    expect(CrBackend.downloadJSON).toHaveBeenCalled();

    // Restore navigator
    if (orgNavigatorShare) Object.assign(navigator, { share: orgNavigatorShare });
    else delete (navigator as any).share;
    if (orgNavigatorCanShare) Object.assign(navigator, { canShare: orgNavigatorCanShare });
    else delete (navigator as any).canShare;
  });

  it('calls downloadJSON if share API is not available at all', async () => {
    vi.mocked(CrBackend.shareJSON).mockResolvedValue(false);
    
    const orgNavigatorShare = navigator.share;
    const orgNavigatorCanShare = navigator.canShare;
    delete (navigator as any).share;
    delete (navigator as any).canShare;

    const { result } = renderHook(() => useCognitiveResonance());

    act(() => { result.current.setInput('History test 2'); });
    vi.mocked(GeminiService.generateResponse).mockResolvedValue({ reply: 'R2', dissonanceScore: 0, dissonanceReason: '', semanticNodes: [], semanticEdges: [] } as any);
    await waitFor(() => expect(result.current.availableModels.length).toBeGreaterThan(0));
    await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent); });
    
    await act(async () => {
      await result.current.handleDownloadHistory();
    });

    expect(CrBackend.downloadJSON).toHaveBeenCalled();

    // Restore navigator
    if (orgNavigatorShare) Object.assign(navigator, { share: orgNavigatorShare });
    if (orgNavigatorCanShare) Object.assign(navigator, { canShare: orgNavigatorCanShare });
  });

  it('uses navigator.share if available and supported (success)', async () => {
    vi.mocked(CrBackend.shareJSON).mockResolvedValue(false);
    
    // Polyfill navigator.share to trigger the success branch
    const orgNavigatorShare = navigator.share;
    const orgNavigatorCanShare = navigator.canShare;
    Object.assign(navigator, {
      canShare: vi.fn().mockReturnValue(true),
      share: vi.fn().mockResolvedValue(undefined)
    });

    const { result } = renderHook(() => useCognitiveResonance());

    act(() => {
      result.current.setInput('History test success');
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
    expect(navigator.share).toHaveBeenCalled();
    
    // Restore
    if (orgNavigatorShare) Object.assign(navigator, { share: orgNavigatorShare });
    else delete (navigator as any).share;
    if (orgNavigatorCanShare) Object.assign(navigator, { canShare: orgNavigatorCanShare });
    else delete (navigator as any).canShare;
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

  it('handles session JSON import without messages array', async () => {
    const originalAlert = window.alert;
    window.alert = vi.fn();
    const { result } = renderHook(() => useCognitiveResonance());

    const mockFile = new File(['{"config": {"model": "test"}}'], 'session.json', { type: 'application/json' });
    const mockEvent = {
        target: { files: [mockFile], value: 'fakepath/session.json' }
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    act(() => {
      result.current.handleImportSession(mockEvent);
    });

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('Invalid session file: missing messages array.');
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

  it('handles archiving and unarchiving a session', async () => {
    mockStorage.archiveSession = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useCognitiveResonance());
    
    act(() => {
      // Mock some sessions
      mockStorage.loadAllSessions.mockResolvedValue([
        { id: 'fake-session-id', customName: 'Old', preview: 'Old', turnCount: 1, timestamp: Date.now() }
      ]);
      result.current.setIsHistorySidebarOpen(true);
    });

    await waitFor(() => {
      expect(result.current.sessions.length).toBe(1);
    });

    // Make it active so we can test the fallback
    await act(async () => {
      await result.current.handleLoadSession('fake-session-id');
    });

    const mockEvent = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;

    await act(async () => {
      await result.current.handleArchiveSession('fake-session-id', true, mockEvent);
    });

    expect(mockStorage.archiveSession).toHaveBeenCalledWith('fake-session-id', true);
    expect(result.current.sessions[0].isArchived).toBe(true);
    expect(result.current.activeSessionId).toBe(null); // Active session should clear if archived
  });

  it('ensures an active session exists', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01'));
    const { result } = renderHook(() => useCognitiveResonance());

    expect(result.current.activeSessionId).toBe(null);

    let generatedId: string | undefined;
    act(() => {
      generatedId = result.current.ensureActiveSession();
    });

    expect(generatedId).toMatch(/session-\d+/);
    expect(result.current.activeSessionId).toBe(generatedId);

    // Call it again and it should return the exact same ID
    let secondId: string | undefined;
    act(() => {
      secondId = result.current.ensureActiveSession();
    });

    expect(secondId).toBe(generatedId);
    vi.useRealTimers();
  });
});
