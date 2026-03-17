import React, { useState, useRef, useEffect } from 'react';
import { Type } from '@google/genai';
import { Capacitor } from '@capacitor/core';
import type { Node, Edge } from '@cr/ui';
import { saveApiKey, loadApiKey, clearApiKey, downloadJSON, shareJSON, type SessionRecord } from '@cr/backend';
import { useCognitivePlatform } from '../providers/CognitivePlatformContext';
import { initGemini, generateResponse, fetchModels } from '../services/GeminiService';
import { searchHistory } from '../services/SearchService';
import { GitContextManager } from '../services/GitContextManager';
import { useMultiplayerSync } from './useMultiplayerSync';
import { globalBackendConfig } from '@cr/backend';
import Fuse from 'fuse.js';

export const responseSchema = {
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING, description: "The conversational reply to the user." },
    dissonanceScore: { type: Type.NUMBER, description: "Cognitive dissonance score (0-100). 0 = absolute certainty, 100 = complete contradiction/confusion." },
    dissonanceReason: { type: Type.STRING, description: "Brief explanation of the current dissonance score." },
    semanticNodes: {
      type: Type.ARRAY, items: {
        type: Type.OBJECT, properties: {
          id: { type: Type.STRING }, label: { type: Type.STRING }, weight: { type: Type.NUMBER, description: "1-10" }
        }
      }
    },
    semanticEdges: {
      type: Type.ARRAY, items: {
        type: Type.OBJECT, properties: {
          source: { type: Type.STRING }, target: { type: Type.STRING }, label: { type: Type.STRING }
        }
      }
    },
  },
  required: ["reply", "dissonanceScore", "dissonanceReason", "semanticNodes", "semanticEdges"]
};

export interface InternalState {
  dissonanceScore: number;
  dissonanceReason: string;
  semanticNodes: Node[];
  semanticEdges: Edge[];
  tokenUsage?: {
    totalTokenCount?: number;
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

export interface GemProfile {
  id: string; name: string; model: string; systemPrompt: string; isBuiltIn?: boolean;
}

export const BUILT_IN_GEMS: GemProfile[] = [
  { id: 'gem-general', name: 'General Chat', model: 'gemini-2.5-flash', systemPrompt: 'You are a helpful AI assistant.', isBuiltIn: true },
  {
    id: 'gem-coder', name: 'System Coder', model: 'gemini-2.5-pro', isBuiltIn: true,
    systemPrompt: `You are a coding assistant specialized in macOS and Linux environments. Your output must be optimized for a "Pipe to Shell" workflow.\n\n### 1. Initialization & Communication Protocol\n* **Session Start:** On the very first response, **you must** print the Protocol Keys and the Copy instructions:\n  > \`🔑 Protocol Keys: [ ask-mode | code-mode ]\`\n  > \`💡 Protocol: Copy 🚀 scripts -> Run 'pbpaste | bash' (Mac) or 'cat | bash' (Linux)\`\n* **Default State:** You start in **\`ASK-MODE\`**.\n  * **\`ASK-MODE\`:** We are just discussing. Do **NOT** generate code or scripts.\n  * **\`CODE-MODE\`:** You are authorized to generate code and pipe-to-shell scripts.\n  * **Triggers:** The user will switch modes by typing \`ask-mode\` or \`code-mode\`.`
  },
  {
    id: 'gem-rubber-duck', name: "Rubber Duck (Coder's Shrink)", model: 'gemini-2.5-flash', isBuiltIn: true,
    systemPrompt: `Act as a specialist therapist for software engineers. Your therapeutic style is 'Humorous Systems Analysis.' You believe that every psychological issue is just a bug in the production environment of life.\n\nYour Core Directives:\nUse Tech Metaphors: Treat childhood trauma as 'Legacy Code,' anxiety as a 'DDoS attack on the prefrontal cortex,' and boundaries as 'API Permissions.'\nThe Tone: Dry, witty, and slightly cynical—like a Senior Dev who has seen too many failed sprints but still cares about the junior devs.\nThe Methodology: Use 'Refactoring' instead of 'Self-Improvement.' If I describe a problem, help me identify the 'breaking change' or the 'infinite loop' in my logic.\nThe Goal: Validate my feelings through humor, then provide a 'patch' (actionable advice).`
  }
];

export interface Message {
  role: 'user' | 'model' | 'peer'; content: string; internalState?: InternalState; modelTurnIndex?: number; isError?: boolean; senderId?: string; senderName?: string;
}

export interface AttachedFile {
  id: string; name: string; mimeType: string; preview?: string; file?: File;
}

export function useCognitiveResonance() {
  const { storage, auth, user } = useCognitivePlatform();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSearchEnabled, setIsSearchEnabled] = useState(false);
  const [showSystemMessages, setShowSystemMessages] = useState(true);
  const [selectedTurnIndex, setSelectedTurnIndex] = useState<number | null>(null);

  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isHistorySidebarOpen, setIsHistorySidebarOpenRaw] = useState(false);
  const setIsHistorySidebarOpen = (open: boolean) => {
    if (open) storage.loadAllSessions().then(setSessions);
    setIsHistorySidebarOpenRaw(open);
  };
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [activeSidebarTab, setActiveSidebarTab] = useState<'history' | 'search'>('history');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [targetTurnIndex, setTargetTurnIndex] = useState<number | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editSessionName, setEditSessionName] = useState('');
  const [markerViewMode, setMarkerViewMode] = useState<'graph' | 'list' | 'artifact'>('graph');
  const [artifactContent, setArtifactContent] = useState('# Artifact context\n\nEdit this virtual file to persist changes into the local isomorphic-git repository.\nThe AI will automatically see your saved changes in its context window before every prompt.');
  const [markerSearchQuery, setMarkerSearchQuery] = useState('');
  const [mentionSearchQuery, setMentionSearchQuery] = useState<string | null>(null);
  const [mentionContext, setMentionContext] = useState<'peer' | 'gem' | 'turn' | 'dsl' | 'semantic' | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<any[]>([]);
  const [cursorPosition, setCursorPosition] = useState<number | null>(null);

  const [isDissonancePanelOpen, setIsDissonancePanelOpen] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isGemSidebarOpen, setIsGemSidebarOpen] = useState(false);

  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const chatModels = availableModels.filter(m => (m.name || '').includes('gemini-') || (m.displayName || '').includes('Gemini'));

  const [savedGems, setSavedGems] = useState<GemProfile[]>(BUILT_IN_GEMS);
  const [defaultGemId, setDefaultGemId] = useState<string>('gem-general');
  const [activeGemId, setActiveGemId] = useState<string>('gem-general');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash');
  const [sessionSystemPrompt, setSessionSystemPrompt] = useState<string>(BUILT_IN_GEMS[0].systemPrompt);

  const [editingGem, setEditingGem] = useState<GemProfile | null>(null);
  const [creatingGem, setCreatingGem] = useState(false);
  const [draftGem, setDraftGem] = useState<{name: string, model: string, systemPrompt: string}>({name: '', model: 'gemini-2.5-flash', systemPrompt: ''});

  const [isViewMode, setIsViewMode] = useState(false);
  const [historyFilename, setHistoryFilename] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

  // API Key state
  const [apiKey, setApiKeyState] = useState<string | null>(loadApiKey());
  const [showApiKeyModal, setShowApiKeyModal] = useState(!loadApiKey());
  const [apiKeyInput, setApiKeyInput] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  useEffect(() => {
    if (!isLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoading]);

  const wsUrl = globalBackendConfig.gitRemoteUrl || (typeof window !== 'undefined' ? window.location.host : '');
  const ws = useMultiplayerSync({
    workerUrl: wsUrl,
    sessionId: activeSessionId || '',
    token: auth.getToken?.() || undefined,
    userName: user?.name
  });

  const lastProcessedMessageIdx = useRef(0);

  useEffect(() => {
    if (ws.messages.length > lastProcessedMessageIdx.current) {
      const newMessages = ws.messages.slice(lastProcessedMessageIdx.current);
      lastProcessedMessageIdx.current = ws.messages.length;

      const incomingChats = newMessages
        .filter(m => m.type === 'chat' && m.senderId !== 'me')
        .map(m => ({
          role: m.payload.role === 'model' ? 'model' : 'peer',
          content: m.payload.content,
          senderId: m.senderId,
          senderName: m.payload.senderName,
          ...(m.payload.internalState ? { internalState: m.payload.internalState } : {})
        } as Message));

      if (incomingChats.length > 0) {
        setMessages(prev => {
           let modelCount = prev.filter(m => m.role === 'model').length;
           return [...prev, ...incomingChats.map(m => {
              if (m.role === 'model') {
                 return { ...m, modelTurnIndex: modelCount++ };
              }
              return m;
           })];
        });
      }
    }
  }, [ws.messages]);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  // Scroll effect
  useEffect(() => {
    if (targetTurnIndex !== null && targetTurnIndex >= 0 && targetTurnIndex < messages.length) {
      const element = document.getElementById(`message-${targetTurnIndex}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('bg-indigo-900/40', 'transition-colors', 'duration-500');
        setTimeout(() => { element.classList.remove('bg-indigo-900/40'); setTargetTurnIndex(null); }, 2000);
      }
    } else if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, targetTurnIndex]);

  // Load latest file state from VFS when session loads
  useEffect(() => {
    if (activeSessionId) {
       import('../services/GitContextManager').then(({ vfs }) => {
          vfs.promises.readFile(`/${activeSessionId}/VirtualContext.md`, 'utf8')
            .then(content => {
               const str = typeof content === 'string' ? content : new TextDecoder().decode(content);
               if (str) setArtifactContent(str);
            })
            .catch(() => {});
       });
    }
  }, [activeSessionId]);

  // Auto-save
  useEffect(() => {
    if (messages.length > 0 && !isViewMode) {
      const data = {
        timestamp: new Date().toISOString(),
        config: { model: selectedModel, systemPrompt: sessionSystemPrompt, gemId: activeGemId },
        messages: messages.map(msg => ({ role: msg.role, content: msg.content, ...(msg.internalState ? { internalState: msg.internalState } : {}) }))
      };
      storage.saveSession(activeSessionId || '', data).then((id: string) => {
        if (!activeSessionId) setActiveSessionId(id);
        // Refresh sessions list so sidebar stays in sync
        storage.loadAllSessions().then(setSessions);
      });
    }
  }, [messages, selectedModel, sessionSystemPrompt, activeGemId, isViewMode, activeSessionId, storage]);

  // Initialize on mount
  useEffect(() => {
    if (!apiKey) return;
    initGemini(apiKey);
    // Load gems
    storage.loadGemsConfig().then((config) => {
      const { gems = [], defaultGemId: defId = 'gem-general' } = config || {};
      const finalGems = [...BUILT_IN_GEMS, ...gems.filter((g: any) => !g.isBuiltIn)];
      setSavedGems(finalGems);
      setDefaultGemId(defId);
      const defGem = finalGems.find(g => g.id === defId);
      if (defGem) { setActiveGemId(defGem.id); setSelectedModel(defGem.model); setSessionSystemPrompt(defGem.systemPrompt); }
    });
    // Load sessions
    storage.loadAllSessions().then(setSessions);
    // Fetch models
    fetchModels().then(setAvailableModels).catch((err: any) => console.error('Failed to fetch models:', err));
  }, [apiKey, storage]);

  // Search debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (historySearchQuery.trim()) {
        searchHistory(historySearchQuery, storage).then(setSearchResults);
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [historySearchQuery]);

  const handleSetApiKey = (key?: string | React.MouseEvent | React.FormEvent) => {
    const keyToSave = (typeof key === 'string' ? key : apiKeyInput).trim();
    if (!keyToSave) return;
    saveApiKey(keyToSave);
    setApiKeyState(keyToSave);
    setShowApiKeyModal(false);
    setApiKeyInput('');
  };

  const handleClearApiKey = () => {
    clearApiKey();
    setApiKeyState(null);
    setShowApiKeyModal(true);
  };

  // Computed values
  const modelMessages = messages.filter(m => m.role === 'model' && !m.content.startsWith('[System]:'));
  const latestTurnIndex = modelMessages.length > 0 ? modelMessages.length - 1 : -1;
  const activeTurnIndex = selectedTurnIndex !== null ? selectedTurnIndex : latestTurnIndex;
  const activeState = activeTurnIndex >= 0 ? modelMessages[activeTurnIndex]?.internalState : null;
  const isViewingHistory = selectedTurnIndex !== null && selectedTurnIndex !== latestTurnIndex;

  const historyData = modelMessages.map((msg, idx) => ({ turn: idx + 1, score: msg.internalState?.dissonanceScore ?? 0 }));

  const handleSelectGem = (gemId: string) => {
    setActiveGemId(gemId);
    const gem = savedGems.find(g => g.id === gemId);
    if (gem) { setSelectedModel(gem.model); setSessionSystemPrompt(gem.systemPrompt); }
    setIsGemSidebarOpen(false);
  };

  const handleSaveGem = (gemProfile: GemProfile) => {
    const isNew = !savedGems.find(g => g.id === gemProfile.id);
    let updatedGems = isNew ? [...savedGems, gemProfile] : savedGems.map(g => g.id === gemProfile.id ? gemProfile : g);
    setSavedGems(updatedGems);
    storage.saveGemsConfig({ gems: updatedGems.filter(g => !g.isBuiltIn), defaultGemId });
    if (activeGemId === gemProfile.id || isNew) handleSelectGem(gemProfile.id);
    setEditingGem(null); setCreatingGem(false); setIsGemSidebarOpen(false);
  };

  const handleDeleteGem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedGems = savedGems.filter(g => g.id !== id);
    setSavedGems(updatedGems);
    const newDefaultId = defaultGemId === id ? 'gem-general' : defaultGemId;
    if (defaultGemId === id) setDefaultGemId(newDefaultId);
    storage.saveGemsConfig({ gems: updatedGems.filter(g => !g.isBuiltIn), defaultGemId: newDefaultId });
    if (activeGemId === id) handleSelectGem(newDefaultId);
  };

  const handleSetDefaultGem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDefaultGemId(id);
    storage.saveGemsConfig({ gems: savedGems.filter(g => !g.isBuiltIn), defaultGemId: id });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    const cursor = e.target.selectionStart || 0;
    setCursorPosition(cursor);

    // Extract the word currently being typed (up to the cursor)
    const textBeforeCursor = val.slice(0, cursor);
    const words = textBeforeCursor.split(/\s/);
    const targetWord = words[words.length - 1];

    if (!targetWord || (!targetWord.startsWith('@') && !targetWord.startsWith('#') && !targetWord.startsWith('('))) {
      setMentionSearchQuery(null);
      setMentionContext(null);
      return;
    }

    // AST CLI Parser Regex for Autocomplete context
    // Matches: @[peer]:[gem]#[turn](dsl)
    // Or standalone: #[turn] or (dsl)
    const astRegex = /^(?:@([a-zA-Z0-9_\-]*)(?::([a-zA-Z0-9_\-]*))?)?(?:#(\d*))?(?:\(([^)]*)\))?$/;
    const match = targetWord.match(astRegex);

    if (match) {
       const [, peerRaw, gemRaw, turnRaw, dslRaw] = match;

       if (dslRaw !== undefined || targetWord.startsWith('(')) {
          setMentionContext('dsl');
          setMentionSearchQuery(dslRaw || '');
       } else if (turnRaw !== undefined || targetWord.startsWith('#')) {
          setMentionContext('turn');
          setMentionSearchQuery(turnRaw || '');
       } else if (gemRaw !== undefined || targetWord.includes(':')) {
          setMentionContext('gem');
          setMentionSearchQuery(gemRaw || '');
       } else if (peerRaw !== undefined || targetWord.startsWith('@')) {
          setMentionContext('peer');
          setMentionSearchQuery(peerRaw || '');
       } else {
          setMentionSearchQuery(null);
          setMentionContext(null);
       }
    } else {
       // Fallback for raw semantic markers if needed
       setMentionSearchQuery(targetWord.slice(1));
       setMentionContext('semantic');
    }
  };

  // Perform fuzzy search whenever mentionSearchQuery or context changes
  useEffect(() => {
    if (mentionSearchQuery === null || mentionContext === null) {
      setMentionSuggestions(prev => prev.length > 0 ? [] : prev);
      return;
    }
    
    let candidates: any[] = [];

    if (mentionContext === 'gem') {
       candidates = savedGems.map((g: any) => ({ name: g.name.replace(/\s+/g, ''), id: g.id, type: 'gem', description: g.model }));
    } else if (mentionContext === 'peer') {
       candidates = Object.values(ws.activeUsers || {}).map((u: any) => ({ name: (u.userName || u.userId || 'Peer').replace(/\s+/g, ''), id: u.sessionId, type: 'peer', description: 'Active User' }));
       // Add local user as self-reference
       if (user?.name) candidates.unshift({ name: user.name.replace(/\s+/g, ''), id: user.id || 'local', type: 'peer', description: 'Local Client' });
       // Also include semantic markers in the @ context
       const markers = Array.from(markerCounts.entries()).map(([name, count]) => ({ name, type: 'semantic', count, description: 'Semantic Marker' })).sort((a, b) => (b.count || 0) - (a.count || 0));
       candidates.push(...markers);
    } else if (mentionContext === 'turn') {
       // Reverse order so latest turns show up top, limit to last 20 for autocomplete
       const recentTurns = [...messages].reverse().slice(0, 20);
       candidates = recentTurns.map((m, idx) => ({ 
          name: `${messages.length - idx}`, 
          type: 'turn', 
          description: m.content,
          raw: m.content 
       }));
    } else if (mentionContext === 'dsl') {
       candidates = [
          { name: 'get-context', type: 'dsl', description: '(get-context :from n :to m)', raw: '(get-context :from  :to )' },
          { name: 'turn', type: 'dsl', description: '(turn n)', raw: '(turn )' },
          { name: 'get-markers', type: 'dsl', description: '(get-markers target)', raw: '(get-markers )' },
          { name: 'request', type: 'dsl', description: "(request 'actor :input)", raw: "(request ' :input )" },
          { name: 'fork-chat', type: 'dsl', description: '(fork-chat :at-turn n)', raw: '(fork-chat :at-turn )' }
       ];
    } else if (mentionContext === 'semantic') {
       candidates = Array.from(markerCounts.entries()).map(([name, count]) => ({ name, type: 'semantic', count, description: 'Semantic Marker' })).sort((a, b) => (b.count || 0) - (a.count || 0));
    }

    if (!mentionSearchQuery) {
       // If query is empty, show all candidates for that context top ranked
       setMentionSuggestions(candidates);
       return;
    }
    
    // Use Fuse to search and maintain rank weight
    const fuse = new Fuse(candidates, { keys: ['name'], threshold: 0.4 });
    const results = fuse.search(mentionSearchQuery)
                        .map(r => r.item);
    setMentionSuggestions(results);
  }, [mentionSearchQuery, mentionContext, messages, savedGems, ws.activeUsers]);

  const handleMentionSelect = (markerLabel: string, rawInsert?: string, mentionType?: string) => {
    if (cursorPosition === null) return;
    
    const textBeforeCursor = input.slice(0, cursorPosition);
    const textAfterCursor = input.slice(cursorPosition);
    
    // Find the @word we are replacing
    const words = textBeforeCursor.split(/\s/);
    const targetWord = words[words.length - 1];
    if (!targetWord) return;

    const newTextBeforeWord = textBeforeCursor.slice(0, -targetWord.length);
    let replacement = targetWord;

    if (mentionContext === 'dsl') {
       replacement = rawInsert || `(${markerLabel})`;
    } else if (mentionType === 'semantic') {
       replacement = `@${markerLabel} `;
    } else {
       // AST Replacement: @peer:gem#turn
       const astRegex = /^(?:@([a-zA-Z0-9_\-]*)(?::([a-zA-Z0-9_\-]*))?)?(?:#(\d*))?$/;
       const match = targetWord.match(astRegex);
       if (match) {
          const [, peerRaw, gemRaw, turnRaw] = match;
          if (mentionContext === 'peer') {
             replacement = `@${markerLabel}${gemRaw !== undefined ? ':' + gemRaw : ''}${turnRaw !== undefined ? '#' + turnRaw : ''}`;
             // Auto-append colon if they just selected a peer, to prompt for gem
             if (gemRaw === undefined && turnRaw === undefined) replacement += ':';
          } else if (mentionContext === 'gem') {
             replacement = `${peerRaw !== undefined ? '@' + peerRaw : ''}:${markerLabel}${turnRaw !== undefined ? '#' + turnRaw : ''}`;
             if (turnRaw === undefined) replacement += '#';
          } else if (mentionContext === 'turn') {
             replacement = `${peerRaw !== undefined ? '@' + peerRaw : ''}${gemRaw !== undefined ? ':' + gemRaw : ''}#${markerLabel} `;
          }
       } else {
          // Fallback
          replacement = targetWord + markerLabel + ' ';
       }
    }

    const newInput = newTextBeforeWord + replacement + textAfterCursor;
    setInput(newInput);
    setMentionSearchQuery(null);
    setMentionContext(null);
    setMentionSuggestions([]);
    
    // Force focus back to input and set cursor (handled by React state rendering ideally)
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) {
       return;
    }
    if (!selectedModel || !chatModels.find(m => m.name.replace('models/', '') === selectedModel.replace('models/', ''))) {
      setMessages([...messages, { role: 'user', content: input }, { role: 'model', content: 'Invalid model selected. Please choose a compliant gemini- chat model.', isError: true }]);
      return;
    }
    
    setMentionSearchQuery(null);
    setMentionSuggestions([]);
    const rawUserMessage = input.trim();
    setInput('');
    
    // Add the un-modified message to the visible UI history
    const userMsg: Message = { role: 'user', content: rawUserMessage, senderId: user?.id, senderName: user?.name };
    const newMessages: Message[] = [...messages, userMsg];
    setMessages(newMessages);
    setIsLoading(true);
    setSelectedTurnIndex(null);
    abortControllerRef.current = new AbortController();

    if (ws.isConnected && activeSessionId) {
      ws.sendChatMessage(rawUserMessage, { role: 'user', senderName: user?.name });
    }

    // Prompt Interception: Modular Mention Syntax parser
    // Syntax: @[participant](:[gem])?(#[turn])?(\(dsl\))?
    let payloadMessageContent = rawUserMessage;
    const mentionRegex = /@([a-zA-Z0-9_\-]+)(?::([a-zA-Z0-9_\-]*))?(?:#(\d*))?(?:\(([^)]*)\))?/g;
    const matches = Array.from(rawUserMessage.matchAll(mentionRegex));
    
    // Evaluate explicit wakes based on the new rules
    let hasExplicitWake = false;
    let targetModel = selectedModel;
    let targetSystemPrompt = sessionSystemPrompt;

    for (const match of matches) {
      const [, participant, aiDelegator] = match;
      
      const isTargetingMe = participant.toLowerCase() === 'you' || participant === user?.name?.replace(/\s+/g, '');
      const isDelegatingToAI = aiDelegator !== undefined; 

      if (isTargetingMe && isDelegatingToAI) {
         hasExplicitWake = true;
         // Did they specify an AI? (e.g., @you:SystemCoder). If empty (e.g., @you:), use default.
         if (aiDelegator.trim() !== '') {
            const specificGem = savedGems.find(g => g.name.replace(/\s+/g, '').toLowerCase() === aiDelegator.toLowerCase());
            if (specificGem) {
               targetModel = specificGem.model;
               targetSystemPrompt = specificGem.systemPrompt;
            }
         }
      }
    }

    const isMultiActor = Object.keys(ws.activeUsers || {}).length > 1;

    // Explicit Waking Pattern:
    // If we're in a multi-actor room and the user hasn't explicitly mentioned an AI Gem (via :), 
    // the AI doesn't generate a response (acts as Silent Observer).
    if (isMultiActor && !hasExplicitWake) {
        setIsLoading(false);
        abortControllerRef.current = null;
        return;
    }

    let actualModel = targetModel;
    let actualSystemPrompt = targetSystemPrompt;

    if (isMultiActor && hasExplicitWake) {
        payloadMessageContent += `\n\n<system_directive>\nYou are operating in a Multi-Actor Room with several human participants. Analyze the preceding unprompted human messages contextually, and synthesize your answer based on the whole group debate rather than just this single prompt.\n</system_directive>`;
    }

    // Extract Context Turn References
    let contextTurns: Message[] = [];
    for (const match of matches) {
      const turnRef = match[3];
      if (turnRef && turnRef.trim() !== '') {
         const idx = parseInt(turnRef, 10);
         // Find message in visible history (1-indexed for user, so idx-1)
         if (!isNaN(idx) && idx > 0 && idx <= messages.length) {
            contextTurns.push(messages[idx - 1]);
         }
      }
    }

    if (contextTurns.length > 0) {
       payloadMessageContent += `\n\n<referenced_context>\n`;
       contextTurns.forEach((m) => {
          payloadMessageContent += `[Turn Reference]: ${m.role === 'user' ? (m.senderName || 'Peer') : 'AI'}: ${m.content}\n`;
       });
       payloadMessageContent += `</referenced_context>\n`;
    }

    const matchedMarkers: Set<string> = new Set();
    
    if (matches.length > 0 && allMarkersList.length > 0) {
      matches.forEach(match => {
        const query = match[1].toLowerCase();
        // Check if query exactly matches a known node label or ID
        const hit = allMarkersList.find(n => 
          (n.label && n.label.toLowerCase() === query) || 
          n.id.toLowerCase() === query
        );
        if (hit) {
          matchedMarkers.add(`${hit.label || hit.id} (Weight: ${hit.weight || 1})`);
        }
      });
      
      if (matchedMarkers.size > 0) {
        payloadMessageContent += `\n\n<system_directive>\nThe user explicitly referenced the following semantic markers from our conversation history. Focus your attention on these concepts in your response:\n${Array.from(matchedMarkers).map(m => `- ${m}`).join('\n')}\n</system_directive>`;
      }
    }

    // Git Context Injection
    try {
      if (activeSessionId) {
        const git = new GitContextManager(activeSessionId);
        // Ensure virtual repos exist
        await git.initRepo();
        await git.initGlobalRepo();
        
        const localMatrix = await git.getStatusMatrix();
        const globalMatrix = await git.getGlobalStatusMatrix();
        
        let gitContext = '';

        // Helper to format matrix into context string
        const formatMatrix = async (matrix: any[], dir: string, title: string) => {
          if (!matrix || matrix.length === 0) return '';
          
          let ctx = `${title}:\n`;
          let hasFiles = false;

          for (const row of matrix) {
            const [filepath, head, workdir, stage] = row;
            let state = 'Unmodified';
            if (head === 0 && workdir === 1 && stage === 0) state = 'Untracked';
            else if (head === 0 && workdir === 1 && stage === 1) state = 'Added';
            else if (head === 1 && workdir === 1 && stage === 1 && head !== workdir) state = 'Modified (staged)';
            else if (head === 1 && workdir === 1 && stage === 0 && head !== workdir) state = 'Modified (unstaged)';
            else if (head === 1 && workdir === 0 && stage === 0) state = 'Deleted (unstaged)';
            else if (head === 1 && workdir === 0 && stage === 1) state = 'Deleted (staged)';
            
            // Only skip truly unmodified/committed files if we want to save tokens, 
            // but for full context we usually want them embedded.
            ctx += `- ${filepath}: ${state}\n`;
            hasFiles = true;
            
            if (workdir === 1 || workdir === 2 || head === 1) {
                try {
                    const content = await git.fs.promises.readFile(`${dir}/${filepath}`, 'utf8');
                    const strContent = typeof content === 'string' ? content : new TextDecoder().decode(content as Uint8Array);
                    ctx += `\n--- START ${filepath} ---\n${strContent}\n--- END ${filepath} ---\n\n`;
                } catch (e) { /* ignore read error */ }
            }
          }
          return hasFiles ? ctx : '';
        };

        const globalCtxStr = await formatMatrix(globalMatrix, git.globalDir, 'Global Workspace Repository Status');
        const localCtxStr = await formatMatrix(localMatrix, git.dir, 'Current Session Virtual Repository Status');

        if (globalCtxStr) gitContext += globalCtxStr + '\n';
        if (localCtxStr) gitContext += localCtxStr;

        if (gitContext) {
           payloadMessageContent += `\n\n<system_directive>\n${gitContext}\n</system_directive>`;
        }
      }
    } catch (e) {
       console.warn('Failed to inject Git Context', e);
    }
    
    // Create a copy of the messages array for the LLM payload where the last message is the augmented one
    const payloadMessages = newMessages.map(msg => {
      if (msg.role === 'peer') {
        return { ...msg, role: 'user' as const, content: `[Peer ${msg.senderName || 'Anonymous'}]: ${msg.content}` };
      }
      return msg;
    });

    payloadMessages[payloadMessages.length - 1] = { 
      ...payloadMessages[payloadMessages.length - 1],
      role: 'user', 
      content: payloadMessageContent 
    };

    try {
      const data = await generateResponse(
        actualModel, 
        payloadMessages, 
        actualSystemPrompt, 
        responseSchema,
        abortControllerRef.current?.signal,
        isSearchEnabled
      );
      const newState: InternalState = {
        dissonanceScore: data.dissonanceScore, dissonanceReason: data.dissonanceReason,
        semanticNodes: data.semanticNodes || [], semanticEdges: data.semanticEdges || [],
        tokenUsage: data.usageMetadata ? {
          totalTokenCount: data.usageMetadata.totalTokenCount,
          promptTokenCount: data.usageMetadata.promptTokenCount,
          candidatesTokenCount: data.usageMetadata.candidatesTokenCount
        } : undefined
      };
      setMessages(prev => {
        const modelCount = prev.filter(m => m.role === 'model').length;
        return [...prev, { role: 'model', content: data.reply, internalState: newState, modelTurnIndex: modelCount }];
      });
      if (ws.isConnected && activeSessionId) {
        ws.sendChatMessage(data.reply, { role: 'model', internalState: newState });
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        setMessages(prev => [...prev, { role: 'model', content: '[Generation Interrupted]', isError: true }]);
      } else {
        setMessages(prev => [...prev, { role: 'model', content: error.message || 'An error occurred.', isError: true }]);
      }
    } finally {
      setIsLoading(false);
      setAttachedFiles([]);
      abortControllerRef.current = null;
    }
  };

  const handleDownloadHistory = async () => {
    if (messages.length === 0) return;
    const exportData = {
      timestamp: new Date().toISOString(),
      config: { model: selectedModel, systemPrompt: sessionSystemPrompt, gemId: activeGemId },
      messages: messages.map(msg => ({ role: msg.role, content: msg.content, ...(msg.internalState ? { internalState: msg.internalState } : {}) }))
    };
    const filename = `cognitive-resonance-${Date.now()}.json`;

    // Try native share first (iOS/Android)
    const sharedNatively = await shareJSON(exportData, filename);
    if (sharedNatively) return;

    // On native platforms, never fall through to web APIs — they crash Android WebView.
    if (Capacitor.isNativePlatform()) return;

    // Web fallback: Share API or direct download
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const file = new File([blob], filename, { type: 'application/json' });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ title: 'Cognitive Resonance Session', files: [file] });
        return;
      } catch (e: any) {
        if (e.name === 'AbortError') return; // User cancelled
      }
    }
    
    downloadJSON(exportData, filename);
  };

  const handleImportSession = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (!data.messages || !Array.isArray(data.messages)) {
          alert('Invalid session file: missing messages array.');
          return;
        }
        // Reconstruct messages with modelTurnIndex
        let modelCount = 0;
        const importedMessages: Message[] = data.messages.map((msg: any) => {
          const m: Message = { role: msg.role, content: msg.content, internalState: msg.internalState };
          if (msg.role === 'model' && !msg.isError) { m.modelTurnIndex = modelCount++; }
          if (msg.isError) m.isError = true;
          return m;
        });
        setMessages(importedMessages);
        setActiveSessionId(null); // Will get a new ID on auto-save
        setIsViewMode(false);
        if (data.config) {
          setSelectedModel(data.config.model || selectedModel);
          setSessionSystemPrompt(data.config.systemPrompt || sessionSystemPrompt);
          if (data.config.gemId) setActiveGemId(data.config.gemId);
        }
        setIsHistorySidebarOpen(false);
      } catch {
        alert('Failed to parse session file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleLoadSession = async (sessionId: string) => {
    const record = await storage.loadSession(sessionId);
    if (record) {
      setMessages(record.data.messages || []);
      setActiveSessionId(record.id);
      setIsViewMode(false);
      if (record.data.config) {
        setSelectedModel(record.data.config.model);
        setSessionSystemPrompt(record.data.config.systemPrompt);
        if (record.data.config.gemId) setActiveGemId(record.data.config.gemId);
      }
    }
    setTargetTurnIndex(null);
    setIsHistorySidebarOpen(false);
  };

  const handleSearchResultClick = async (result: any) => {
    if (activeSessionId !== result.sessionId) {
      await handleLoadSession(result.sessionId);
    }
    setTargetTurnIndex(result.turnIndex);
    setIsHistorySidebarOpen(false);
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await storage.deleteSession(sessionId);
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (activeSessionId === sessionId) { setActiveSessionId(null); setMessages([]); }
  };

  const handleGenerateInvite = async () => {
    const sessionId = activeSessionId || ensureActiveSession();
    try {
      const token = await auth.getToken?.();
      if (!token) throw new Error("Not logged in");
      
      const isNode = typeof process !== 'undefined' && process.env;
      const backendUrlRaw = isNode ? process.env.VITE_CLOUDFLARE_WORKER_URL : (import.meta as any).env?.VITE_CLOUDFLARE_WORKER_URL;
      const backendUrl = (backendUrlRaw || 'http://localhost:8787').replace(/\/$/, '');
      const res = await fetch(`${backendUrl}/api/auth/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ sessionId })
      });
      
      const data = await res.json();
      if (data.token) {
         const inviteUrl = `${window.location.origin}/?invite=${data.token}#${sessionId}`;
         await navigator.clipboard.writeText(inviteUrl);
         alert(`Invite link copied to clipboard:\n${inviteUrl}`);
      } else {
         throw new Error(data.error || "Failed to generate invite");
      }
    } catch (err: any) {
      console.error(err);
      alert(`Could not generate invite: ${err.message}`);
    }
  };

  const handleArchiveSession = async (sessionId: string, archive: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    if (storage.archiveSession) {
      await storage.archiveSession(sessionId, archive);
    }
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, isArchived: archive } : s));
    if (archive && activeSessionId === sessionId) {
      setActiveSessionId(null); setMessages([]);
    }
  };

  const startRenameSession = (sessionId: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation(); setEditingSessionId(sessionId); setEditSessionName(currentName);
  };

  const handleRenameSessionSubmit = async (sessionId: string, e: React.FormEvent | React.KeyboardEvent | React.MouseEvent) => {
    e.stopPropagation();
    if (e.type === 'submit') (e as React.FormEvent).preventDefault();
    if (editSessionName.trim()) {
      await storage.renameSession(sessionId, editSessionName.trim());
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, customName: editSessionName.trim(), preview: editSessionName.trim() } : s));
    }
    setEditingSessionId(null);
  };

  const startNewSession = () => {
    setActiveSessionId(null); setMessages([]); setIsViewMode(false);
    setIsHistorySidebarOpen(false); handleSelectGem(defaultGemId);
  };

  const ensureActiveSession = () => {
    if (activeSessionId) return activeSessionId;
    const id = `session-${Date.now()}`;
    setActiveSessionId(id);
    return id;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        setAttachedFiles(prev => [...prev, {
          id: `file-${Date.now()}-${Math.random()}`, name: file.name, mimeType: file.type,
          preview: file.type.startsWith('image/') ? reader.result as string : undefined, file
        }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  // URL Hash Sync for sharing rooms
  const activeSessionRef = useRef(activeSessionId);
  useEffect(() => { activeSessionRef.current = activeSessionId; }, [activeSessionId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleHashChange = async () => {
      const hash = window.location.hash.replace('#', '');
      if (hash && hash !== activeSessionRef.current) {
        const record = await storage.loadSession(hash);
        if (record) {
          setMessages(record.data.messages || []);
          setActiveSessionId(record.id);
          setIsViewMode(false);
          if (record.data.config) {
            setSelectedModel(record.data.config.model);
            setSessionSystemPrompt(record.data.config.systemPrompt);
            if (record.data.config.gemId) setActiveGemId(record.data.config.gemId);
          }
        } else {
          setActiveSessionId(hash);
          setMessages([]);
        }
      }
    };
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [storage]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (activeSessionId) {
      if (window.location.hash.replace('#', '') !== activeSessionId) {
        window.location.hash = activeSessionId;
      }
    } else {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [activeSessionId]);

  // Marker aggregation
  const allMarkersList = messages.filter(m => m.role === 'model' && m.internalState?.semanticNodes)
    .flatMap(m => m.internalState!.semanticNodes!);
  const markerCounts = new Map<string, number>();
  allMarkersList.forEach(n => { const label = n.label || n.id; markerCounts.set(label, (markerCounts.get(label) || 0) + 1); });
  const rankedMarkers = Array.from(markerCounts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const filteredMarkers = rankedMarkers.filter(m => m.name.toLowerCase().includes(markerSearchQuery.toLowerCase()));

  return {
    messages, setMessages, input, setInput, isLoading, selectedTurnIndex, setSelectedTurnIndex,
    sessions, activeSessionId, isHistorySidebarOpen, setIsHistorySidebarOpen,
    historySearchQuery, setHistorySearchQuery, activeSidebarTab, setActiveSidebarTab,
    searchResults, targetTurnIndex, editingSessionId, setEditingSessionId, editSessionName, setEditSessionName,
    markerViewMode, setMarkerViewMode, artifactContent, setArtifactContent, markerSearchQuery, setMarkerSearchQuery,
    mentionSearchQuery, setMentionSearchQuery, mentionSuggestions, setMentionSuggestions, mentionContext, setMentionContext, handleInputChange, handleMentionSelect,
    isDissonancePanelOpen, setIsDissonancePanelOpen, isRightSidebarOpen, setIsRightSidebarOpen,
    copiedIndex, setCopiedIndex, isGemSidebarOpen, setIsGemSidebarOpen,
    availableModels, chatModels, savedGems, defaultGemId, activeGemId, selectedModel, setSelectedModel,
    sessionSystemPrompt, editingGem, setEditingGem, creatingGem, setCreatingGem, draftGem, setDraftGem,
    isSearchEnabled, setIsSearchEnabled,
    showSystemMessages, setShowSystemMessages,
    isViewMode, historyFilename, setHistoryFilename, attachedFiles, setAttachedFiles,
    apiKey, showApiKeyModal, setShowApiKeyModal, apiKeyInput, setApiKeyInput,
    messagesEndRef, fileInputRef, importInputRef, inputRef,
    modelMessages, activeTurnIndex, activeState, isViewingHistory, historyData, filteredMarkers,
    activeUsers: ws.activeUsers,
    localSessionId: ws.localSessionId,
    sendSignal: ws.sendSignal,
    onSignal: ws.onSignal,
    handleSetApiKey, handleClearApiKey, handleSelectGem, handleSaveGem, handleDeleteGem, handleSetDefaultGem,
    handleSubmit, handleStopGeneration, handleDownloadHistory, handleLoadSession, handleSearchResultClick,
    handleDeleteSession, handleArchiveSession, startRenameSession, handleRenameSessionSubmit, startNewSession, ensureActiveSession, handleFileSelect, handleImportSession,
    handleGenerateInvite
  };
}
