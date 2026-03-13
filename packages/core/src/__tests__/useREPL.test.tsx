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
      setIsHistorySidebarOpen: vi.fn(),
      setSelectedModel: vi.fn(),
      handleSelectGem: vi.fn(),
      setIsGemSidebarOpen: vi.fn(),
      handleSetApiKey: vi.fn(),
      handleClearApiKey: vi.fn(),
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
    expect(mockCrOptions.messages).toContainEqual(expect.objectContaining({ content: '[System]: Fuzzy matched session: My Auth Setup' }));
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

    // First Ctrl+R
    await act(async () => {
      mockCrOptions.input = 'gr';
      const event = { ctrlKey: true, key: 'r', preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLInputElement>;
      result.current.handleKeyDown(event);
    });
    rerender();

    expect(mockCrOptions.setInput).toHaveBeenCalledWith('/graph search [System]');
    
    // Simulate natural input mutation bounds 
    mockCrOptions.input = '/graph search [System]';

    // Second Ctrl+R
    await act(async () => {
      const event = { ctrlKey: true, key: 'r', preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLInputElement>;
      result.current.handleKeyDown(event);
    });
    rerender();
    
    expect(mockCrOptions.setInput).toHaveBeenCalledWith('/graph ls');
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
});
