import React from 'react';
import {
  Send, BrainCircuit, Activity, Network, Archive, Search, Download, Trash2, Edit2, Play, Check, X,
  Settings, Save, FileJson, AlertTriangle, Plus, Copy, Image as ImageIcon, FileText, ChevronRight, Share2, Diamond, LayoutGrid, List,
  Database, Loader2, Paperclip, Star, Edit3, Upload
} from 'lucide-react';
import { SemanticGraph } from './components/SemanticGraph';
import { DissonanceMeter } from './components/DissonanceMeter';
import { MarkdownRenderer } from './components/MarkdownRenderer';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useCognitiveResonance } from './hooks/useCognitiveResonance';
import { clearApiKey } from './services/StorageService';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const app = useCognitiveResonance();

  // API Key Modal
  if (app.showApiKeyModal) {
    return (
      <div className="fixed inset-0 bg-[#111116] flex items-center justify-center z-[200]">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] animate-pulse" />
            <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Cognitive Resonance</h1>
          </div>
          <p className="text-sm text-zinc-400 mb-6">Enter your Google Gemini API key to get started. You can get one from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" className="text-indigo-400 hover:text-indigo-300 underline">Google AI Studio</a>.</p>
          <form onSubmit={(e) => { e.preventDefault(); app.handleSetApiKey(); }} className="space-y-4">
            <input
              type="password"
              value={app.apiKeyInput}
              onChange={(e) => app.setApiKeyInput(e.target.value)}
              placeholder="AIza..."
              autoFocus
              className="w-full bg-zinc-950 border border-zinc-700/50 rounded-xl px-4 py-3 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
            <button type="submit" disabled={!app.apiKeyInput.trim()} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50">
              Save & Start
            </button>
          </form>
          <p className="text-xs text-zinc-600 mt-4 text-center">Your key is stored locally in this browser only.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#111116] text-zinc-100 font-sans overflow-hidden">
      
      {/* Session Sidebar Backdrop */}
      {app.isHistorySidebarOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={() => app.setIsHistorySidebarOpen(false)} />
      )}

      {/* Session Sidebar */}
      <div className={cn(
        "fixed top-0 left-0 bottom-0 w-[280px] bg-zinc-900 border-r border-zinc-800/50 shadow-2xl z-50 transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
        app.isHistorySidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
          <div className="flex gap-4">
            <button onClick={() => app.setActiveSidebarTab('history')} className={cn("text-sm font-semibold tracking-wide transition-colors pb-1 border-b-2", app.activeSidebarTab === 'history' ? "text-zinc-200 border-indigo-500" : "text-zinc-500 border-transparent hover:text-zinc-300")}>History</button>
            <button onClick={() => { app.setActiveSidebarTab('search'); app.setHistorySearchQuery(''); }} className={cn("text-sm font-semibold tracking-wide transition-colors pb-1 border-b-2 flex items-center gap-1.5", app.activeSidebarTab === 'search' ? "text-zinc-200 border-indigo-500" : "text-zinc-500 border-transparent hover:text-zinc-300")}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              Search
            </button>
          </div>
          <button onClick={() => app.setIsHistorySidebarOpen(false)} className="text-zinc-500 hover:text-white transition-colors p-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {app.activeSidebarTab === 'search' && (
          <div className="p-3 border-b border-zinc-800/50 bg-zinc-900/50">
            <input type="text" placeholder="Search concepts across all sessions..." value={app.historySearchQuery} onChange={(e) => app.setHistorySearchQuery(e.target.value)} autoFocus
              className="w-full bg-zinc-950/80 border border-zinc-700/50 rounded-lg py-2 pl-3 pr-3 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500/80 transition-colors shadow-inner" />
          </div>
        )}

        {app.activeSidebarTab === 'history' && (
          <div className="p-3 flex gap-2">
            <button onClick={app.startNewSession} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 rounded-lg text-sm font-medium transition-all">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              New
            </button>
            <input type="file" ref={app.importInputRef} onChange={app.handleImportSession} accept=".json" className="hidden" />
            <button onClick={() => app.importInputRef.current?.click()} className="flex items-center justify-center gap-2 px-4 py-2 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700/50 rounded-lg text-sm font-medium transition-all" title="Import session from JSON file">
              <Upload className="w-4 h-4" />
              Import
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1 mt-1">
          {app.activeSidebarTab === 'history' && app.sessions.length === 0 && (
            <div className="text-xs text-zinc-500 text-center mt-6">No previous sessions found</div>
          )}
          {app.activeSidebarTab === 'history' && app.sessions.map(s => (
            <div key={s.id} onClick={() => { if (app.editingSessionId !== s.id) app.handleLoadSession(s.id); }}
              className={cn("group relative px-3 py-2.5 rounded-lg transition-colors border border-transparent flex justify-between items-center",
                app.editingSessionId !== s.id && "cursor-pointer",
                app.activeSessionId === s.id ? "bg-zinc-800/80 border-zinc-700/50 text-indigo-300" : "hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-200"
              )}>
              {app.editingSessionId === s.id ? (
                <div className="flex items-center gap-2 w-full" onClick={e => e.stopPropagation()}>
                  <input type="text" value={app.editSessionName} onChange={(e) => app.setEditSessionName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') app.handleRenameSessionSubmit(s.id, e); if (e.key === 'Escape') {} }}
                    autoFocus className="flex-1 bg-zinc-950 border border-indigo-500/50 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none" />
                  <button onClick={(e) => app.handleRenameSessionSubmit(s.id, e)} className="text-indigo-400 hover:text-indigo-300">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </button>
                </div>
              ) : (
                <>
                  <div className="truncate text-xs font-medium">
                    {s.customName || s.preview}
                    <div className="text-[10px] text-zinc-600 mt-0.5">{new Date(s.timestamp).toLocaleString()}</div>
                  </div>
                  <div className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 flex items-center gap-1 transition-all shrink-0">
                    <button onClick={(e) => app.startRenameSession(s.id, s.customName || s.preview, e)} className="p-1.5 text-zinc-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-md transition-colors" title="Rename">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                    <button onClick={(e) => app.handleDeleteSession(s.id, e)} className="p-1.5 text-red-500/70 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors" title="Delete">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}

          {app.activeSidebarTab === 'search' && app.historySearchQuery.trim() === '' && (
            <div className="text-xs text-zinc-500 text-center mt-6 px-4 leading-relaxed">Type a concept to search your entire Cognitive Resonance history.</div>
          )}
          {app.activeSidebarTab === 'search' && app.historySearchQuery.trim() !== '' && app.searchResults.length === 0 && (
            <div className="text-xs text-zinc-500 text-center mt-6">No matching concepts found.</div>
          )}
          {app.activeSidebarTab === 'search' && app.searchResults.map((r, i) => (
            <div key={`${r.sessionId}-${r.turnIndex}-${i}`} onClick={() => app.handleSearchResultClick(r)}
              className="group relative p-3 rounded-lg cursor-pointer transition-colors border border-transparent flex flex-col gap-1.5 hover:bg-zinc-800/60 bg-zinc-900/30 text-zinc-300 hover:border-zinc-700">
              <div className="flex flex-wrap gap-1">
                {r.matchedConcepts.map((c: string) => (
                  <span key={c} className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-[10px] font-medium border border-indigo-500/30">{c}</span>
                ))}
              </div>
              <div className="text-xs text-zinc-400 italic line-clamp-2 px-1 border-l-2 border-zinc-700 ml-1">"{r.contextSnippet}"</div>
              <div className="text-[10px] text-zinc-500 mt-1 flex justify-between items-center">
                <span>{new Date(r.timestamp).toLocaleDateString()}</span>
                <span className="flex items-center gap-1">Turn {r.turnIndex + 1}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Header */}
      <header className="flex-none px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-4 border-b border-zinc-800/50 bg-zinc-900/30 flex items-center justify-between backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => app.setIsHistorySidebarOpen(true)} className="p-1.5 text-zinc-400 hover:text-indigo-400 bg-zinc-800/30 hover:bg-zinc-800 rounded-md transition-colors" title="Session History">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
          </button>
          <div className="h-6 w-px bg-zinc-800 mx-1" />
          <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] animate-pulse" />
          <h1 className="text-sm font-semibold tracking-wide text-zinc-100 flex items-center gap-2">
            Cognitive Resonance
            <span className="px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded text-[10px] font-mono border border-zinc-700/50">v{APP_VERSION}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {!app.isViewMode && (
            <button onClick={app.handleDownloadHistory} disabled={app.messages.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-400 disabled:opacity-30 disabled:cursor-not-allowed hover:text-white bg-zinc-800/30 hover:bg-zinc-800 rounded border border-zinc-800 transition-colors" title="Download Snapshot JSON">
              <Share2 className="w-3.5 h-3.5" /> Share
            </button>
          )}
          <button onClick={() => { clearApiKey(); app.setShowApiKeyModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-300 bg-zinc-800/30 hover:bg-zinc-800 rounded border border-zinc-800 transition-colors" title="Change API Key">
            🔑
          </button>
        </div>
      </header>

      <div className="flex h-full w-full bg-[#0a0a0a] text-zinc-100 font-sans overflow-hidden relative">
        {app.isDissonancePanelOpen && <div className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm" onClick={() => app.setIsDissonancePanelOpen(false)} />}

        {/* Left Sidebar: Dissonance */}
        <div className={cn("fixed inset-y-0 left-0 z-50 w-[85vw] sm:w-80 bg-zinc-950 lg:bg-zinc-900/30 border-r border-zinc-800/50 flex flex-col pt-[max(1.5rem,env(safe-area-inset-top))] px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:py-6 lg:px-6",
          "transform transition-transform duration-300 ease-in-out lg:relative lg:transform-none lg:z-auto",
          app.isDissonancePanelOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}>
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3"><Activity className="w-5 h-5 text-indigo-400" /><h2 className="font-medium tracking-wide text-zinc-100">Internal State</h2></div>
            <div className="flex items-center gap-2">
              {app.isViewingHistory && <button onClick={() => app.setSelectedTurnIndex(null)} className="text-xs bg-indigo-500/20 text-indigo-300 px-2.5 py-1.5 rounded-md hover:bg-indigo-500/30 transition-colors">Return to Current</button>}
              <button className="lg:hidden p-1.5 text-zinc-400 hover:text-zinc-100 bg-zinc-800/50 rounded-md" onClick={() => app.setIsDissonancePanelOpen(false)}><X className="w-4 h-4" /></button>
            </div>
          </div>
          <DissonanceMeter currentScore={app.activeState?.dissonanceScore ?? null} reason={app.activeState?.dissonanceReason ?? null} history={app.historyData} activeTurnIndex={app.activeTurnIndex} isViewingHistory={app.isViewingHistory} onSelectTurn={app.setSelectedTurnIndex} />
        </div>

        {/* Center: Chat */}
        <div className="flex-1 flex flex-col min-w-0 w-full lg:min-w-[400px] max-w-3xl mx-auto lg:border-x border-zinc-800/30 bg-[#0a0a0a] shadow-2xl z-10">
          <div className="p-4 lg:p-6 border-b border-zinc-800/50 flex items-center justify-between bg-zinc-900/20 backdrop-blur-md relative">
            <div className="flex items-center"><button className="lg:hidden p-2 -ml-2 text-zinc-400 hover:text-zinc-100" onClick={() => app.setIsDissonancePanelOpen(true)}><Activity className="w-5 h-5" /></button></div>
            <div className="flex items-center gap-3 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <BrainCircuit className="w-6 h-6 text-indigo-500" />
              <h1 className="text-lg lg:text-xl font-semibold tracking-tight whitespace-nowrap hidden sm:block">
                {app.isViewMode ? `Resonance History: ${app.historyFilename}` : 'Cognitive Resonance'}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {app.activeState?.tokenUsage?.totalTokenCount != null && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold tabular-nums transition-all border bg-zinc-800/50 text-zinc-400 border-zinc-700/50 shadow-inner" title={`Context Size: ${app.activeState.tokenUsage.totalTokenCount.toLocaleString()} tokens`}>
                  <Database className="w-3.5 h-3.5 opacity-70" />
                  {app.activeState.tokenUsage.totalTokenCount >= 1000 
                    ? `${(app.activeState.tokenUsage.totalTokenCount / 1000).toFixed(1)}k` 
                    : app.activeState.tokenUsage.totalTokenCount}
                </div>
              )}
              {app.activeState?.dissonanceScore != null && (
                <button onClick={() => app.setIsDissonancePanelOpen(true)} className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold tabular-nums transition-all border",
                  app.activeState.dissonanceScore <= 30 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                  app.activeState.dissonanceScore <= 60 ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                  "bg-red-500/10 text-red-400 border-red-500/20 animate-pulse"
                )} title={app.activeState.dissonanceReason || 'Dissonance Score'}>
                  <Activity className="w-3.5 h-3.5" />
                  {app.activeState.dissonanceScore}
                </button>
              )}
              <button className="lg:hidden p-2 -mr-2 text-zinc-400 hover:text-zinc-100" onClick={() => app.setIsRightSidebarOpen(true)}><Network className="w-5 h-5" /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {app.messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-4 px-8 text-center">
                <BrainCircuit className="w-12 h-12 opacity-20 mb-2" />
                <p className="text-sm font-medium text-zinc-400">Initiate conversation to observe internal state.</p>
                <div className="text-xs opacity-70 space-y-2 max-w-sm">
                  <p>💡 Tip: Save sessions using the Backup button. Your conversations are stored locally in this browser.</p>
                </div>
              </div>
            )}

            {app.messages.map((msg, idx) => (
              <div key={idx} id={`message-${idx}`} className={cn("flex w-full flex-col scroll-mt-24 min-w-0 break-words", msg.role === 'user' ? "items-end" : "items-start")}>
                {msg.isError ? (
                  <div className="max-w-[80%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed bg-red-950/60 text-red-200 border border-red-800/60 rounded-bl-sm">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-red-400 mb-1">Error</p>
                        <p className="break-words whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                    <button onClick={() => { navigator.clipboard.writeText(msg.content); app.setCopiedIndex(idx); setTimeout(() => app.setCopiedIndex(null), 2000); }}
                      className="mt-2.5 flex items-center gap-1.5 text-xs text-red-400/70 hover:text-red-300 transition-colors">
                      {app.copiedIndex === idx ? <><Check className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy error</>}
                    </button>
                  </div>
                ) : (
                  <div className={cn("max-w-[85%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed overflow-hidden break-words min-w-0",
                    msg.role === 'user' ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/20 rounded-br-sm" : "bg-zinc-800/80 text-zinc-200 border border-zinc-700/50 rounded-bl-sm prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:m-0 w-full"
                  )}>
                    {msg.role === 'model' && !msg.isError ? <MarkdownRenderer content={msg.content} /> : msg.content}
                  </div>
                )}
                {msg.role === 'model' && msg.modelTurnIndex !== undefined && !msg.isError && (
                  <button onClick={() => { app.setSelectedTurnIndex(msg.modelTurnIndex!); app.setIsDissonancePanelOpen(true); }}
                    className={cn("mt-2 text-xs font-medium transition-colors flex items-center gap-1.5 px-1",
                      app.activeTurnIndex === msg.modelTurnIndex ? "text-indigo-400" : "text-zinc-500 hover:text-zinc-300")}>
                    <Activity className="w-3.5 h-3.5" />
                    {app.activeTurnIndex === msg.modelTurnIndex ? "Viewing State" : "View State"}
                  </button>
                )}
              </div>
            ))}

            {app.isLoading && (
              <div className="flex justify-start">
                <div className="bg-zinc-800/80 border border-zinc-700/50 rounded-2xl rounded-bl-sm px-5 py-4 flex items-center gap-3">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  <span className="text-sm text-zinc-400">Processing cognitive state...</span>
                </div>
              </div>
            )}
            <div ref={app.messagesEndRef} />
          </div>

          {!app.isViewMode && (
            <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-zinc-900/50 border-t border-zinc-800/50 flex flex-col gap-2 relative z-20">
              <div className="flex items-center gap-2 px-1 pb-1">
                <button onClick={() => app.setIsGemSidebarOpen(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-zinc-800/40 hover:bg-zinc-800 text-indigo-300 border border-indigo-500/20 rounded-lg transition-colors shadow-sm" title="Manage Gems">
                  <Diamond className="w-3.5 h-3.5" />
                  {app.savedGems.find(g => g.id === app.activeGemId)?.name || 'Select Gem'}
                </button>
                <select value={app.selectedModel} onChange={(e) => app.setSelectedModel(e.target.value)}
                  className={cn("text-xs font-medium bg-transparent hover:bg-zinc-800/40 border border-transparent hover:border-zinc-700/50 rounded-lg px-2 py-1.5 cursor-pointer focus:outline-none transition-all max-w-[200px] truncate shadow-sm",
                    (!app.selectedModel || !app.chatModels.find(m => m.name.replace('models/', '') === app.selectedModel.replace('models/', ''))) ? 'text-red-400/90' : 'text-zinc-400'
                  )} title="Override model for this session">
                  {app.chatModels.length === 0 && <option value={app.selectedModel}>{app.selectedModel}</option>}
                  {app.chatModels.map((m: any) => { const val = m.name.replace('models/', ''); return <option key={val} value={val}>{m.displayName || val}</option>; })}
                </select>
              </div>

              {app.attachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 px-1">
                  {app.attachedFiles.map(f => (
                    <div key={f.id} className="flex items-center gap-2 bg-zinc-800/80 border border-zinc-700/50 rounded-lg px-2.5 py-1.5 text-xs group">
                      {f.preview ? <img src={f.preview} alt={f.name} className="w-8 h-8 rounded object-cover" /> : <FileText className="w-4 h-4 text-zinc-400" />}
                      <span className="text-zinc-300 max-w-[120px] truncate">{f.name}</span>
                      <button onClick={() => app.setAttachedFiles(prev => prev.filter(af => af.id !== f.id))} className="p-0.5 text-zinc-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={app.handleSubmit} className="relative flex items-center">
                <input type="file" ref={app.fileInputRef} onChange={app.handleFileSelect} multiple className="hidden" />
                <button type="button" onClick={() => app.fileInputRef.current?.click()} disabled={app.isLoading} className="p-2.5 text-zinc-400 hover:text-indigo-400 transition-colors disabled:opacity-40 shrink-0" title="Attach files">
                  <Paperclip className="w-4 h-4" />
                </button>
                <input type="text" value={app.input} onChange={(e) => app.setInput(e.target.value)} placeholder="Send a message..."
                  disabled={app.isLoading || !app.selectedModel}
                  className="w-full bg-zinc-950 border border-zinc-700/50 rounded-xl pl-4 pr-12 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all disabled:opacity-50" />
                <button type="submit" disabled={!app.input.trim() || app.isLoading || !app.selectedModel}
                  className="absolute right-2 p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:hover:bg-indigo-600">
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Right Sidebar: Semantic Graph */}
        {app.isRightSidebarOpen && <div className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm" onClick={() => app.setIsRightSidebarOpen(false)} />}
        <div className={cn("fixed inset-y-0 right-0 z-50 w-[85vw] sm:w-96 bg-zinc-950 lg:bg-zinc-900/30 border-l border-zinc-800/50 flex flex-col pt-[max(1.5rem,env(safe-area-inset-top))] px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:py-6 lg:px-6",
          "transform transition-transform duration-300 ease-in-out lg:relative lg:transform-none lg:z-auto",
          app.isRightSidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        )}>
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3"><Network className="w-5 h-5 text-indigo-400" /><h2 className="font-medium tracking-wide text-zinc-100">Semantic Markers</h2></div>
            <div className="flex items-center gap-2">
              <div className="flex bg-zinc-900/80 rounded-lg p-0.5 border border-zinc-800">
                <button onClick={() => app.setMarkerViewMode('graph')} className={cn("px-2.5 py-1 text-xs font-medium rounded-md transition-all", app.markerViewMode === 'graph' ? "bg-zinc-700/50 text-indigo-300 shadow-sm" : "text-zinc-500 hover:text-zinc-300")}>Graph</button>
                <button onClick={() => app.setMarkerViewMode('list')} className={cn("px-2.5 py-1 text-xs font-medium rounded-md transition-all", app.markerViewMode === 'list' ? "bg-zinc-700/50 text-indigo-300 shadow-sm" : "text-zinc-500 hover:text-zinc-300")}>List</button>
              </div>
              {app.isViewingHistory && <button onClick={() => app.setSelectedTurnIndex(null)} className="text-xs bg-indigo-500/20 text-indigo-300 px-2.5 py-1.5 rounded-md hover:bg-indigo-500/30 transition-colors">Return to Current</button>}
              <button className="lg:hidden p-1.5 text-zinc-400 hover:text-zinc-100 bg-zinc-800/50 rounded-md" onClick={() => app.setIsRightSidebarOpen(false)}><X className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="flex-1 flex flex-col min-h-0">
            <p className="text-xs text-zinc-500 mb-4 shrink-0">
              {app.isViewingHistory ? `Viewing semantic markers for turn ${app.activeTurnIndex + 1}.` : "Real-time visualization of concepts and their relationships currently active in the model's context window."}
            </p>
            {app.markerViewMode === 'graph' ? (
              <div className="flex-1 min-h-0 relative">
                <SemanticGraph nodes={app.activeState?.semanticNodes ?? []} edges={app.activeState?.semanticEdges ?? []}
                  onNodeClick={(nodeId) => {
                    const targetIdx = app.messages.findIndex(m => m.internalState?.semanticNodes?.some(n => n.id === nodeId));
                    if (targetIdx !== -1) {
                      const element = document.getElementById(`message-${targetIdx}`);
                      if (element) { element.scrollIntoView({ behavior: 'smooth', block: 'center' }); element.classList.add('bg-indigo-900/40', 'transition-colors', 'duration-500'); setTimeout(() => element.classList.remove('bg-indigo-900/40'), 2000); }
                    }
                  }} />
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                <input type="text" placeholder="Filter markers..." value={app.markerSearchQuery} onChange={(e) => app.setMarkerSearchQuery(e.target.value)}
                  className="w-full bg-zinc-900/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/80 mb-3 shrink-0" />
                <div className="flex-1 overflow-y-auto pr-2 space-y-1">
                  {app.filteredMarkers.length === 0 && <div className="text-zinc-500 text-xs text-center py-4">No markers found.</div>}
                  {app.filteredMarkers.map(m => (
                    <div key={m.name} onClick={() => { app.setHistorySearchQuery(m.name); app.setActiveSidebarTab('search'); app.setIsHistorySidebarOpen(true); }}
                      className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/30 border border-transparent hover:border-zinc-700/50 hover:bg-zinc-800/50 cursor-pointer group transition-colors">
                      <span className="text-xs text-zinc-300 font-medium truncate pr-2 group-hover:text-indigo-300 transition-colors">{m.name}</span>
                      <span className="text-[10px] font-mono bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500 group-hover:bg-indigo-500/10 group-hover:text-indigo-400 transition-colors shrink-0">{m.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Gem Sidebar */}
        {app.isGemSidebarOpen && <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={() => app.setIsGemSidebarOpen(false)} />}
        <div className={cn("fixed top-0 right-0 bottom-0 w-[340px] bg-zinc-900 border-l border-zinc-800/50 shadow-2xl z-50 transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
          app.isGemSidebarOpen ? "translate-x-0" : "translate-x-full"
        )}>
          <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
            <div className="flex items-center gap-2"><Diamond className="w-4 h-4 text-indigo-400" /><h2 className="text-sm font-semibold tracking-wide text-zinc-200">Gems</h2></div>
            <button onClick={() => { app.setIsGemSidebarOpen(false); app.setEditingGem(null); app.setCreatingGem(false); }} className="text-zinc-500 hover:text-white transition-colors p-1"><X className="w-4 h-4" /></button>
          </div>

          {app.editingGem || app.creatingGem ? (
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-2">
                <button onClick={() => { app.setEditingGem(null); app.setCreatingGem(false); }} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
                {app.creatingGem ? 'New Custom Gem' : 'Edit Gem'}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-400 ml-1">Name</label>
                <input type="text" value={app.editingGem ? app.editingGem.name : app.draftGem.name} onChange={(e) => app.editingGem ? app.setEditingGem({...app.editingGem, name: e.target.value}) : app.setDraftGem({...app.draftGem, name: e.target.value})}
                  placeholder="E.g. Code Reviewer" className="w-full bg-zinc-950/50 text-sm text-zinc-200 border border-zinc-700/50 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500/50" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-400 ml-1">Base Model</label>
                <select value={app.editingGem ? app.editingGem.model : app.draftGem.model} onChange={(e) => app.editingGem ? app.setEditingGem({...app.editingGem, model: e.target.value}) : app.setDraftGem({...app.draftGem, model: e.target.value})}
                  className="w-full bg-zinc-950/50 text-sm text-zinc-200 border border-zinc-700/50 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500/50">
                  {app.chatModels.map((m: any) => { const val = m.name.replace('models/', ''); return <option key={val} value={val}>{m.displayName || val}</option>; })}
                </select>
              </div>
              <div className="space-y-1.5 flex-1 flex flex-col">
                <label className="text-xs font-semibold text-zinc-400 ml-1">System Prompt</label>
                <textarea value={app.editingGem ? app.editingGem.systemPrompt : app.draftGem.systemPrompt} onChange={(e) => app.editingGem ? app.setEditingGem({...app.editingGem, systemPrompt: e.target.value}) : app.setDraftGem({...app.draftGem, systemPrompt: e.target.value})}
                  placeholder="You are an expert..." className="w-full bg-zinc-950/50 text-xs text-zinc-300 border border-zinc-700/50 rounded-lg px-3 py-2.5 flex-1 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 font-mono resize-none min-h-[200px]" />
              </div>
              <div className="pt-2">
                <button onClick={() => { if (app.editingGem) app.handleSaveGem(app.editingGem); else app.handleSaveGem({ id: 'gem-' + Date.now(), name: app.draftGem.name || 'Unnamed', model: app.draftGem.model, systemPrompt: app.draftGem.systemPrompt }); }}
                  disabled={app.editingGem ? !app.editingGem.name : !app.draftGem.name}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">Save Gem</button>
              </div>
            </div>
          ) : (
            <>
              <div className="p-3">
                <button onClick={() => { app.setCreatingGem(true); app.setDraftGem({ name: '', model: 'gemini-2.5-flash', systemPrompt: '' }); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm font-medium transition-all">
                  <Plus className="w-4 h-4" /> Create Custom Gem
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2 mt-1">
                {app.savedGems.map(g => (
                  <div key={g.id} onClick={() => app.handleSelectGem(g.id)}
                    className={cn("group relative px-3 py-3 rounded-lg cursor-pointer transition-colors border flex flex-col gap-1",
                      app.activeGemId === g.id ? "bg-indigo-900/20 border-indigo-500/40 shadow-sm" : "bg-zinc-800/20 border-zinc-800/80 hover:bg-zinc-800/50")}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold text-zinc-200">{g.name}</div>
                        {g.isBuiltIn && <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-zinc-800 text-zinc-400">Built-in</span>}
                      </div>
                      <div className="flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => app.handleSetDefaultGem(g.id, e)} className={cn("p-1.5 rounded-md transition-colors", app.defaultGemId === g.id ? "text-amber-400" : "text-zinc-500 hover:text-amber-400 hover:bg-amber-400/10")} title="Set as Default">
                          <Star className="w-3.5 h-3.5" fill={app.defaultGemId === g.id ? "currentColor" : "none"} />
                        </button>
                        {!g.isBuiltIn && (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); app.setEditingGem(g); }} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-md transition-colors"><Edit3 className="w-3.5 h-3.5" /></button>
                            <button onClick={(e) => app.handleDeleteGem(g.id, e)} className="p-1.5 text-red-500/70 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
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
    </div>
  );
}
