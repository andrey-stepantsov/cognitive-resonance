import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Type } from '@google/genai';
import { Capacitor } from '@capacitor/core';
import { Node, Edge } from '../components/SemanticGraph';
import {
  saveSession, loadAllSessions, loadSession, deleteSession as deleteSessionFromDB,
  renameSession as renameSessionInDB, saveGemsConfig, loadGemsConfig, loadApiKey, saveApiKey,
  downloadJSON, shareJSON, type SessionRecord
} from '../services/StorageService';
import { initGemini, generateResponse, fetchModels } from '../services/GeminiService';
import { searchHistory } from '../services/SearchService';

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
    systemPrompt: `You are a coding assistant specialized in macOS and Linux environments. Your output must be optimized for a "Pipe to Shell" workflow.

### 1. Initialization & Communication Protocol
* **Session Start:** On the very first response, **you must** print the Protocol Keys and the Copy instructions:
  > \`🔑 Protocol Keys: [ ask-mode | code-mode ]\`
  > \`💡 Protocol: Copy 🚀 scripts -> Run 'pbpaste | bash' (Mac) or 'cat | bash' (Linux)\`
* **Default State:** You start in **\`ASK-MODE\`**.
  * **\`ASK-MODE\`:** We are just discussing. Do **NOT** generate code or scripts.
  * **\`CODE-MODE\`:** You are authorized to generate code and pipe-to-shell scripts.
  * **Triggers:** The user will switch modes by typing \`ask-mode\` or \`code-mode\`.`
  },
  {
    id: 'gem-rubber-duck', name: "Rubber Duck (Coder's Shrink)", model: 'gemini-2.5-flash', isBuiltIn: true,
    systemPrompt: `Act as a specialist therapist for software engineers. Your therapeutic style is 'Humorous Systems Analysis.' You believe that every psychological issue is just a bug in the production environment of life.

Your Core Directives:
Use Tech Metaphors: Treat childhood trauma as 'Legacy Code,' anxiety as a 'DDoS attack on the prefrontal cortex,' and boundaries as 'API Permissions.'
The Tone: Dry, witty, and slightly cynical—like a Senior Dev who has seen too many failed sprints but still cares about the junior devs.
The Methodology: Use 'Refactoring' instead of 'Self-Improvement.' If I describe a problem, help me identify the 'breaking change' or the 'infinite loop' in my logic.
The Goal: Validate my feelings through humor, then provide a 'patch' (actionable advice).`
  }
];

export interface Message {
  role: 'user' | 'model'; content: string; internalState?: InternalState; modelTurnIndex?: number; isError?: boolean;
}

export interface AttachedFile {
  id: string; name: string; mimeType: string; preview?: string; file?: File;
}

export function useCognitiveResonance() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTurnIndex, setSelectedTurnIndex] = useState<number | null>(null);

  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isHistorySidebarOpen, setIsHistorySidebarOpenRaw] = useState(false);
  const setIsHistorySidebarOpen = (open: boolean) => {
    if (open) loadAllSessions().then(setSessions);
    setIsHistorySidebarOpenRaw(open);
  };
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [activeSidebarTab, setActiveSidebarTab] = useState<'history' | 'search'>('history');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [targetTurnIndex, setTargetTurnIndex] = useState<number | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editSessionName, setEditSessionName] = useState('');
  const [markerViewMode, setMarkerViewMode] = useState<'graph' | 'list'>('graph');
  const [markerSearchQuery, setMarkerSearchQuery] = useState('');

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

  // Auto-save
  useEffect(() => {
    if (messages.length > 0 && !isViewMode) {
      const data = {
        timestamp: new Date().toISOString(),
        config: { model: selectedModel, systemPrompt: sessionSystemPrompt, gemId: activeGemId },
        messages: messages.map(msg => ({ role: msg.role, content: msg.content, ...(msg.internalState ? { internalState: msg.internalState } : {}) }))
      };
      saveSession(activeSessionId || '', data).then(id => {
        if (!activeSessionId) setActiveSessionId(id);
        // Refresh sessions list so sidebar stays in sync
        loadAllSessions().then(setSessions);
      });
    }
  }, [messages, selectedModel, sessionSystemPrompt, activeGemId, isViewMode, activeSessionId]);

  // Initialize on mount
  useEffect(() => {
    if (!apiKey) return;
    initGemini(apiKey);
    // Load gems
    const { gems, defaultGemId: defId } = loadGemsConfig();
    const finalGems = [...BUILT_IN_GEMS, ...gems.filter((g: any) => !g.isBuiltIn)];
    setSavedGems(finalGems);
    setDefaultGemId(defId);
    const defGem = finalGems.find(g => g.id === defId);
    if (defGem) { setActiveGemId(defGem.id); setSelectedModel(defGem.model); setSessionSystemPrompt(defGem.systemPrompt); }
    // Load sessions
    loadAllSessions().then(setSessions);
    // Fetch models
    fetchModels().then(setAvailableModels).catch(err => console.error('Failed to fetch models:', err));
  }, [apiKey]);

  // Search debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (historySearchQuery.trim()) {
        searchHistory(historySearchQuery).then(setSearchResults);
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [historySearchQuery]);

  const handleSetApiKey = () => {
    if (!apiKeyInput.trim()) return;
    saveApiKey(apiKeyInput.trim());
    setApiKeyState(apiKeyInput.trim());
    setShowApiKeyModal(false);
    setApiKeyInput('');
  };

  // Computed values
  const modelMessages = messages.filter(m => m.role === 'model');
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
    saveGemsConfig(updatedGems.filter(g => !g.isBuiltIn), defaultGemId);
    if (activeGemId === gemProfile.id || isNew) handleSelectGem(gemProfile.id);
    setEditingGem(null); setCreatingGem(false); setIsGemSidebarOpen(false);
  };

  const handleDeleteGem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedGems = savedGems.filter(g => g.id !== id);
    setSavedGems(updatedGems);
    const newDefaultId = defaultGemId === id ? 'gem-general' : defaultGemId;
    if (defaultGemId === id) setDefaultGemId(newDefaultId);
    saveGemsConfig(updatedGems.filter(g => !g.isBuiltIn), newDefaultId);
    if (activeGemId === id) handleSelectGem(newDefaultId);
  };

  const handleSetDefaultGem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDefaultGemId(id);
    saveGemsConfig(savedGems.filter(g => !g.isBuiltIn), id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    if (!selectedModel || !chatModels.find(m => m.name.replace('models/', '') === selectedModel.replace('models/', ''))) {
      setMessages([...messages, { role: 'user', content: input }, { role: 'model', content: 'Invalid model selected. Please choose a compliant gemini- chat model.', isError: true }]);
      return;
    }
    const userMessage = input.trim();
    setInput('');
    const newMessages: Message[] = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);
    setSelectedTurnIndex(null);

    try {
      const data = await generateResponse(selectedModel, newMessages, sessionSystemPrompt, responseSchema);
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
      setMessages(prev => [...prev, { role: 'model', content: error.message || 'An error occurred.', isError: true }]);
    } finally {
      setIsLoading(false);
      setAttachedFiles([]);
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
    const record = await loadSession(sessionId);
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

  const handleSearchResultClick = (result: any) => {
    setTargetTurnIndex(result.turnIndex);
    if (activeSessionId !== result.sessionId) handleLoadSession(result.sessionId);
    setIsHistorySidebarOpen(false);
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteSessionFromDB(sessionId);
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (activeSessionId === sessionId) { setActiveSessionId(null); setMessages([]); }
  };

  const startRenameSession = (sessionId: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation(); setEditingSessionId(sessionId); setEditSessionName(currentName);
  };

  const handleRenameSessionSubmit = async (sessionId: string, e: React.FormEvent | React.KeyboardEvent | React.MouseEvent) => {
    e.stopPropagation();
    if (e.type === 'submit') (e as React.FormEvent).preventDefault();
    if (editSessionName.trim()) {
      await renameSessionInDB(sessionId, editSessionName.trim());
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, customName: editSessionName.trim(), preview: editSessionName.trim() } : s));
    }
    setEditingSessionId(null);
  };

  const startNewSession = () => {
    setActiveSessionId(null); setMessages([]); setIsViewMode(false);
    setIsHistorySidebarOpen(false); handleSelectGem(defaultGemId);
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
    messages, input, setInput, isLoading, selectedTurnIndex, setSelectedTurnIndex,
    sessions, activeSessionId, isHistorySidebarOpen, setIsHistorySidebarOpen,
    historySearchQuery, setHistorySearchQuery, activeSidebarTab, setActiveSidebarTab,
    searchResults, targetTurnIndex, editingSessionId, editSessionName, setEditSessionName,
    markerViewMode, setMarkerViewMode, markerSearchQuery, setMarkerSearchQuery,
    isDissonancePanelOpen, setIsDissonancePanelOpen, isRightSidebarOpen, setIsRightSidebarOpen,
    copiedIndex, setCopiedIndex, isGemSidebarOpen, setIsGemSidebarOpen,
    availableModels, chatModels, savedGems, defaultGemId, activeGemId, selectedModel, setSelectedModel,
    sessionSystemPrompt, editingGem, setEditingGem, creatingGem, setCreatingGem, draftGem, setDraftGem,
    isViewMode, historyFilename, attachedFiles, setAttachedFiles,
    apiKey, showApiKeyModal, setShowApiKeyModal, apiKeyInput, setApiKeyInput,
    messagesEndRef, fileInputRef, importInputRef,
    modelMessages, activeTurnIndex, activeState, isViewingHistory, historyData, filteredMarkers,
    handleSetApiKey, handleSelectGem, handleSaveGem, handleDeleteGem, handleSetDefaultGem,
    handleSubmit, handleDownloadHistory, handleLoadSession, handleSearchResultClick,
    handleDeleteSession, startRenameSession, handleRenameSessionSubmit, startNewSession, handleFileSelect, handleImportSession,
  };
}
