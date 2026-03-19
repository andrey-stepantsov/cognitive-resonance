import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useREPL } from '../hooks/useREPL';
import * as useCognitiveResonanceModule from '../hooks/useCognitiveResonance';

vi.mock('../hooks/useCognitiveResonance', async (importOriginal) => {
  const actual = await importOriginal<typeof useCognitiveResonanceModule>();
  return {
    ...actual,
    useCognitiveResonance: vi.fn(),
  };
});

vi.mock('@cr/backend', () => ({
  // Mocks for backend
}));

const mockGitContextManager = {
  initRepo: vi.fn().mockResolvedValue(true),
  initGlobalRepo: vi.fn().mockResolvedValue(true),
  hasCommits: vi.fn().mockResolvedValue(true),
  hasGlobalCommits: vi.fn().mockResolvedValue(true),
  stageFile: vi.fn().mockResolvedValue(true),
  stageGlobalFile: vi.fn().mockResolvedValue(true),
  commitChange: vi.fn().mockResolvedValue('123'),
  commitGlobalChange: vi.fn().mockResolvedValue('123'),
  getCurrentBranch: vi.fn().mockResolvedValue('main'),
  getGlobalBranch: vi.fn().mockResolvedValue('main'),
  fs: {},
  dir: '/session-test',
  globalDir: '/global-workspace'
};

vi.mock('../services/GitContextManager', () => {
  return {
    GitContextManager: vi.fn().mockImplementation(function() {
      return mockGitContextManager;
    })
  };
});

describe('useREPL', () => {
  let mockCrOptions: any;

  beforeEach(() => {
    mockCrOptions = {
      messages: [],
      setMessages: vi.fn((updateFn: any) => {
        if (typeof updateFn === 'function') {
           mockCrOptions.messages = updateFn(mockCrOptions.messages);
        } else {
           mockCrOptions.messages = updateFn;
        }
      }),
      input: '',
      setInput: vi.fn((val) => { mockCrOptions.input = val; }),
      messagesEndRef: { current: { scrollIntoView: vi.fn() } },
      handleSubmit: vi.fn(),
      startNewSession: vi.fn(),
      handleLoadSession: vi.fn(),
      handleArchiveSession: vi.fn(),
      handleDeleteSession: vi.fn(),
      setIsHistorySidebarOpen: vi.fn(),
      setSelectedModel: vi.fn(),
      handleSelectGem: vi.fn(),
      setIsGemSidebarOpen: vi.fn(),
      handleSetApiKey: vi.fn(),
      handleClearApiKey: vi.fn(),
      handleMentionSelect: vi.fn(),
      activeState: null,
    };
    vi.mocked(useCognitiveResonanceModule.useCognitiveResonance).mockReturnValue(mockCrOptions);
  });

  const setup = () => {
    return renderHook(() => useREPL());
  };

  it('delegates to cr.handleSubmit for non-slash commands', async () => {
    mockCrOptions.input = 'hello world';
    const { result } = setup();

    const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;
    
    await act(async () => {
      await result.current.handleSubmit(mockEvent);
    });

    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(mockCrOptions.handleSubmit).toHaveBeenCalledWith(mockEvent);
    expect(mockCrOptions.setMessages).not.toHaveBeenCalled();
  });

  it('ignores empty input', async () => {
    mockCrOptions.input = '   ';
    const { result } = setup();
    const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;
    
    await act(async () => {
      await result.current.handleSubmit(mockEvent);
    });

    expect(mockCrOptions.handleSubmit).not.toHaveBeenCalled();
  });

  it('handles /clear', async () => {
    mockCrOptions.input = '/clear';
    const { result } = setup();
    const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;

    await act(async () => {
      await result.current.handleSubmit(mockEvent);
    });

    expect(mockCrOptions.setInput).toHaveBeenCalledWith('');
    expect(mockCrOptions.startNewSession).toHaveBeenCalled();
  });

  it('handles /session new', async () => {
    mockCrOptions.input = '/session new';
    const { result } = setup();
    const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;

    await act(async () => {
      await result.current.handleSubmit(mockEvent);
    });

    expect(mockCrOptions.startNewSession).toHaveBeenCalled();
  });

  it('handles /session load with exact ID', async () => {
    mockCrOptions.sessions = [{ id: '123', preview: 'Session 123' }];
    mockCrOptions.input = '/session load 123';
    const { result } = setup();
    await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
    expect(mockCrOptions.handleLoadSession).toHaveBeenCalledWith('123');
  });

  it('handles /session load with fuzzy match', async () => {
    mockCrOptions.sessions = [{ id: 'abc-123', customName: 'My Auth Setup', preview: 'Initial Auth chat' }];
    mockCrOptions.input = '/session load auth setup';
    const { result } = setup();
    await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
    expect(mockCrOptions.handleLoadSession).toHaveBeenCalledWith('abc-123');
    expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: Loading session: My Auth Setup' }));
  });

  it('handles /session load without query', async () => {
    mockCrOptions.input = '/session load';
    const { result } = setup();
    await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
    expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: Please provide a session name or ID to load.' }));
  });

  it('handles /session load with no matches', async () => {
    mockCrOptions.sessions = [{ id: '123', preview: 'Apple' }];
    mockCrOptions.input = '/session load banana';
    const { result } = setup();
    await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
    expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: "[System]: No session found matching 'banana'." }));
    expect(mockCrOptions.handleLoadSession).not.toHaveBeenCalled();
  });

  describe('session archive/recover/delete commands', () => {
    beforeEach(() => {
      mockCrOptions.sessions = [
        { id: '123', customName: 'Project Alpha', preview: 'Discussing project A' },
        { id: '456', customName: 'Project Beta', preview: 'Discussing project B' }
      ];
    });

    it('handles /session archive with exact ID', async () => {
      mockCrOptions.input = '/session archive 123';
      const { result } = setup();
      await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
      expect(mockCrOptions.handleArchiveSession).toHaveBeenCalledWith('123', true, expect.any(Event));
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: Archived session: Project Alpha' }));
    });

    it('handles /session archive with fuzzy match', async () => {
      mockCrOptions.input = '/session archive beta';
      const { result } = setup();
      await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
      expect(mockCrOptions.handleArchiveSession).toHaveBeenCalledWith('456', true, expect.any(Event));
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: Archived session: Project Beta' }));
    });

    it('handles /session recover with exact ID', async () => {
      mockCrOptions.input = '/session recover 456';
      const { result } = setup();
      await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
      expect(mockCrOptions.handleArchiveSession).toHaveBeenCalledWith('456', false, expect.any(Event));
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: Recovered session: Project Beta' }));
    });

    it('handles /session delete with exact ID', async () => {
      mockCrOptions.input = '/session delete 123';
      const { result } = setup();
      await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
      expect(mockCrOptions.handleDeleteSession).toHaveBeenCalledWith('123', expect.any(Event));
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: Permanently deleted session: Project Alpha' }));
    });

    it('handles command without query', async () => {
      mockCrOptions.input = '/session archive';
      const { result } = setup();
      await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: Please provide a session name or ID to archive.' }));
      expect(mockCrOptions.handleArchiveSession).not.toHaveBeenCalled();
    });
  });

  it('handles /session ls with saved sessions', async () => {
    mockCrOptions.sessions = [
      { id: '1', preview: 'Apple' },
      { id: '2', customName: 'Banana', preview: 'Peel' }
    ];
    mockCrOptions.input = '/session ls';
    const { result } = setup();
    await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
    
    expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ 
        content: '[System]: Available Sessions:\\n1. [1] Apple\\n2. [2] Banana' 
    }));
  });

  it('handles /session ls with no sessions', async () => {
    mockCrOptions.sessions = [];
    mockCrOptions.input = '/session ls';
    const { result } = setup();
    await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
    
    expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: No saved sessions found.' }));
  });

  it('handles /history with existing commands', async () => {
    const { result, rerender } = setup();

    await act(async () => {
      mockCrOptions.input = '/gem ls';
      await result.current.handleSubmit({ preventDefault: vi.fn() } as any);
    });
    rerender();

    await act(async () => {
      mockCrOptions.input = '/model use pro';
      await result.current.handleSubmit({ preventDefault: vi.fn() } as any);
    });
    rerender();

    await act(async () => {
      mockCrOptions.input = '/history';
      await result.current.handleSubmit({ preventDefault: vi.fn() } as any);
    });
    rerender();

    const messages = mockCrOptions.messages;
    const historyMessage = messages.find((m: any) => m.content.includes('Recent Command History'));
    expect(historyMessage).toBeDefined();
    expect(historyMessage?.content).toContain('1. /history');
    expect(historyMessage?.content).toContain('2. /model use pro');
    expect(historyMessage?.content).toContain('3. /gem ls');
  });

  it('handles /history with no previous commands', async () => {
    mockCrOptions.input = '/history';
    const { result, rerender } = setup();
    
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: vi.fn() } as any);
    });
    rerender();

    expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({
      content: expect.stringContaining('1. /history')
    }));
  });

  it('handles consecutive Ctrl+R reverse search', async () => {
    const { result, rerender } = setup();

    await act(async () => {
      mockCrOptions.input = '/graph ls';
      await result.current.handleSubmit({ preventDefault: vi.fn() } as any);
    });
    rerender();

    await act(async () => {
      mockCrOptions.input = '/session ls';
      await result.current.handleSubmit({ preventDefault: vi.fn() } as any);
    });
    rerender();
    
    await act(async () => {
      mockCrOptions.input = '/graph search [System]';
      await result.current.handleSubmit({ preventDefault: vi.fn() } as any);
    });
    rerender();

    // First Ctrl+R should match the most recent one: /graph search [System]
    await act(async () => {
      mockCrOptions.input = 'gr';
      const event = { ctrlKey: true, key: 'r', preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLInputElement>;
      result.current.handleKeyDown(event);
    });
    rerender();
    
    expect(mockCrOptions.setInput).toHaveBeenCalledWith('/graph search [System]');

    // Second Ctrl+R
    await act(async () => {
      // simulate the state update
      mockCrOptions.input = '/graph search [System]';
      const event = { ctrlKey: true, key: 'r', preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLInputElement>;
      result.current.handleKeyDown(event);
    });
    rerender();
    
    expect(mockCrOptions.setInput).toHaveBeenCalledWith('/graph ls');

    // Third Ctrl+R with no older matches
    await act(async () => {
      // simulate the state update from the second match
      mockCrOptions.input = '/graph ls';
      const event = { ctrlKey: true, key: 'r', preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLInputElement>;
      result.current.handleKeyDown(event);
    });
    rerender();

    expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({
      content: "[System]: Reverse search: no older items matching 'gr'"
    }));
  });

  it('handles ArrowUp and ArrowDown history navigation', async () => {
    const { result, rerender } = setup();

    await act(async () => {
      mockCrOptions.input = '/cmd 1';
      await result.current.handleSubmit({ preventDefault: vi.fn() } as any);
    });
    rerender();

    await act(async () => {
      mockCrOptions.input = '/cmd 2';
      await result.current.handleSubmit({ preventDefault: vi.fn() } as any);
    });
    rerender();

    // ArrowUp 1 -> /cmd 2
    await act(async () => {
      const event = { key: 'ArrowUp', preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLInputElement>;
      result.current.handleKeyDown(event);
    });
    expect(mockCrOptions.setInput).toHaveBeenCalledWith('/cmd 2');

    // ArrowUp 2 -> /cmd 1
    await act(async () => {
      const event = { key: 'ArrowUp', preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLInputElement>;
      result.current.handleKeyDown(event);
    });
    expect(mockCrOptions.setInput).toHaveBeenCalledWith('/cmd 1');

    // ArrowUp 3 -> saturates at /cmd 1
    await act(async () => {
      const event = { key: 'ArrowUp', preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLInputElement>;
      result.current.handleKeyDown(event);
    });

    // ArrowDown 1 -> /cmd 2
    await act(async () => {
      const event = { key: 'ArrowDown', preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLInputElement>;
      result.current.handleKeyDown(event);
    });
    expect(mockCrOptions.setInput).toHaveBeenCalledWith('/cmd 2');

    // ArrowDown 2 -> clear
    await act(async () => {
      const event = { key: 'ArrowDown', preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLInputElement>;
      result.current.handleKeyDown(event);
    });
    expect(mockCrOptions.setInput).toHaveBeenCalledWith('');
  });

  it('handles /model use', async () => {
    mockCrOptions.input = '/model use pro';
    const { result } = setup();
    const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;

    await act(async () => {
      await result.current.handleSubmit(mockEvent);
    });

    expect(mockCrOptions.setSelectedModel).toHaveBeenCalledWith('pro');
    expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: Switched model to pro' }));
  });

  it('handles /gem use', async () => {
    mockCrOptions.input = '/gem use my-gem';
    const { result } = setup();
    const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;

    await act(async () => {
      await result.current.handleSubmit(mockEvent);
    });

    expect(mockCrOptions.handleSelectGem).toHaveBeenCalledWith('my-gem');
    expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: Switched gem to my-gem' }));
  });

  it('handles /gem ls', async () => {
    mockCrOptions.input = '/gem ls';
    const { result } = setup();
    const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;

    await act(async () => {
      await result.current.handleSubmit(mockEvent);
    });

    expect(mockCrOptions.setIsGemSidebarOpen).toHaveBeenCalledWith(true);
    expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: Opened gems list.' }));
  });

  it('handles /attach', async () => {
    mockCrOptions.input = '/attach file.json';
    const { result } = setup();
    await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
    expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: Attached file: file.json' }));
  });

  it('handles /context drop', async () => {
    mockCrOptions.input = '/context drop file.json';
    const { result } = setup();
    await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
    expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: Dropped context for: file.json' }));
  });

  it('handles /key set', async () => {
    mockCrOptions.input = '/key set test-key';
    const { result } = setup();
    await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
    expect(mockCrOptions.handleSetApiKey).toHaveBeenCalledWith('test-key');
    expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: API key set successfully.' }));
  });

  it('handles /key set missing arg', async () => {
    mockCrOptions.input = '/key set';
    const { result } = setup();
    await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
    expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: Please provide an API key.' }));
  });

  it('handles /key clear', async () => {
    mockCrOptions.input = '/key clear';
    const { result } = setup();
    await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
    expect(mockCrOptions.handleClearApiKey).toHaveBeenCalled();
    expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: API key cleared.' }));
  });

  describe('graph commands', () => {
    beforeEach(() => {
      mockCrOptions.activeState = {
        semanticNodes: [
          { id: 'n1', label: 'Node 1', weight: 5 },
          { id: 'n2', label: 'Auth Node', weight: 8 },
        ],
        semanticEdges: [
          { source: 'n1', target: 'n2', label: 'depends' }
        ]
      };
    });

    it('handles /graph stats', async () => {
      mockCrOptions.input = '/graph stats';
      const { result } = setup();
      await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: expect.stringContaining('Graph Stats:\nNodes: 2\nEdges: 1') }));
    });

    it('handles /graph stats with no state', async () => {
      mockCrOptions.activeState = null;
      mockCrOptions.input = '/graph stats';
      const { result } = setup();
      await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: No semantic graph generated for this session yet.' }));
    });

    it('handles /graph ls', async () => {
      mockCrOptions.input = '/graph ls';
      const { result } = setup();
      await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: expect.stringContaining('- n1 (Node 1)') }));
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: expect.stringContaining('- n2 (Auth Node)') }));
    });

    it('handles /graph ls with filter', async () => {
      mockCrOptions.input = '/graph ls auth';
      const { result } = setup();
      await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: expect.stringContaining("Semantic Nodes (filtered by 'auth'):") }));
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: expect.stringContaining('- n2 (Auth Node)') }));
    });

    it('handles /graph ls with no state', async () => {
      mockCrOptions.activeState = null;
      mockCrOptions.input = '/graph ls';
      const { result } = setup();
      await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: No semantic graph generated for this session yet.' }));
    });

    it('handles /graph search', async () => {
      mockCrOptions.input = '/graph search auth';
      const { result } = setup();
      await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: expect.stringContaining("Search Results for 'auth'") }));
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: expect.stringContaining('- n2 (Auth Node)') }));
    });

    it('handles /graph search requiring query', async () => {
      mockCrOptions.input = '/graph search';
      const { result } = setup();
      await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: Please provide a search query.' }));
    });

    it('handles /graph describe', async () => {
      mockCrOptions.input = '/graph describe n1';
      const { result } = setup();
      await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: expect.stringContaining('Node Description:\\nID: n1\\nLabel: Node 1\\nWeight: 5') }));
    });

    it('handles /graph describe not found', async () => {
      mockCrOptions.input = '/graph describe unknown';
      const { result } = setup();
      await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: Node \'unknown\' not found.' }));
    });

    it('handles /graph neighbors', async () => {
      mockCrOptions.input = '/graph neighbors n1';
      const { result } = setup();
      await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: expect.stringContaining("Neighbors of 'n1':\\n[n1] --(depends)--> [n2]") }));
    });

    it('handles /graph neighbors with no edges found', async () => {
      mockCrOptions.input = '/graph neighbors unknown_node';
      const { result } = setup();
      await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: No neighbors found for \'unknown_node\'.' }));
    });

    it('handles /graph dependants', async () => {
      mockCrOptions.input = '/graph dependants n2';
      const { result } = setup();
      await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: expect.stringContaining("Dependants of 'n2':\\n[n1] --(depends)--> [n2]") }));
    });

    it('handles /graph not implemented commands', async () => {
      mockCrOptions.input = '/graph path a b';
      const { result } = setup();
      await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: Command not yet fully implemented for terminal rendering: GRAPH_PATH' }));
    });

    it('handles /graph cluster', async () => {
      mockCrOptions.input = '/graph cluster a';
      const { result } = setup();
      await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: Command not yet fully implemented for terminal rendering: GRAPH_CLUSTER' }));
    });
  });

  describe('toggle commands', () => {
    it('handles /search on, off, and toggle', async () => {
      mockCrOptions.isSearchEnabled = false;
      mockCrOptions.setIsSearchEnabled = vi.fn();
      
      const { result, rerender } = setup();

      await act(async () => {
        mockCrOptions.input = '/search on';
        await result.current.handleSubmit({ preventDefault: vi.fn() } as any);
      });
      expect(mockCrOptions.setIsSearchEnabled).toHaveBeenCalledWith(true);
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: Google Search Grounding has been ENABLED for new messages.' }));
      
      rerender();
      await act(async () => {
        mockCrOptions.input = '/search off';
        await result.current.handleSubmit({ preventDefault: vi.fn() } as any);
      });
      expect(mockCrOptions.setIsSearchEnabled).toHaveBeenCalledWith(false);
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: Google Search Grounding has been DISABLED.' }));

      rerender();
      await act(async () => {
        mockCrOptions.input = '/search';
        await result.current.handleSubmit({ preventDefault: vi.fn() } as any);
      });
      expect(mockCrOptions.setIsSearchEnabled).toHaveBeenCalledWith(true); // Because !false === true
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: Google Search Grounding is now ENABLED.' }));
    });

    it('handles /system on, off, and toggle', async () => {
      mockCrOptions.showSystemMessages = false;
      mockCrOptions.setShowSystemMessages = vi.fn();
      
      const { result, rerender } = setup();

      await act(async () => {
        mockCrOptions.input = '/system on';
        await result.current.handleSubmit({ preventDefault: vi.fn() } as any);
      });
      expect(mockCrOptions.setShowSystemMessages).toHaveBeenCalledWith(true);
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: System message visibility has been ENABLED.' }));
      
      rerender();
      await act(async () => {
        mockCrOptions.input = '/system off';
        await result.current.handleSubmit({ preventDefault: vi.fn() } as any);
      });
      expect(mockCrOptions.setShowSystemMessages).toHaveBeenCalledWith(false);
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: System message visibility has been DISABLED.' }));

      rerender();
      await act(async () => {
        mockCrOptions.input = '/system';
        await result.current.handleSubmit({ preventDefault: vi.fn() } as any);
      });
      expect(mockCrOptions.setShowSystemMessages).toHaveBeenCalledWith(true);
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: System message visibility is now ENABLED.' }));
  });

  describe('handleKeyDown coverage', () => {
    it('autocompletes mention on space', () => {
        mockCrOptions.mentionSearchQuery = 'auth';
        mockCrOptions.mentionSuggestions = [{ name: 'AuthNode', label: 'auth node' }] as any;
        
        const { result } = setup();
        
        const mockEvent = { key: ' ', preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLInputElement>;
        act(() => {
          result.current.handleKeyDown(mockEvent);
        });
    
        expect(mockEvent.preventDefault).toHaveBeenCalled();
        expect(mockCrOptions.handleMentionSelect).toHaveBeenCalledWith('AuthNode', undefined, undefined);
    });
  });

  describe('graph search with regex', () => {
    it('handles /graph search with regex', async () => {
      mockCrOptions.activeState = { 
        dissonanceScore: 0, 
        dissonanceReason: '', 
        semanticNodes: [{ id: '1', label: 'AuthNode' }, { id: '2', label: 'other' }], 
        semanticEdges: [] 
      };
      mockCrOptions.input = '/graph search /auth/i';
      
      const { result } = setup();
      await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
      
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({
        content: expect.stringContaining('AuthNode')
      }));
    });

    it('handles /graph search with invalid regex', async () => {
      mockCrOptions.activeState = { 
        dissonanceScore: 0, 
        dissonanceReason: '', 
        semanticNodes: [{ id: '1', label: 'AuthNode' }], 
        semanticEdges: [] 
      };
      mockCrOptions.input = '/graph search /[unclosed/i';
      
      const { result } = setup();
      await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
      
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({
        content: expect.stringContaining('None found')
      }));
    });
  });

  it('handles UNKNOWN commands', async () => {
    mockCrOptions.input = '/fakecommand';
    const { result } = setup();
    await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
    expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: Unknown command: /fakecommand' }));
  });

  it('handles execution errors', async () => {
    mockCrOptions.input = '/session new';
    mockCrOptions.startNewSession.mockImplementation(() => { throw new Error('Test Error'); });
    const { result } = setup();
    await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
    expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: Error executing command: Test Error' }));
  });

  describe('git sync commands', () => {
    beforeEach(async () => {
      mockCrOptions.ensureActiveSession = vi.fn().mockReturnValue('session-123');
      await import('@cr/backend');
      vi.clearAllMocks();
      
      // Default to having commits so it just pushes
      mockGitContextManager.hasCommits.mockResolvedValue(true);
      mockGitContextManager.hasGlobalCommits.mockResolvedValue(true);
    });

    it('handles /sync', async () => {
      mockCrOptions.input = '/sync';
      const { result } = setup();
      await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: Model 2: Local push has been replaced by automatic background Event Sourcing Sync daemon.' }));
    });

    it('handles /sync when repo is empty', async () => {
      mockGitContextManager.hasCommits.mockResolvedValue(false);
      
      mockCrOptions.input = '/sync';
      const { result } = setup();
      await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: Model 2: Local push has been replaced by automatic background Event Sourcing Sync daemon.' }));
    });

    it('handles /git pull', async () => {
      mockCrOptions.input = '/git pull';
      const { result } = setup();
      await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: Model 2: Local pull has been replaced by automatic background Event Sourcing Sync daemon.' }));
    });

    it('handles /global sync', async () => {
      mockCrOptions.input = '/global sync';
      const { result } = setup();
      await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: Model 2: Global repository sync has been replaced by automatic background Event Sourcing Sync daemon.' }));
    });

    it('handles /global edit', async () => {
      mockCrOptions.input = '/global edit test.md';
      const { result } = setup();
      await act(async () => { await result.current.handleSubmit({ preventDefault: vi.fn() } as any); });
      
      expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: Please toggle the "Global Workspace" tab in the Artifact Editor to edit: test.md' }));
    });
  });
});
});
