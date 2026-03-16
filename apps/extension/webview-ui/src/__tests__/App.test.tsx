import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import App from '../App';

// ─── Reusable mock factories ────────────────────────────────────────

function createMockApp(overrides: Record<string, any> = {}) {
  return {
    showApiKeyModal: false,
    apiKeyInput: '',
    setApiKeyInput: vi.fn(),
    handleSetApiKey: vi.fn(),
    setShowApiKeyModal: vi.fn(),
    isHistorySidebarOpen: false,
    setIsHistorySidebarOpen: vi.fn(),
    activeSidebarTab: 'history' as string,
    setActiveSidebarTab: vi.fn(),
    historySearchQuery: '',
    setHistorySearchQuery: vi.fn(),
    sessions: [] as any[],
    searchResults: [] as any[],
    handleSearchResultClick: vi.fn(),
    activeSessionId: 'test-session-1',
    editingSessionId: null as string | null,
    editSessionName: '',
    setEditSessionName: vi.fn(),
    startRenameSession: vi.fn(),
    handleRenameSessionSubmit: vi.fn(),
    handleDeleteSession: vi.fn(),
    handleLoadSession: vi.fn(),
    startNewSession: vi.fn(),
    importInputRef: { current: null },
    handleImportSession: vi.fn(),
    isDissonancePanelOpen: false,
    setIsDissonancePanelOpen: vi.fn(),
    isRightSidebarOpen: false,
    setIsRightSidebarOpen: vi.fn(),
    isViewingHistory: false,
    selectedTurnIndex: null,
    setSelectedTurnIndex: vi.fn(),
    activeTurnIndex: 0,
    activeState: null as any,
    historyData: [],
    messages: [] as any[],
    showSystemMessages: false,
    setShowSystemMessages: vi.fn(),
    copiedIndex: null as number | null,
    setCopiedIndex: vi.fn(),
    isLoading: false,
    messagesEndRef: { current: null },
    isViewMode: false,
    handleDownloadHistory: vi.fn(),
    isGemSidebarOpen: false,
    setIsGemSidebarOpen: vi.fn(),
    savedGems: [] as any[],
    activeGemId: null as string | null,
    defaultGemId: null as string | null,
    handleSelectGem: vi.fn(),
    handleSetDefaultGem: vi.fn(),
    handleDeleteGem: vi.fn(),
    handleSaveGem: vi.fn(),
    editingGem: null as any,
    setEditingGem: vi.fn(),
    creatingGem: false,
    setCreatingGem: vi.fn(),
    draftGem: { name: '', model: 'gemini-2.5-flash', systemPrompt: '' },
    setDraftGem: vi.fn(),
    selectedModel: 'gemini-2.5-flash',
    setSelectedModel: vi.fn(),
    chatModels: [{ name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' }],
    input: '',
    setInput: vi.fn(),
    handleInputChange: vi.fn(),
    handleKeyDown: vi.fn(),
    handleSubmit: vi.fn((e: any) => e?.preventDefault?.()),
    handleStopGeneration: vi.fn(),
    inputRef: { current: null },
    fileInputRef: { current: null },
    handleFileSelect: vi.fn(),
    attachedFiles: [] as any[],
    setAttachedFiles: vi.fn(),
    mentionSearchQuery: null as string | null,
    mentionSuggestions: [] as any[],
    handleMentionSelect: vi.fn(),
    isSearchEnabled: false,
    setIsSearchEnabled: vi.fn(),
    markerViewMode: 'graph' as string,
    setMarkerViewMode: vi.fn(),
    markerSearchQuery: '',
    setMarkerSearchQuery: vi.fn(),
    filteredMarkers: [] as any[],
    artifactContent: '',
    setArtifactContent: vi.fn(),
    ensureActiveSession: vi.fn(() => 'test-session-1'),
    executeCommand: vi.fn(),
    ...overrides,
  };
}

let currentMockApp: ReturnType<typeof createMockApp>;

const mockStorage = {
  type: 'local' as string,
  isReady: vi.fn(() => false),
  saveSession: vi.fn(),
  loadAllSessions: vi.fn(),
  loadSession: vi.fn(),
  deleteSession: vi.fn(),
  renameSession: vi.fn(),
  saveGemsConfig: vi.fn(),
  loadGemsConfig: vi.fn(),
};

let currentAuthStatus = 'authenticated';

vi.mock('@cr/core', () => ({
  useREPL: () => currentMockApp,
  useCognitivePlatform: () => ({
    authStatus: currentAuthStatus,
    auth: {
      login: vi.fn(),
      loginWithEmail: vi.fn(),
      signupWithEmail: vi.fn(),
      logout: vi.fn(),
      init: vi.fn(),
      getStatus: vi.fn(),
      getUser: vi.fn(),
      onChange: vi.fn(() => vi.fn()),
    },
    storage: mockStorage,
  }),
  useVoiceToDSL: () => ({ isListening: false, startListening: vi.fn(), stopListening: vi.fn() }),
  translateToDSL: vi.fn(),
  GitContextManager: vi.fn(() => ({
    initRepo: vi.fn(),
    initGlobalRepo: vi.fn(),
    stageFile: vi.fn(),
    stageGlobalFile: vi.fn(),
    commitChange: vi.fn(),
    commitGlobalChange: vi.fn(),
  })),
}));

vi.mock('@cr/ui', () => ({
  SemanticGraph: ({ nodes, edges, onNodeClick }: any) => <div data-testid="semantic-graph" />,
  DissonanceMeter: () => <div data-testid="dissonance-meter" />,
  MarkdownRenderer: ({ content }: any) => <div data-testid="markdown-renderer">{content}</div>,
  AuthScreen: ({ onLoginOAuth }: any) => <div data-testid="auth-screen"><button onClick={onLoginOAuth}>Login</button></div>,
  ArtifactEditor: ({ filename, initialContent, sessionId, onSave, onSync }: any) => (
    <div data-testid="artifact-editor" data-session-id={sessionId} data-filename={filename}>{initialContent}</div>
  ),
}));

vi.mock('@cr/backend', () => ({
  clearApiKey: vi.fn(),
}));

// ─── Tests ────────────────────────────────────────────────────────────

describe('Extension App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentMockApp = createMockApp();
    currentAuthStatus = 'authenticated';
    mockStorage.type = 'local';
    mockStorage.isReady.mockReturnValue(false);
  });

  // ═══ Auth Screen ══════════════════════════════════════════════════

  it('renders auth screen when not authenticated', () => {
    currentAuthStatus = 'loading';
    render(<App />);
    expect(screen.getByTestId('auth-screen')).toBeInTheDocument();
  });

  // ═══ API Key Modal ════════════════════════════════════════════════

  describe('API Key Modal', () => {
    it('renders modal when showApiKeyModal is true', () => {
      currentMockApp = createMockApp({ showApiKeyModal: true });
      render(<App />);
      expect(screen.getByPlaceholderText('AIza...')).toBeInTheDocument();
      expect(screen.getByText('Save & Start')).toBeInTheDocument();
      expect(screen.getByText(/Google AI Studio/)).toBeInTheDocument();
    });

    it('calls handleSetApiKey on form submit', () => {
      currentMockApp = createMockApp({ showApiKeyModal: true, apiKeyInput: 'AIzaTest' });
      render(<App />);
      fireEvent.submit(screen.getByText('Save & Start').closest('form')!);
      expect(currentMockApp.handleSetApiKey).toHaveBeenCalledTimes(1);
    });

    it('disables submit when apiKeyInput is empty', () => {
      currentMockApp = createMockApp({ showApiKeyModal: true, apiKeyInput: '' });
      render(<App />);
      expect(screen.getByText('Save & Start')).toBeDisabled();
    });

    it('updates apiKeyInput on change', () => {
      currentMockApp = createMockApp({ showApiKeyModal: true });
      render(<App />);
      fireEvent.change(screen.getByPlaceholderText('AIza...'), { target: { value: 'newkey' } });
      expect(currentMockApp.setApiKeyInput).toHaveBeenCalled();
    });
  });

  // ═══ Header ═══════════════════════════════════════════════════════

  describe('Header', () => {
    it('renders app name and version', () => {
      render(<App />);
      expect(screen.getByText('Cognitive Resonance')).toBeInTheDocument();
      expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    });

    it('renders "Local" badge when storage is local', () => {
      mockStorage.type = 'local';
      mockStorage.isReady.mockReturnValue(false);
      render(<App />);
      expect(screen.getByText('Local')).toBeInTheDocument();
      expect(screen.getByTitle('Using local storage')).toBeInTheDocument();
    });

    it('renders "Synced" badge when cloud storage is ready', () => {
      mockStorage.type = 'cloud';
      mockStorage.isReady.mockReturnValue(true);
      render(<App />);
      expect(screen.getByText('Synced')).toBeInTheDocument();
      expect(screen.getByTitle('Connected to cloud storage')).toBeInTheDocument();
    });

    it('renders "Local" badge when cloud but not ready', () => {
      mockStorage.type = 'cloud';
      mockStorage.isReady.mockReturnValue(false);
      render(<App />);
      expect(screen.getByText('Local')).toBeInTheDocument();
    });

    it('renders Share button when not in view mode', () => {
      render(<App />);
      expect(screen.getByTitle('Download Snapshot JSON')).toBeInTheDocument();
    });

    it('hides Share button in view mode', () => {
      currentMockApp = createMockApp({ isViewMode: true });
      render(<App />);
      expect(screen.queryByTitle('Download Snapshot JSON')).not.toBeInTheDocument();
    });

    it('clears API key and opens modal when 🔑 button clicked', async () => {
      render(<App />);
      fireEvent.click(screen.getByTitle('Change API Key'));
      const { clearApiKey } = await import('@cr/backend');
      expect(clearApiKey).toHaveBeenCalled();
      expect(currentMockApp.setShowApiKeyModal).toHaveBeenCalledWith(true);
    });

    it('opens history sidebar on hamburger click', () => {
      render(<App />);
      fireEvent.click(screen.getByTitle('Session History'));
      expect(currentMockApp.setIsHistorySidebarOpen).toHaveBeenCalledWith(true);
    });
  });

  // ═══ Session Sidebar ══════════════════════════════════════════════

  describe('Session Sidebar', () => {
    it('renders sessions with cloud icon', () => {
      currentMockApp = createMockApp({
        isHistorySidebarOpen: true,
        sessions: [{ id: 's1', preview: 'Cloud Session', timestamp: Date.now(), isCloud: true }],
      });
      render(<App />);
      expect(screen.getByTitle('Synced to cloud')).toBeInTheDocument();
    });

    it('renders sessions with hard drive icon', () => {
      currentMockApp = createMockApp({
        isHistorySidebarOpen: true,
        sessions: [{ id: 's2', preview: 'Local Session', timestamp: Date.now(), isCloud: false }],
      });
      render(<App />);
      expect(screen.getByTitle('Local only')).toBeInTheDocument();
    });

    it('renders mixed cloud and local sessions', () => {
      currentMockApp = createMockApp({
        isHistorySidebarOpen: true,
        sessions: [
          { id: 's1', preview: 'Cloud', timestamp: Date.now(), isCloud: true },
          { id: 's2', preview: 'Local', timestamp: Date.now(), isCloud: false },
        ],
      });
      render(<App />);
      expect(screen.getByTitle('Synced to cloud')).toBeInTheDocument();
      expect(screen.getByTitle('Local only')).toBeInTheDocument();
    });

    it('shows empty state when no sessions', () => {
      currentMockApp = createMockApp({ isHistorySidebarOpen: true, sessions: [] });
      render(<App />);
      expect(screen.getByText('No previous sessions found')).toBeInTheDocument();
    });

    it('renders new session button', () => {
      currentMockApp = createMockApp({ isHistorySidebarOpen: true });
      render(<App />);
      expect(screen.getByText('New')).toBeInTheDocument();
    });

    it('clicking New starts a new session', () => {
      currentMockApp = createMockApp({ isHistorySidebarOpen: true });
      render(<App />);
      fireEvent.click(screen.getByText('New'));
      expect(currentMockApp.startNewSession).toHaveBeenCalled();
    });

    it('renders inline rename editor when editing', () => {
      currentMockApp = createMockApp({
        isHistorySidebarOpen: true,
        sessions: [{ id: 's1', preview: 'Test', timestamp: Date.now(), isCloud: false }],
        editingSessionId: 's1',
        editSessionName: 'Renamed',
      });
      render(<App />);
      expect(screen.getByDisplayValue('Renamed')).toBeInTheDocument();
    });

    it('shows search tab and input', () => {
      currentMockApp = createMockApp({
        isHistorySidebarOpen: true,
        activeSidebarTab: 'search',
        historySearchQuery: '',
      });
      render(<App />);
      expect(screen.getByPlaceholderText('Search concepts across all sessions...')).toBeInTheDocument();
    });

    it('shows search empty state', () => {
      currentMockApp = createMockApp({
        isHistorySidebarOpen: true,
        activeSidebarTab: 'search',
        historySearchQuery: 'xyz',
        searchResults: [],
      });
      render(<App />);
      expect(screen.getByText('No matching concepts found.')).toBeInTheDocument();
    });

    it('renders search results', () => {
      currentMockApp = createMockApp({
        isHistorySidebarOpen: true,
        activeSidebarTab: 'search',
        historySearchQuery: 'test',
        searchResults: [{
          sessionId: 's1',
          turnIndex: 0,
          matchedConcepts: ['concept1'],
          contextSnippet: 'This is a test snippet',
          timestamp: Date.now(),
        }],
      });
      render(<App />);
      expect(screen.getByText('concept1')).toBeInTheDocument();
    });

    it('closes sidebar on backdrop click', () => {
      currentMockApp = createMockApp({ isHistorySidebarOpen: true });
      render(<App />);
      // The backdrop is the first div with bg-black/40
      const backdrop = document.querySelector('.fixed.inset-0.bg-black\\/40');
      if (backdrop) fireEvent.click(backdrop);
      expect(currentMockApp.setIsHistorySidebarOpen).toHaveBeenCalledWith(false);
    });

    it('loads session on click', () => {
      currentMockApp = createMockApp({
        isHistorySidebarOpen: true,
        sessions: [{ id: 's1', preview: 'Test', timestamp: Date.now(), isCloud: false }],
      });
      render(<App />);
      fireEvent.click(screen.getByText('Test'));
      expect(currentMockApp.handleLoadSession).toHaveBeenCalledWith('s1');
    });
  });

  // ═══ Chat Area ════════════════════════════════════════════════════

  describe('Chat Area', () => {
    it('shows empty state when no messages', () => {
      render(<App />);
      expect(screen.getByText(/Initiate conversation/)).toBeInTheDocument();
    });

    it('renders a user message', () => {
      currentMockApp = createMockApp({
        messages: [{ role: 'user', content: 'Hello world' }],
      });
      render(<App />);
      expect(screen.getByText('Hello world')).toBeInTheDocument();
    });

    it('renders a model message via MarkdownRenderer', () => {
      currentMockApp = createMockApp({
        messages: [{ role: 'model', content: 'Model response' }],
      });
      render(<App />);
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });

    it('renders error messages with AlertTriangle', () => {
      currentMockApp = createMockApp({
        messages: [{ role: 'model', content: 'Something failed', isError: true }],
      });
      render(<App />);
      expect(screen.getByText('Something failed')).toBeInTheDocument();
      expect(screen.getByText('Error')).toBeInTheDocument();
    });

    it('shows loading indicator', () => {
      currentMockApp = createMockApp({ isLoading: true });
      render(<App />);
      expect(screen.getByText('Processing cognitive state...')).toBeInTheDocument();
    });

    it('shows stop button when loading', () => {
      currentMockApp = createMockApp({ isLoading: true });
      render(<App />);
      expect(screen.getByTitle('Stop generation')).toBeInTheDocument();
    });

    it('renders View State button on model messages with modelTurnIndex', () => {
      currentMockApp = createMockApp({
        messages: [{ role: 'model', content: 'Response', modelTurnIndex: 0 }],
        activeTurnIndex: 1,
      });
      render(<App />);
      expect(screen.getByText('View State')).toBeInTheDocument();
    });

    it('renders Viewing State when on active turn', () => {
      currentMockApp = createMockApp({
        messages: [{ role: 'model', content: 'Response', modelTurnIndex: 0 }],
        activeTurnIndex: 0,
      });
      render(<App />);
      expect(screen.getByText('Viewing State')).toBeInTheDocument();
    });

    it('renders token usage badge', () => {
      currentMockApp = createMockApp({
        activeState: {
          tokenUsage: { totalTokenCount: 5000 },
          dissonanceScore: null,
        },
      });
      render(<App />);
      expect(screen.getByText('5.0k')).toBeInTheDocument();
    });

    it('renders small token count without k suffix', () => {
      currentMockApp = createMockApp({
        activeState: {
          tokenUsage: { totalTokenCount: 500 },
          dissonanceScore: null,
        },
      });
      render(<App />);
      expect(screen.getByText('500')).toBeInTheDocument();
    });

    it('renders dissonance score badge (low)', () => {
      currentMockApp = createMockApp({
        activeState: {
          dissonanceScore: 20,
          dissonanceReason: 'Low dissonance',
        },
      });
      render(<App />);
      expect(screen.getByText('20')).toBeInTheDocument();
    });

    it('renders dissonance score badge (medium)', () => {
      currentMockApp = createMockApp({
        activeState: {
          dissonanceScore: 50,
          dissonanceReason: 'Medium',
        },
      });
      render(<App />);
      expect(screen.getByText('50')).toBeInTheDocument();
    });

    it('renders dissonance score badge (high)', () => {
      currentMockApp = createMockApp({
        activeState: {
          dissonanceScore: 80,
          dissonanceReason: 'High',
        },
      });
      render(<App />);
      expect(screen.getByText('80')).toBeInTheDocument();
    });

    it('shows system messages toggle', () => {
      render(<App />);
      const toggleBtn = screen.getByTitle('Show System Interactions');
      expect(toggleBtn).toBeInTheDocument();
    });

    it('toggles show system messages', () => {
      render(<App />);
      fireEvent.click(screen.getByTitle('Show System Interactions'));
      expect(currentMockApp.setShowSystemMessages).toHaveBeenCalledWith(true);
    });

    it('filters system messages when hidden', () => {
      currentMockApp = createMockApp({
        showSystemMessages: false,
        messages: [
          { role: 'model', content: '[System]: hidden msg' },
          { role: 'model', content: 'Visible msg' },
        ],
      });
      render(<App />);
      expect(screen.queryByText('[System]: hidden msg')).not.toBeInTheDocument();
    });

    it('copy error button works', () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText: writeTextMock } });
      currentMockApp = createMockApp({
        messages: [{ role: 'model', content: 'Error detail', isError: true }],
      });
      render(<App />);
      fireEvent.click(screen.getByText('Copy error'));
      expect(writeTextMock).toHaveBeenCalledWith('Error detail');
    });
  });

  // ═══ Input Area ═══════════════════════════════════════════════════

  describe('Input Area', () => {
    it('renders input field', () => {
      render(<App />);
      expect(screen.getByPlaceholderText('Send a message...')).toBeInTheDocument();
    });

    it('renders Google Search grounding toggle', () => {
      render(<App />);
      expect(screen.getByTitle('Google Search Grounding: OFF')).toBeInTheDocument();
    });

    it('toggles search grounding', () => {
      render(<App />);
      fireEvent.click(screen.getByTitle('Google Search Grounding: OFF'));
      expect(currentMockApp.setIsSearchEnabled).toHaveBeenCalledWith(true);
    });

    it('renders file attach button', () => {
      render(<App />);
      expect(screen.getByTitle('Attach files')).toBeInTheDocument();
    });

    it('renders attached files', () => {
      currentMockApp = createMockApp({
        attachedFiles: [{ id: 'f1', name: 'test.png', preview: null }],
      });
      render(<App />);
      expect(screen.getByText('test.png')).toBeInTheDocument();
    });

    it('renders attached files with preview image', () => {
      currentMockApp = createMockApp({
        attachedFiles: [{ id: 'f1', name: 'img.png', preview: 'data:image/png;base64,abc' }],
      });
      render(<App />);
      expect(screen.getByAltText('img.png')).toBeInTheDocument();
    });

    it('renders gem selector', () => {
      currentMockApp = createMockApp({
        savedGems: [{ id: 'g1', name: 'Test Gem', model: 'gemini-2.5-flash', systemPrompt: '', isBuiltIn: false }],
        activeGemId: 'g1',
      });
      render(<App />);
      expect(screen.getAllByText('Test Gem').length).toBeGreaterThanOrEqual(1);
    });

    it('renders model selector', () => {
      render(<App />);
      expect(screen.getByTitle('Override model for this session')).toBeInTheDocument();
    });

    it('shows slash commands when input starts with /', () => {
      currentMockApp = createMockApp({ input: '/' });
      render(<App />);
      expect(screen.getByText('/session ls')).toBeInTheDocument();
      expect(screen.getByText('/clear')).toBeInTheDocument();
    });

    it('shows mention suggestions when mentionSearchQuery is set', () => {
      currentMockApp = createMockApp({
        mentionSearchQuery: 'test',
        mentionSuggestions: [{ name: 'TestConcept', count: 3 }],
      });
      render(<App />);
      expect(screen.getByText('TestConcept')).toBeInTheDocument();
      expect(screen.getByText('Weight: 3')).toBeInTheDocument();
    });

    it('shows empty mention state', () => {
      currentMockApp = createMockApp({
        mentionSearchQuery: 'xyz',
        mentionSuggestions: [],
      });
      render(<App />);
      expect(screen.getByText('No matching concepts found in history.')).toBeInTheDocument();
    });

    it('hides input area in view mode', () => {
      currentMockApp = createMockApp({ isViewMode: true });
      render(<App />);
      expect(screen.queryByPlaceholderText('Send a message...')).not.toBeInTheDocument();
    });
  });

  // ═══ Right Sidebar (Semantic Markers) ═════════════════════════════

  describe('Right Sidebar', () => {
    it('renders semantic graph by default', () => {
      render(<App />);
      expect(screen.getByTestId('semantic-graph')).toBeInTheDocument();
    });

    it('renders marker list view', () => {
      currentMockApp = createMockApp({
        markerViewMode: 'list',
        filteredMarkers: [{ name: 'Concept A', count: 5 }],
      });
      render(<App />);
      expect(screen.getByText('Concept A')).toBeInTheDocument();
    });

    it('renders empty marker list', () => {
      currentMockApp = createMockApp({
        markerViewMode: 'list',
        filteredMarkers: [],
      });
      render(<App />);
      expect(screen.getByText('No markers found.')).toBeInTheDocument();
    });

    it('renders artifact editor with sessionId', () => {
      currentMockApp = createMockApp({ markerViewMode: 'artifact' });
      render(<App />);
      const editor = screen.getByTestId('artifact-editor');
      expect(editor).toHaveAttribute('data-session-id', 'test-session-1');
      expect(editor).toHaveAttribute('data-filename', 'VirtualContext.md');
    });

    it('shows return to current button when viewing history', () => {
      currentMockApp = createMockApp({ isViewingHistory: true });
      render(<App />);
      const returnBtns = screen.getAllByText('Return to Current');
      expect(returnBtns.length).toBeGreaterThanOrEqual(1);
    });

    it('renders filter input in list mode', () => {
      currentMockApp = createMockApp({ markerViewMode: 'list' });
      render(<App />);
      expect(screen.getByPlaceholderText('Filter markers...')).toBeInTheDocument();
    });

    it('renders view mode tabs', () => {
      render(<App />);
      expect(screen.getByText('Graph')).toBeInTheDocument();
      expect(screen.getByText('List')).toBeInTheDocument();
      expect(screen.getByText('Artifacts')).toBeInTheDocument();
    });
  });

  // ═══ Gem Sidebar ══════════════════════════════════════════════════

  describe('Gem Sidebar', () => {
    it('renders gem list when open', () => {
      currentMockApp = createMockApp({
        isGemSidebarOpen: true,
        savedGems: [
          { id: 'g1', name: 'Code Reviewer', model: 'gemini-2.5-flash', systemPrompt: 'You are a code reviewer', isBuiltIn: false },
        ],
      });
      render(<App />);
      expect(screen.getByText('Gems')).toBeInTheDocument();
      expect(screen.getByText('Code Reviewer')).toBeInTheDocument();
    });

    it('renders built-in badge', () => {
      currentMockApp = createMockApp({
        isGemSidebarOpen: true,
        savedGems: [
          { id: 'g1', name: 'Default', model: 'gemini-2.5-flash', systemPrompt: '', isBuiltIn: true },
        ],
      });
      render(<App />);
      expect(screen.getByText('Built-in')).toBeInTheDocument();
    });

    it('renders create custom gem button', () => {
      currentMockApp = createMockApp({ isGemSidebarOpen: true });
      render(<App />);
      expect(screen.getByText('Create Custom Gem')).toBeInTheDocument();
    });

    it('renders gem creation form', () => {
      currentMockApp = createMockApp({
        isGemSidebarOpen: true,
        creatingGem: true,
        draftGem: { name: '', model: 'gemini-2.5-flash', systemPrompt: '' },
      });
      render(<App />);
      expect(screen.getByText('New Custom Gem')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('E.g. Code Reviewer')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('You are an expert...')).toBeInTheDocument();
      expect(screen.getByText('Save Gem')).toBeInTheDocument();
    });

    it('renders gem edit form', () => {
      currentMockApp = createMockApp({
        isGemSidebarOpen: true,
        editingGem: { id: 'g1', name: 'My Gem', model: 'gemini-2.5-flash', systemPrompt: 'Test prompt' },
      });
      render(<App />);
      expect(screen.getByText('Edit Gem')).toBeInTheDocument();
      expect(screen.getByDisplayValue('My Gem')).toBeInTheDocument();
    });

    it('shows "No system prompt" for gems without one', () => {
      currentMockApp = createMockApp({
        isGemSidebarOpen: true,
        savedGems: [
          { id: 'g1', name: 'Blank Gem', model: 'gemini-2.5-flash', systemPrompt: '', isBuiltIn: false },
        ],
      });
      render(<App />);
      expect(screen.getByText('No system prompt')).toBeInTheDocument();
    });
  });

  // ═══ Dissonance Panel ═════════════════════════════════════════════

  describe('Dissonance Panel', () => {
    it('renders DissonanceMeter', () => {
      render(<App />);
      expect(screen.getByTestId('dissonance-meter')).toBeInTheDocument();
    });

    it('renders Internal State heading', () => {
      render(<App />);
      expect(screen.getByText('Internal State')).toBeInTheDocument();
    });
  });
});
