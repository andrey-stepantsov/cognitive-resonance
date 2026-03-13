import React, { useEffect } from 'react';
import { Send, BrainCircuit, Activity, Network, Loader2, X, Download, Copy, Check, AlertTriangle, Paperclip, FileText, Diamond, Plus, Trash2, Star, Edit3, Database, Mic, MicOff, Square } from 'lucide-react';
import { SemanticGraph, DissonanceMeter, MarkdownRenderer } from '@cr/ui';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useREPL, useVoiceToDSL, translateToDSL } from '@cr/core';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// @ts-ignore
const vscode = window.vscode;

export default function App() {
  const {
    messages, input, setInput, isLoading, isSearchEnabled, setIsSearchEnabled, selectedTurnIndex, setSelectedTurnIndex,
    sessions, activeSessionId, isHistorySidebarOpen, setIsHistorySidebarOpen,
    historySearchQuery, setHistorySearchQuery, activeSidebarTab, setActiveSidebarTab,
    searchResults, targetTurnIndex, editingSessionId, setEditingSessionId, editSessionName, setEditSessionName,
    markerViewMode, setMarkerViewMode, markerSearchQuery, setMarkerSearchQuery,
    mentionSearchQuery, mentionSuggestions, handleMentionSelect, handleInputChange,
    isDissonancePanelOpen, setIsDissonancePanelOpen, isRightSidebarOpen, setIsRightSidebarOpen,
    copiedIndex, setCopiedIndex, isGemSidebarOpen, setIsGemSidebarOpen,
    availableModels, chatModels, savedGems, defaultGemId, activeGemId, selectedModel, setSelectedModel,
    sessionSystemPrompt, editingGem, setEditingGem, creatingGem, setCreatingGem, draftGem, setDraftGem,
    isViewMode, historyFilename, setHistoryFilename, attachedFiles, setAttachedFiles,
    messagesEndRef, fileInputRef, inputRef,
    modelMessages, activeTurnIndex, activeState, isViewingHistory, historyData, filteredMarkers,
    handleSelectGem, handleSaveGem, handleDeleteGem, handleSetDefaultGem,
    handleSubmit, handleDownloadHistory, handleLoadSession, handleSearchResultClick,
    handleDeleteSession, startRenameSession, handleRenameSessionSubmit, startNewSession, handleFileSelect,
    executeCommand, handleKeyDown, handleStopGeneration
  } = useREPL();

  const voice = useVoiceToDSL(async (transcript) => {
    const translated = await translateToDSL(transcript);
    if (translated.startsWith('/')) {
      await executeCommand(translated);
    } else {
      setInput(translated);
    }
  });

  // Extension specific: listen to window messages for files from host, or errors from host
  // if host was still doing things. But now host shouldn't be doing generative AI directly.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'file_attached') {
        const file = message.file;
        setAttachedFiles(prev => [...prev, file]);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [setAttachedFiles]);

  const requestFileSelection = () => {
    vscode.postMessage({ type: 'request_file_selection' });
  };

  return (
    <div className="flex flex-col h-screen bg-[#111116] text-zinc-100 font-sans overflow-hidden">
      
      {/* Session Sidebar Backdrop */}
      {isHistorySidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          onClick={() => setIsHistorySidebarOpen(false)}
        />
      )}

      {/* Session Sidebar Options Panel */}
      <div 
        className={cn(
          "fixed top-0 left-0 bottom-0 w-full sm:w-[320px] lg:w-[280px] bg-zinc-900 border-r border-zinc-800/50 shadow-2xl z-50 transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col pb-36 lg:pb-0",
          isHistorySidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
          <div className="flex gap-4">
            <button 
              onClick={() => setActiveSidebarTab('history')}
              className={cn(
                "text-sm font-semibold tracking-wide transition-colors pb-1 border-b-2",
                activeSidebarTab === 'history' ? "text-zinc-200 border-indigo-500" : "text-zinc-500 border-transparent hover:text-zinc-300"
              )}
            >
              History
            </button>
            <button 
              onClick={() => { setActiveSidebarTab('search'); setHistorySearchQuery(''); }}
              className={cn(
                "text-sm font-semibold tracking-wide transition-colors pb-1 border-b-2 flex items-center gap-1.5",
                activeSidebarTab === 'search' ? "text-zinc-200 border-indigo-500" : "text-zinc-500 border-transparent hover:text-zinc-300"
              )}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              Search
            </button>
          </div>
          <button 
            onClick={() => setIsHistorySidebarOpen(false)}
            className="text-zinc-500 hover:text-white transition-colors p-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {activeSidebarTab === 'search' && (
          <div className="p-3 border-b border-zinc-800/50 bg-zinc-900/50">
            <div className="relative">
              <input 
                type="text" 
                placeholder="Search concepts across all sessions..." 
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                autoFocus
                className="w-full bg-zinc-950/80 border border-zinc-700/50 rounded-lg py-2 pl-3 pr-3 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500/80 transition-colors shadow-inner"
              />
            </div>
          </div>
        )}

        {activeSidebarTab === 'history' && (
          <div className="p-3">
            <button
              onClick={startNewSession}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 rounded-lg text-sm font-medium transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              New Session
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1 mt-1">
          {activeSidebarTab === 'history' && sessions.length === 0 && (
            <div className="text-xs text-zinc-500 text-center mt-6">No previous sessions found</div>
          )}
          {activeSidebarTab === 'history' && sessions.map(s => (
            <div 
              key={s.id}
              onClick={() => {
                if (editingSessionId !== s.id) {
                   handleLoadSession(s.id);
                }
              }}
              className={cn(
                "group relative px-3 py-2.5 rounded-lg transition-colors border border-transparent flex justify-between items-center",
                editingSessionId !== s.id && "cursor-pointer",
                activeSessionId === s.id 
                  ? "bg-zinc-800/80 border-zinc-700/50 text-indigo-300" 
                  : "hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-200"
              )}
            >
              {editingSessionId === s.id ? (
                <div className="flex items-center gap-2 w-full" onClick={e => e.stopPropagation()}>
                  <input
                    type="text"
                    value={editSessionName}
                    onChange={(e) => setEditSessionName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameSessionSubmit(s.id, e);
                      if (e.key === 'Escape') setEditSessionName('');
                    }}
                    autoFocus
                    className="flex-1 bg-zinc-950 border border-indigo-500/50 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none"
                  />
                  <button onClick={(e) => handleRenameSessionSubmit(s.id, e)} className="text-indigo-400 hover:text-indigo-300">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setEditingSessionId(null); }} className="text-zinc-500 hover:text-zinc-300">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ) : (
                <>
                  <div className="truncate text-xs font-medium">
                    {s.customName || s.preview}
                    <div className="text-[10px] text-zinc-600 mt-0.5">{new Date(s.timestamp).toLocaleString()}</div>
                  </div>
                  
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all shrink-0">
                    <button
                      onClick={(e) => startRenameSession(s.id, s.customName || s.preview, e)}
                      className="p-1.5 text-zinc-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-md transition-colors"
                      title="Rename Session"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                    <button
                      onClick={(e) => handleDeleteSession(s.id, e)}
                      className="p-1.5 text-red-500/70 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                      title="Delete Session"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}

          {activeSidebarTab === 'search' && historySearchQuery.trim() === '' && (
             <div className="text-xs text-zinc-500 text-center mt-6 px-4 leading-relaxed">
               Type a concept to search your entire Cognitive Resonance history index.
             </div>
          )}
          
          {activeSidebarTab === 'search' && historySearchQuery.trim() !== '' && searchResults.length === 0 && (
            <div className="text-xs text-zinc-500 text-center mt-6">No matching concepts found.</div>
          )}
          
          {activeSidebarTab === 'search' && searchResults.map((r, i) => (
            <div 
              key={`${r.sessionId}-${r.turnIndex}-${i}`}
              onClick={() => handleSearchResultClick(r)}
              className={cn(
                "group relative p-3 rounded-lg cursor-pointer transition-colors border border-transparent flex flex-col gap-1.5",
                "hover:bg-zinc-800/60 bg-zinc-900/30 text-zinc-300 hover:border-zinc-700"
              )}
            >
              <div className="flex flex-wrap gap-1">
                 {r.matchedConcepts.map((c: string) => (
                    <span key={c} className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-[10px] font-medium border border-indigo-500/30">
                      {c}
                    </span>
                 ))}
              </div>
              <div className="text-xs text-zinc-400 italic line-clamp-2 px-1 border-l-2 border-zinc-700 ml-1">
                "{r.contextSnippet}"
              </div>
              <div className="text-[10px] text-zinc-500 mt-1 flex justify-between items-center">
                 <span>{new Date(r.timestamp).toLocaleDateString()}</span>
                 <span className="flex items-center gap-1">
                   Turn {r.turnIndex + 1}
                   <svg className="w-3 h-3 text-zinc-600 group-hover:text-indigo-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                 </span>
              </div>
            </div>
          ))}

          {activeSidebarTab === 'search' && historySearchQuery.trim() === '' && (
             <div className="text-xs text-zinc-500 text-center mt-6 px-4 leading-relaxed">
               Type a concept to search your entire Cognitive Resonance history index.
             </div>
          )}
          
          {activeSidebarTab === 'search' && historySearchQuery.trim() !== '' && searchResults.length === 0 && (
            <div className="text-xs text-zinc-500 text-center mt-6">No matching concepts found.</div>
          )}
          
          {activeSidebarTab === 'search' && searchResults.map((r, i) => (
            <div 
              key={`${r.sessionId}-${r.turnIndex}-${i}`}
              onClick={() => handleSearchResultClick(r)}
              className={cn(
                "group relative p-3 rounded-lg cursor-pointer transition-colors border border-transparent flex flex-col gap-1.5",
                "hover:bg-zinc-800/60 bg-zinc-900/30 text-zinc-300 hover:border-zinc-700"
              )}
            >
              <div className="flex flex-wrap gap-1">
                 {r.matchedConcepts.map((c: string) => (
                    <span key={c} className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-[10px] font-medium border border-indigo-500/30">
                      {c}
                    </span>
                 ))}
              </div>
              <div className="text-xs text-zinc-400 italic line-clamp-2 px-1 border-l-2 border-zinc-700 ml-1">
                "{r.contextSnippet}"
              </div>
              <div className="text-[10px] text-zinc-500 mt-1 flex justify-between items-center">
                 <span>{new Date(r.timestamp).toLocaleDateString()}</span>
                 <span className="flex items-center gap-1">
                   Turn {r.turnIndex + 1}
                   <svg className="w-3 h-3 text-zinc-600 group-hover:text-indigo-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                 </span>
              </div>
            </div>
          ))}

        </div>
      </div>

      {/* Header */}
      <header className="flex-none px-6 py-4 border-b border-zinc-800/50 bg-zinc-900/30 flex items-center justify-between backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button 
             onClick={() => setIsHistorySidebarOpen(true)}
             className="p-1.5 text-zinc-400 hover:text-indigo-400 bg-zinc-800/30 hover:bg-zinc-800 rounded-md transition-colors"
             title="Session History"
          >
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
          </button>
          <div className="h-6 w-px bg-zinc-800 mx-1"></div>
          <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] animate-pulse"></div>
          <h1 className="text-sm font-semibold tracking-wide text-zinc-100 flex items-center gap-2">
            Cognitive Resonance
            <span className="px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded text-[10px] font-mono border border-zinc-700/50">
              v0.0.15
            </span>
            {activeState?.tokenUsage && (
              <span className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-500/10 text-indigo-300 rounded text-[10px] font-mono border border-indigo-500/20 shadow-[0_0_8px_rgba(99,102,241,0.15)] ml-2 transition-all">
                <Database className="w-3 h-3 text-indigo-400" />
                {activeState.tokenUsage.toLocaleString()} tokens
              </span>
            )}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {!isViewMode && (
            <>
              <button
                onClick={handleDownloadHistory}
                disabled={messages.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-400 disabled:opacity-30 disabled:cursor-not-allowed hover:text-white bg-zinc-800/30 hover:bg-zinc-800 rounded border border-zinc-800 transition-colors"
                title="Download Snapshot JSON"
              >
                <Download className="w-3.5 h-3.5" />
                Backup
              </button>
            </>
          )}
        </div>
      </header>

      <div className="flex h-full w-full bg-[#0a0a0a] text-zinc-100 font-sans overflow-hidden relative">
      {/* Mobile Backdrop */}
      {isDissonancePanelOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => { setIsDissonancePanelOpen(false); }}
        />
      )}

      {/* Left Sidebar: Dissonance */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-full lg:w-80 bg-zinc-950 lg:bg-zinc-900/30 border-r border-zinc-800/50 flex flex-col p-6 pb-36 lg:pb-6",
        "transform transition-transform duration-300 ease-in-out lg:relative lg:transform-none lg:z-auto",
        isDissonancePanelOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-indigo-400" />
            <h2 className="font-medium tracking-wide text-zinc-100">Internal State</h2>
          </div>
          <div className="flex items-center gap-2">
            {isViewingHistory && (
              <button 
                onClick={() => setSelectedTurnIndex(null)}
                className="text-xs bg-indigo-500/20 text-indigo-300 px-2.5 py-1.5 rounded-md hover:bg-indigo-500/30 transition-colors"
              >
                Return to Current
              </button>
            )}
            <button className="lg:hidden p-1.5 text-zinc-400 hover:text-zinc-100 bg-zinc-800/50 rounded-md" onClick={() => setIsDissonancePanelOpen(false)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <DissonanceMeter 
          currentScore={activeState?.dissonanceScore ?? null} 
          reason={activeState?.dissonanceReason ?? null} 
          history={historyData} 
          activeTurnIndex={activeTurnIndex}
          isViewingHistory={isViewingHistory}
          onSelectTurn={setSelectedTurnIndex}
        />
      </div>

      {/* Center: Chat */}
      <div className="flex-1 flex flex-col min-w-0 w-full lg:min-w-[400px] max-w-3xl mx-auto lg:border-x border-zinc-800/30 bg-[#0a0a0a] shadow-2xl relative lg:z-10">
        <div className="p-4 lg:p-6 border-b border-zinc-800/50 flex items-center justify-between bg-zinc-900/20 backdrop-blur-md relative">
          <div className="flex items-center">
            <button className="lg:hidden p-2 -ml-2 text-zinc-400 hover:text-zinc-100" onClick={() => setIsDissonancePanelOpen(true)}>
              <Activity className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button className="lg:hidden p-2 -mr-2 text-zinc-400 hover:text-zinc-100" onClick={() => setIsRightSidebarOpen(true)}>
              <Network className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-4 px-8 text-center">
              <BrainCircuit className="w-12 h-12 opacity-20 mb-2" />
              <p className="text-sm font-medium text-zinc-400">Initiate conversation to observe internal state.</p>
              <div className="text-xs opacity-70 space-y-2 max-w-sm">
                <p>💡 Tip: You can save this session at any time using the download button in the top right.</p>
                <p>Use the <b>Cognitive Resonance: Resume Session</b> command later to pick up right where you left off, or <b>View History</b> for a read-only review.</p>
              </div>
            </div>
          )}
          
          {messages.map((msg, idx) => (
            <div 
              key={idx} 
              id={`message-${idx}`}
              className={cn(
                "flex w-full flex-col scroll-mt-24 min-w-0 break-words",
                msg.role === 'user' ? "items-end" : "items-start"
              )}
            >
              {msg.isError ? (
                <div className="max-w-[80%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed bg-red-950/60 text-red-200 border border-red-800/60 rounded-bl-sm">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-red-400 mb-1">Extension Error</p>
                      <p className="break-words whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(msg.content);
                      setCopiedIndex(idx);
                      setTimeout(() => setCopiedIndex(null), 2000);
                    }}
                    className="mt-2.5 flex items-center gap-1.5 text-xs text-red-400/70 hover:text-red-300 transition-colors"
                  >
                    {copiedIndex === idx ? (
                      <><Check className="w-3 h-3" /> Copied!</>
                    ) : (
                      <><Copy className="w-3 h-3" /> Copy error to clipboard</>
                    )}
                  </button>
                </div>
              ) : (
                <div 
                  className={cn(
                    "max-w-[85%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed overflow-hidden break-words min-w-0",
                    msg.role === 'user' 
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/20 rounded-br-sm" 
                      : "bg-zinc-800/80 text-zinc-200 border border-zinc-700/50 rounded-bl-sm prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:m-0 w-full"
                  )}
                >
                  {msg.role === 'model' && !msg.isError ? (
                    <MarkdownRenderer content={msg.content} />
                  ) : (
                    msg.content
                  )}
                </div>
              )}
              {msg.role === 'model' && msg.modelTurnIndex !== undefined && !msg.isError && (
                <button 
                  onClick={() => {
                    setSelectedTurnIndex(msg.modelTurnIndex!);
                    setIsDissonancePanelOpen(true);
                  }}
                  className={cn(
                    "mt-2 text-xs font-medium transition-colors flex items-center gap-1.5 px-1",
                    activeTurnIndex === msg.modelTurnIndex 
                      ? "text-indigo-400" 
                      : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  <Activity className="w-3.5 h-3.5" />
                  {activeTurnIndex === msg.modelTurnIndex ? "Viewing State" : "View State"}
                </button>
              )}
            </div>
          ))}
          
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-zinc-800/80 border border-zinc-700/50 rounded-2xl rounded-bl-sm px-5 py-4 flex items-center gap-3">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                <span className="text-sm text-zinc-400">Processing cognitive state...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {!isViewMode && (
          <div className="p-4 bg-zinc-950/95 backdrop-blur-xl lg:bg-zinc-900/50 border-t border-zinc-800/50 flex flex-col gap-2 relative z-[60] lg:z-20 shadow-[0_-20px_40px_rgba(0,0,0,0.5)] lg:shadow-none">
            {/* Prompt Area Controls */}
            <div className="flex items-center gap-2 px-1 pb-1">
              <button 
                 onClick={() => setIsGemSidebarOpen(true)} 
                 className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-zinc-800/40 hover:bg-zinc-800 text-indigo-300 border border-indigo-500/20 rounded-lg transition-colors shadow-sm"
                 title="Manage Gems"
              >
                <Diamond className="w-3.5 h-3.5" />
                {savedGems.find(g => g.id === activeGemId)?.name || 'Select Gem'}
              </button>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className={cn(
                  "text-xs font-medium bg-transparent hover:bg-zinc-800/40 border border-transparent hover:border-zinc-700/50 rounded-lg px-2 py-1.5 cursor-pointer focus:outline-none transition-all max-w-[200px] truncate shadow-sm",
                  (!selectedModel || !chatModels.find(m => m.name.replace('models/', '') === selectedModel.replace('models/', ''))) ? 'text-red-400/90' : 'text-zinc-400'
                )}
                title="Override model for this session"
              >
                {chatModels.length === 0 && (
                  <option value={selectedModel}>{selectedModel}</option>
                )}
                {chatModels.length > 0 && (!selectedModel || !chatModels.find(m => m.name.replace('models/', '') === selectedModel.replace('models/', ''))) && (
                   <option value={selectedModel || ''} className="text-red-500" disabled>Select valid chat model...</option>
                )}
                {chatModels.map((m: any) => {
                  const val = m.name.replace('models/', '');
                  return (
                    <option key={val} value={val}>{m.displayName || val}</option>
                  );
                })}
              </select>
            </div>
            
            {/* Attachment Preview Strip */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 px-1">
                {attachedFiles.map(f => (
                  <div key={f.id} className="flex items-center gap-2 bg-zinc-800/80 border border-zinc-700/50 rounded-lg px-2.5 py-1.5 text-xs group animate-in fade-in slide-in-from-bottom-2 duration-200">
                    {f.preview ? (
                      <img src={f.preview} alt={f.name} className="w-8 h-8 rounded object-cover" />
                    ) : (
                      <FileText className="w-4 h-4 text-zinc-400" />
                    )}
                    <span className="text-zinc-300 max-w-[120px] truncate">{f.name}</span>
                    <button
                      onClick={() => setAttachedFiles(prev => prev.filter(af => af.id !== f.id))}
                      className="p-0.5 text-zinc-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              )}
              {/* Autocomplete Panel */}
              <div 
                className={cn(
                  "w-full flex flex-col overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] bg-zinc-950/80 backdrop-blur-md rounded-2xl",
                  input.startsWith('/') || mentionSearchQuery !== null ? "h-[50vh] min-h-[300px] opacity-100 border border-zinc-800 shadow-xl mb-2" : "h-0 min-h-0 opacity-0 border-transparent mb-0"
                )}
              >
                <div className="flex-1 overflow-y-auto p-3 sm:p-4 custom-scrollbar">
                  {/* Mention Search Results */}
                  {mentionSearchQuery !== null && (
                    <div className="flex flex-col gap-2">
                       <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1 px-1">Semantic Markers</div>
                       {mentionSuggestions.length === 0 ? (
                         <div className="text-xs text-zinc-500 italic px-1 py-2">No matching concepts found in history.</div>
                       ) : (
                         mentionSuggestions.map((m, i) => (
                           <div key={i} className={cn(
                             "group relative flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border overflow-hidden",
                             i === 0 
                               ? "bg-zinc-800/90 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.15)]" 
                               : "bg-zinc-900/30 border-zinc-800/80 hover:bg-zinc-800/80 hover:border-indigo-500/30"
                           )} onClick={() => handleMentionSelect(m.name)}>
                             <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                             <span className="relative text-sm font-medium text-indigo-300">
                               {m.name} {i === 0 && <span className="ml-2 text-[10px] text-zinc-500 font-normal border border-zinc-700/50 px-1 rounded bg-zinc-900/50">Spacebar to insert</span>}
                             </span>
                             <span className="relative text-[10px] font-mono bg-zinc-800/80 px-1.5 py-0.5 rounded text-zinc-500 group-hover:bg-indigo-500/20 group-hover:text-indigo-400 transition-colors">Weight: {m.count}</span>
                           </div>
                         ))
                       )}
                    </div>
                  )}

                  {/* Slash Command Results */}
                  {input.startsWith('/') && mentionSearchQuery === null && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {[
                        { cmd: '/session ls', desc: 'List recent sessions in the sidebar' },
                        { cmd: '/session new', desc: 'Start a fresh chat session' },
                        { cmd: '/session clear', desc: 'Wipe current session context entirely' },
                        { cmd: '/history', desc: 'View local REPL command history' },
                        { cmd: '/model use [name]', desc: 'Switch active LLM (e.g. pro, flash)' },
                        { cmd: '/gem ls', desc: 'List your available agent profiles' },
                        { cmd: '/graph ls', desc: 'Dump active semantic nodes to chat' },
                        { cmd: '/graph search [query]', desc: 'Fuzzy search across graph nodes' },
                        { cmd: '/graph stats', desc: 'View graph memory metrics' },
                        { cmd: '/clear', desc: 'Clear the chat viewport' }
                      ].filter(c => c.cmd.includes(input) || input === '/').map((c, i) => (
                        <div key={i} className="group relative flex flex-col p-4 bg-zinc-900/30 hover:bg-zinc-800/80 rounded-xl cursor-pointer transition-all border border-zinc-800/50 hover:border-indigo-500/30 overflow-hidden shrink-0 h-fit"
                             onClick={() => setInput(c.cmd.replace(/ \[.*\]/, ' '))}>
                          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                          <span className="relative text-sm font-mono text-indigo-300 font-medium mb-1.5 drop-shadow-sm">{c.cmd}</span>
                          <span className="relative text-xs text-zinc-400 leading-relaxed">{c.desc}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            <form onSubmit={handleSubmit} className="relative flex items-center">
              {(!selectedModel || (chatModels.length > 0 && !chatModels.find(m => m.name.replace('models/', '') === selectedModel.replace('models/', '')))) && (
                <div className="absolute -top-10 left-0 w-full text-center pointer-events-none z-50">
                  <span className="bg-amber-500/10 text-amber-400 text-xs px-3 py-1.5 rounded-full border border-amber-500/20 shadow-lg pointer-events-auto">
                    Please select a valid 'gemini-' model to continue.
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1 shrink-0 px-2">
                <button
                  type="button"
                  onClick={() => setIsSearchEnabled(!isSearchEnabled)}
                  disabled={isLoading}
                  className={cn("p-2 transition-colors disabled:opacity-40 rounded-lg",
                    isSearchEnabled ? "text-blue-400 bg-blue-500/10" : "text-zinc-400 hover:text-indigo-400"
                  )}
                  title={isSearchEnabled ? "Google Search Grounding: ON" : "Google Search Grounding: OFF"}
                >
                  <Globe className={cn("w-4 h-4", isSearchEnabled ? "animate-pulse" : "")} />
                </button>
                <button
                  type="button"
                  onClick={() => vscode.postMessage({ type: 'request_file_selection' })}
                  disabled={isLoading}
                  className="p-2 text-zinc-400 hover:text-indigo-400 transition-colors disabled:opacity-40"
                  title="Attach files"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
              </div>
              <div className="relative w-full group">
                <input
                  type="text"
                  ref={inputRef as React.RefObject<HTMLInputElement>}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={voice.isListening ? "Listening..." : "Send a message..."}
                  disabled={!selectedModel || voice.isListening}
                  className={cn(
                    "w-full bg-zinc-950 border border-zinc-700/50 rounded-xl pl-4 pr-12 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all disabled:opacity-50",
                    voice.isListening ? "border-indigo-500/50 focus:border-indigo-500/50 animate-pulse text-indigo-300" : "focus:border-indigo-500/50"
                  )}
                />
                <button
                  type="button"
                  onClick={voice.isListening ? voice.stopListening : voice.startListening}
                  disabled={isLoading}
                  className={cn("absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors border",
                    voice.isListening ? "text-red-400 bg-red-500/10 border-red-500/20" : "text-zinc-500 border-transparent hover:text-indigo-400 hover:bg-zinc-800"
                  )}
                  title={voice.isListening ? "Stop listening" : "Dictate command or message"}
                >
                  {voice.isListening ? <MicOff className="w-4 h-4 animate-pulse" /> : <Mic className="w-4 h-4" />}
                </button>
              </div>
              {isLoading ? (
                <button
                  type="button"
                  onClick={handleStopGeneration}
                  className="ml-2 p-2 bg-red-600/20 hover:bg-red-600/40 text-red-500 rounded-lg transition-colors shrink-0"
                  title="Stop generation"
                >
                  <Square className="w-4 h-4 fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() || !selectedModel || (chatModels.length > 0 && !chatModels.find(m => m.name.replace('models/', '') === selectedModel.replace('models/', '')))}
                  className="ml-2 p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:hover:bg-indigo-600 shrink-0"
                  title="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </form>
          </div>
        )}
      </div>

      {/* Right Sidebar: Semantic Graph */}
      <div className={cn(
        "fixed inset-y-0 right-0 z-50 w-full lg:w-96 bg-zinc-950 lg:bg-zinc-900/30 border-l border-zinc-800/50 flex flex-col p-6 pb-36 lg:pb-6",
        "transform transition-transform duration-300 ease-in-out lg:relative lg:transform-none lg:z-auto",
        isRightSidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
      )}>
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Network className="w-5 h-5 text-indigo-400" />
            <h2 className="font-medium tracking-wide text-zinc-100">Semantic Markers</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-zinc-900/80 rounded-lg p-0.5 border border-zinc-800">
              <button
                onClick={() => setMarkerViewMode('graph')}
                className={cn("px-2.5 py-1 text-xs font-medium rounded-md transition-all", markerViewMode === 'graph' ? "bg-zinc-700/50 text-indigo-300 shadow-sm" : "text-zinc-500 hover:text-zinc-300")}
              >
                Graph
              </button>
              <button
                onClick={() => setMarkerViewMode('list')}
                className={cn("px-2.5 py-1 text-xs font-medium rounded-md transition-all", markerViewMode === 'list' ? "bg-zinc-700/50 text-indigo-300 shadow-sm" : "text-zinc-500 hover:text-zinc-300")}
              >
                List
              </button>
            </div>
            {isViewingHistory && (
              <button 
                onClick={() => setSelectedTurnIndex(null)}
                className="text-xs bg-indigo-500/20 text-indigo-300 px-2.5 py-1.5 rounded-md hover:bg-indigo-500/30 transition-colors"
              >
                Return to Current
              </button>
            )}
            <button className="lg:hidden p-1.5 text-zinc-400 hover:text-zinc-100 bg-zinc-800/50 rounded-md" onClick={() => setIsRightSidebarOpen(false)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 flex flex-col min-h-0">
          <p className="text-xs text-zinc-500 mb-4 shrink-0">
            {isViewingHistory 
              ? `Viewing semantic markers for turn ${activeTurnIndex + 1}.` 
              : "Real-time visualization of concepts and their relationships currently active in the model's context window."}
          </p>
          
          {markerViewMode === 'graph' ? (
              <div className="flex-1 min-h-0 relative">
                  <SemanticGraph 
                    nodes={activeState?.semanticNodes ?? []} 
                    edges={activeState?.semanticEdges ?? []} 
                    onNodeClick={(nodeId) => {
                       // Find the first message index where this semantic node appears in the internalState
                       const targetIdx = messages.findIndex(m => 
                         m.internalState?.semanticNodes?.some(n => n.id === nodeId)
                       );
                       if (targetIdx !== -1) {
                          const element = document.getElementById(`message-${targetIdx}`);
                          if (element) {
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            // Optional: add a temporary highlight class to the element
                            element.classList.add('bg-indigo-900/40', 'transition-colors', 'duration-500');
                            setTimeout(() => {
                              element.classList.remove('bg-indigo-900/40');
                            }, 2000);
                          }
                       }
                    }}
                  />
              </div>
          ) : (
             <div className="flex-1 flex flex-col min-h-0">
                <input
                  type="text"
                  placeholder="Filter markers..."
                  value={markerSearchQuery}
                  onChange={(e) => setMarkerSearchQuery(e.target.value)}
                  className="w-full bg-zinc-900/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/80 mb-3 shrink-0"
                />
                <div className="flex-1 overflow-y-auto pr-2 space-y-1">
                  {filteredMarkers.length === 0 && (
                     <div className="text-zinc-500 text-xs text-center py-4">No markers found.</div>
                  )}
                  {filteredMarkers.map(m => (
                    <div 
                      key={m.name}
                      onClick={() => {
                         setHistorySearchQuery(m.name);
                         setActiveSidebarTab('search');
                         setIsHistorySidebarOpen(true);
                      }}
                      className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/30 border border-transparent hover:border-zinc-700/50 hover:bg-zinc-800/50 cursor-pointer group transition-colors"
                    >
                      <span className="text-xs text-zinc-300 font-medium truncate pr-2 group-hover:text-indigo-300 transition-colors">{m.name}</span>
                      <span className="text-[10px] font-mono bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500 group-hover:bg-indigo-500/10 group-hover:text-indigo-400 transition-colors shrink-0">
                        {m.count}
                      </span>
                    </div>
                  ))}
                </div>
             </div>
          )}
        </div>
        </div>
      </div>

      {/* Gem Sidebar Options Panel */}
      {isGemSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          onClick={() => setIsGemSidebarOpen(false)}
        />
      )}
      <div 
        className={cn(
          "fixed top-0 right-0 bottom-0 w-full sm:w-[400px] lg:w-[340px] bg-zinc-900 border-l border-zinc-800/50 shadow-2xl z-50 transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col pb-36 lg:pb-0",
          isGemSidebarOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Diamond className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold tracking-wide text-zinc-200">Gems</h2>
          </div>
          <button 
            onClick={() => { setIsGemSidebarOpen(false); setEditingGem(null); setCreatingGem(false); }}
            className="text-zinc-500 hover:text-white transition-colors p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {editingGem || creatingGem ? (
           <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 animate-in slide-in-from-right-2 duration-200">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-2">
                <button onClick={() => { setEditingGem(null); setCreatingGem(false); }} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
                {creatingGem ? 'New Custom Gem' : 'Edit Gem'}
              </div>
              <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-400 ml-1">Name</label>
                  <input
                    type="text"
                    value={editingGem ? editingGem.name : draftGem.name || ''}
                    onChange={(e) => {
                       if (editingGem) setEditingGem({...editingGem, name: e.target.value});
                       else setDraftGem({...draftGem, name: e.target.value});
                    }}
                    placeholder="E.g. Code Reviewer"
                    className="w-full bg-zinc-950/50 text-sm text-zinc-200 border border-zinc-700/50 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                  />
              </div>
              <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-400 ml-1">Base Model</label>
                  <select
                    value={editingGem ? editingGem.model : draftGem.model || 'gemini-2.5-flash'}
                    onChange={(e) => {
                       if (editingGem) setEditingGem({...editingGem, model: e.target.value});
                       else setDraftGem({...draftGem, model: e.target.value});
                    }}
                    className="w-full bg-zinc-950/50 text-sm text-zinc-200 border border-zinc-700/50 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                  >
                    {chatModels.map((m: any) => {
                      const val = m.name.replace('models/', '');
                      return <option key={val} value={val}>{m.displayName || val}</option>;
                    })}
                  </select>
              </div>
              <div className="space-y-1.5 flex-1 flex flex-col">
                  <label className="text-xs font-semibold text-zinc-400 ml-1">System Prompt</label>
                  <textarea
                    value={editingGem ? editingGem.systemPrompt : draftGem.systemPrompt || ''}
                    onChange={(e) => {
                       if (editingGem) setEditingGem({...editingGem, systemPrompt: e.target.value});
                       else setDraftGem({...draftGem, systemPrompt: e.target.value});
                    }}
                    placeholder="You are an expert..."
                    className="w-full bg-zinc-950/50 text-xs text-zinc-300 border border-zinc-700/50 rounded-lg px-3 py-2.5 flex-1 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 font-mono resize-none min-h-[200px]"
                  />
              </div>
              <div className="pt-2">
                 <button
                    onClick={() => {
                        if (editingGem) handleSaveGem(editingGem);
                        else {
                           const newId = 'gem-' + Date.now();
                           handleSaveGem({
                               id: newId,
                               name: draftGem.name || 'Unnamed Gem',
                               model: draftGem.model || 'gemini-2.5-flash',
                               systemPrompt: draftGem.systemPrompt || ''
                           });
                        }
                    }}
                    disabled={editingGem ? !editingGem.name : !draftGem.name}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                 >
                    Save Gem
                 </button>
              </div>
           </div>
        ) : (
           <>
              <div className="p-3">
                <button
                  onClick={() => {
                     setCreatingGem(true);
                     setDraftGem({ name: '', model: 'gemini-2.5-flash', systemPrompt: '' });
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm font-medium transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Create Custom Gem
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2 mt-1">
                {savedGems.map(g => (
                  <div
                    key={g.id}
                    onClick={() => handleSelectGem(g.id)}
                    className={cn(
                      "group relative px-3 py-3 rounded-lg cursor-pointer transition-colors border flex flex-col gap-1",
                      activeGemId === g.id
                        ? "bg-indigo-900/20 border-indigo-500/40 shadow-sm"
                        : "bg-zinc-800/20 border-zinc-800/80 hover:bg-zinc-800/50"
                    )}
                  >
                     <div className="flex items-start justify-between">
                         <div className="flex items-center gap-2">
                             <div className="text-sm font-semibold text-zinc-200">{g.name}</div>
                             {g.isBuiltIn && <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-zinc-800 text-zinc-400">Built-in</span>}
                         </div>
                         <div className="flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                             <button
                               onClick={(e) => handleSetDefaultGem(g.id, e)}
                               className={cn("p-1.5 rounded-md transition-colors", defaultGemId === g.id ? "text-amber-400" : "text-zinc-500 hover:text-amber-400 hover:bg-amber-400/10")}
                               title="Set as Default"
                             >
                               <Star className="w-3.5 h-3.5" fill={defaultGemId === g.id ? "currentColor" : "none"} />
                             </button>
                             {!g.isBuiltIn && (
                               <>
                                 <button
                                   onClick={(e) => { e.stopPropagation(); setEditingGem(g); }}
                                   className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-md transition-colors"
                                 >
                                   <Edit3 className="w-3.5 h-3.5" />
                                 </button>
                                 <button
                                   onClick={(e) => handleDeleteGem(g.id, e)}
                                   className="p-1.5 text-red-500/70 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                                 >
                                   <Trash2 className="w-3.5 h-3.5" />
                                 </button>
                               </>
                             )}
                         </div>
                     </div>
                     <div className="text-[11px] text-zinc-500 font-medium">{g.model}</div>
                     <div className="text-xs text-zinc-400 line-clamp-2 mt-1">{g.systemPrompt || <span className="italic opacity-50">No system prompt</span>}</div>
                  </div>
                ))}
              </div>
           </>
        )}
      </div>

    </div>
  );
}
