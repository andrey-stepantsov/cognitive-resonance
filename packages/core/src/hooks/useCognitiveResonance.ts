import React, { useState, useRef, useEffect } from 'react';
import { Type } from '@google/genai';
import { Capacitor } from '@capacitor/core';
import type { Node, Edge } from '@cr/ui';
import { saveApiKey, loadApiKey, clearApiKey, downloadJSON, shareJSON, type SessionRecord } from '@cr/backend';
import { useCognitivePlatform } from '../providers/CognitivePlatformContext';
import { initGemini, generateResponse, fetchModels } from '../services/GeminiService';
import { searchHistory } from '../services/SearchService';
import { GitContextManager } from '../services/GitContextManager';
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
  role: 'user' | 'model'; content: string; internalState?: InternalState; modelTurnIndex?: number; isError?: boolean;
}

export interface AttachedFile {
  id: string; name: string; mimeType: string; preview?: string; file?: File;
}

export function useCognitiveResonance() {
  const { storage } = useCognitivePlatform();
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

    // Check if the word before the cursor starts with @
    const textBeforeCursor = val.slice(0, cursor);
    const words = textBeforeCursor.split(/\s/);
    const targetWord = words[words.length - 1];

    if (targetWord && targetWord.startsWith('@')) {
      // Allow valid semantic node characters (letters, numbers, underscores, dashes)
      const query = targetWord.slice(1);
      if (/^[a-zA-Z0-9_\-]*$/.test(query)) {
        setMentionSearchQuery(query);
      } else {
        setMentionSearchQuery(null);
      }
    } else {
      setMentionSearchQuery(null);
    }
  };

  // Perform fuzzy search whenever mentionSearchQuery or allMarkersList changes
  useEffect(() => {
    if (mentionSearchQuery === null) {
      setMentionSuggestions([]);
      return;
    }
    
    // allMarkersList already has ranked nodes from historyData aggregation below
    const markers = Array.from(markerCounts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    
    if (!mentionSearchQuery) {
       // If just '@', show top ranked
       setMentionSuggestions(markers);
       return;
    }
    
    // Use Fuse to search and maintain rank weight
    const fuse = new Fuse(markers, { keys: ['name'], threshold: 0.4 });
    const results = fuse.search(mentionSearchQuery)
                        .map(r => r.item)
                        .sort((a, b) => b.count - a.count);
    setMentionSuggestions(results);
  }, [mentionSearchQuery, messages]);

  const handleMentionSelect = (markerLabel: string) => {
    if (cursorPosition === null) return;
    
    const textBeforeCursor = input.slice(0, cursorPosition);
    const textAfterCursor = input.slice(cursorPosition);
    
    // Find the @word we are replacing
    const words = textBeforeCursor.split(/\s/);
    const targetWord = words[words.length - 1];
    
    if (targetWord && targetWord.startsWith('@')) {
      const newTextBefore = textBeforeCursor.slice(0, -targetWord.length);
      const replacement = `@${markerLabel} `;
      const newInput = newTextBefore + replacement + textAfterCursor;
      setInput(newInput);
      setMentionSearchQuery(null);
      setMentionSuggestions([]);
      // We ideally want to set cursor position after the replaced word, but React state makes it tricky without a ref
    }
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
    const newMessages: Message[] = [...messages, { role: 'user', content: rawUserMessage }];
    setMessages(newMessages);
    setIsLoading(true);
    setSelectedTurnIndex(null);
    abortControllerRef.current = new AbortController();

    // Prompt Interception: Look for @ mentions
    let payloadMessageContent = rawUserMessage;
    const mentionRegex = /@([a-zA-Z0-9_\-]+)/g;
    const matches = Array.from(rawUserMessage.matchAll(mentionRegex));
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
        // Ensure virtual repo exists
        await git.initRepo();
        const matrix = await git.getStatusMatrix();
        
        // matrix format: [filepath, HEAD, WORKDIR, STAGE]
        // 0 = absent, 1 = present, 2=differs
        if (matrix && matrix.length > 0) {
           let gitContext = 'Current Virtual Repository Status:\n';
           for (const row of matrix) {
              const [filepath, head, workdir, stage] = row;
              let state = 'Unmodified';
              if (head === 0 && workdir === 1 && stage === 0) state = 'Untracked';
              else if (head === 0 && workdir === 1 && stage === 1) state = 'Added';
              else if (head === 1 && workdir === 1 && stage === 1 && head !== workdir) state = 'Modified (staged)';
              else if (head === 1 && workdir === 1 && stage === 0 && head !== workdir) state = 'Modified (unstaged)';
              else if (head === 1 && workdir === 0 && stage === 0) state = 'Deleted (unstaged)';
              else if (head === 1 && workdir === 0 && stage === 1) state = 'Deleted (staged)';
              gitContext += `- ${filepath}: ${state}\n`;
           }
           payloadMessageContent += `\n\n<system_directive>\n${gitContext}\n</system_directive>`;
        }
      }
    } catch (e) {
       console.warn('Failed to inject Git Context', e);
    }
    
    // Create a copy of the messages array for the LLM payload where the last message is the augmented one
    const payloadMessages = [...newMessages];
    payloadMessages[payloadMessages.length - 1] = { 
      role: 'user', 
      content: payloadMessageContent 
    };

    try {
      const data = await generateResponse(
        selectedModel, 
        payloadMessages, 
        sessionSystemPrompt, 
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
    mentionSearchQuery, setMentionSearchQuery, mentionSuggestions, handleInputChange, handleMentionSelect,
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
    handleSetApiKey, handleClearApiKey, handleSelectGem, handleSaveGem, handleDeleteGem, handleSetDefaultGem,
    handleSubmit, handleStopGeneration, handleDownloadHistory, handleLoadSession, handleSearchResultClick,
    handleDeleteSession, handleArchiveSession, startRenameSession, handleRenameSessionSubmit, startNewSession, ensureActiveSession, handleFileSelect, handleImportSession,
  };
}
